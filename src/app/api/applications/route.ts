import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError, verifySameOrigin } from "@/lib/supabase/admin";
import { getDecryptedYouthProfile } from "@/server/auth/youth-profile";
import { evaluateJobPolicy, POLICY_RULE_VERSION } from "@/server/policy/evaluate";
import { buildResumeSummary, fallbackMatchResult, matchRowToResult } from "@/server/applications/snapshot";
import {
  calculateMatchScore,
  isMatchCacheValid,
  toMatchResultRow,
  type CachedMatchResultRow,
} from "@/server/matching/score";
import { generateLlmReason } from "@/server/matching/reason";
import { getEvaluatedMonthKST, getTodayKST } from "@/server/auth/crypto";
import { TAXONOMY_VERSION } from "@/contracts/taxonomy";
import type { ApplyResponse } from "@/contracts/api";
import type { JobMatchingJson, MatchResult, ResumeMatchingJson } from "@/contracts/matching";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ApplySchema = z.object({ job_id: z.string().regex(UUID_RE, "job_id must be a UUID") });

// Y07: POST /api/applications — 공고 지원 (지원 시점 스냅샷 영구 고정)
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth) return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  const { user } = auth;

  // 쿠키 인증 상태 변경 요청의 CSRF 방어: Origin == 앱 origin 대조
  if (!verifySameOrigin(request)) {
    return jsonError(403, "ORIGIN_FORBIDDEN", "요청 출처가 올바르지 않습니다.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "VALIDATION_ERROR", "요청 본문이 올바른 JSON이 아닙니다.");
  }
  const parsed = ApplySchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(400, "VALIDATION_ERROR", "job_id가 올바르지 않습니다.");
  }
  const { job_id } = parsed.data;

  const admin = createAdminClient();

  // 1) 온보딩 확인 (청년 프로필 + 현재 이력서 포함 복호화)
  const profile = await getDecryptedYouthProfile(admin, user.id, user.email ?? "");
  if (!profile) {
    return jsonError(409, "ONBOARDING_REQUIRED", "청년 온보딩을 먼저 완료해주세요.");
  }

  // 2) 중복 지원 확인 (마감/이력서 검증보다 우선해 기존 지원 200 반환)
  const { data: existing } = await admin
    .from("applications")
    .select("id")
    .eq("youth_user_id", user.id)
    .eq("job_id", job_id)
    .maybeSingle();
  if (existing) {
    const dup: ApplyResponse = { application_id: existing.id, already_applied: true };
    return NextResponse.json(dup, { status: 200, headers: { "Cache-Control": "private, no-store" } });
  }

  // 3) 공고 및 소속 기업 참여 여부 확인 (검증 공고 + 참여 기업만 서비스 내 지원 가능)
  const { data: job } = await admin
    .from("jobs")
    .select("id, company_id, company_name, title, status, deadline, employment_kind, job_version, match_status, raw_text, matching_json, companies(is_demo)")
    .eq("id", job_id)
    .eq("match_status", "verified")
    .maybeSingle();
  if (!job) return jsonError(404, "JOB_NOT_FOUND", "존재하지 않는 채용공고이거나 비공개 공고입니다.");

  // 4) 마감 확인 (KST 기준, status=open & deadline)
  const todayKST = getTodayKST();
  const isClosed = job.status !== "open" || (job.deadline != null && job.deadline < todayKST);
  if (isClosed) return jsonError(409, "POSTING_CLOSED", "마감된 공고입니다.");

  // 4-1) 기업 참여 여부 확인 (미참여 기업 공고는 외부 지원 링크로 이동해야 함)
  const companyRel = Array.isArray(job.companies) ? job.companies[0] : job.companies;
  if (!companyRel?.is_demo) {
    return jsonError(403, "COMPANY_NOT_PARTICIPATING", "플랫폼 미참여 기업입니다. 외부 지원 링크를 이용해 주세요.");
  }

  // 5) 이력서 확인 (현재 연결된 이력서 없으면 지원 불가)
  if (!profile.resume) {
    return jsonError(400, "RESUME_REQUIRED", "이력서를 먼저 등록해주세요.");
  }

  // 6) 지원 시점 스냅샷 조립
  const resumeMatchingJson = profile.resume.matching_json as ResumeMatchingJson | null;
  const jobMatchingJson = job.matching_json as JobMatchingJson | null;
  const jobVersion = job.job_version || 1;
  const evaluatedMonth = getEvaluatedMonthKST();

  const applicant_snapshot = {
    name: profile.name,
    age: profile.age,
    address: profile.address,
    email: profile.email,
    resume_summary: buildResumeSummary(resumeMatchingJson),
  };

  // fit_snapshot: match_results 캐시(5개 버전·월 키 일치) 재사용, 미스 시 즉시 calculateMatchScore 계산 및 캐시 저장
  const { data: cache } = await admin
    .from("match_results")
    .select("*")
    .eq("youth_user_id", user.id)
    .eq("job_id", job_id)
    .maybeSingle();

  const cachedRow = (cache as CachedMatchResultRow | null) ?? null;
  let fit_snapshot: MatchResult;

  if (
    isMatchCacheValid(cachedRow, {
      profileVersion: profile.profile_version,
      jobVersion,
      taxonomyVersion: TAXONOMY_VERSION,
      evaluatedMonth,
    })
  ) {
    const cachedMatch = matchRowToResult(cachedRow);
    if (cachedMatch.recommendable && !cachedMatch.reason && resumeMatchingJson && cachedMatch.breakdown) {
      fit_snapshot = {
        ...cachedMatch,
        reason: await generateLlmReason({
          companyName: job.company_name,
          jobTitle: job.title,
          jobRawText: job.raw_text,
          resume: resumeMatchingJson,
          breakdown: cachedMatch.breakdown,
        }),
      };
      const rowToSave = toMatchResultRow({ youthUserId: user.id, jobId: job_id, match: fit_snapshot });
      if (rowToSave) {
        await admin.from("match_results").upsert(rowToSave, { onConflict: "youth_user_id,job_id" });
      }
    } else {
      fit_snapshot = cachedMatch;
    }
  } else if (resumeMatchingJson && jobMatchingJson) {
    const computed = calculateMatchScore({
      desiredCategories: profile.desired_categories,
      resume: resumeMatchingJson,
      job: jobMatchingJson,
      profileVersion: profile.profile_version,
      jobVersion,
      taxonomyVersion: TAXONOMY_VERSION,
      evaluatedMonth,
    });
    fit_snapshot =
      computed.recommendable && computed.breakdown
        ? {
            ...computed,
            reason: await generateLlmReason({
              companyName: job.company_name,
              jobTitle: job.title,
              jobRawText: job.raw_text,
              resume: resumeMatchingJson,
              breakdown: computed.breakdown,
            }),
          }
        : computed;

    const rowToSave = toMatchResultRow({ youthUserId: user.id, jobId: job_id, match: fit_snapshot });
    if (rowToSave) {
      await admin.from("match_results").upsert(rowToSave, { onConflict: "youth_user_id,job_id" });
    }
  } else if (profile.resume.extraction_status === "failed") {
    fit_snapshot = {
      ...fallbackMatchResult(profile.profile_version, jobVersion),
      status: "failed",
    };
  } else {
    fit_snapshot = fallbackMatchResult(profile.profile_version, jobVersion);
  }

  const policy_snapshot = evaluateJobPolicy({
    age: profile.age,
    birthDate: profile.birth_date,
    sido: profile.address.sido,
    employment_kind: job.employment_kind,
  });

  // 7) 지원 insert — 동시 연타 시 UNIQUE(23505) 충돌이면 기존 행 200 반환
  const { data: inserted, error: insertErr } = await admin
    .from("applications")
    .insert({
      youth_user_id: user.id,
      job_id,
      resume_version_id: profile.resume.resume_id,
      applicant_snapshot,
      fit_snapshot,
      desired_categories_snapshot: profile.desired_categories,
      policy_snapshot,
      policy_rule_version: POLICY_RULE_VERSION,
      policy_evaluated_on: todayKST,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: raced } = await admin
        .from("applications")
        .select("id")
        .eq("youth_user_id", user.id)
        .eq("job_id", job_id)
        .maybeSingle();
      if (raced) {
        const dup: ApplyResponse = { application_id: raced.id, already_applied: true };
        return NextResponse.json(dup, { status: 200, headers: { "Cache-Control": "private, no-store" } });
      }
    }
    return jsonError(500, "INTERNAL_ERROR", "지원 저장 중 오류가 발생했습니다.");
  }

  const created: ApplyResponse = { application_id: inserted.id, already_applied: false };
  return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
