import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError } from "@/lib/supabase/admin";
import { getDecryptedYouthProfile } from "@/server/auth/youth-profile";
import {
  calculateMatchScore,
  fromCachedMatchRow,
  isMatchCacheValid,
  toMatchResultRow,
  type CachedMatchResultRow,
} from "@/server/matching/score";
import { generateLlmReason } from "@/server/matching/reason";
import { evaluateJobPolicy } from "@/server/policy/evaluate";
import { getEvaluatedMonthKST, getTodayKST } from "@/server/auth/crypto";
import { TAXONOMY_VERSION } from "@/contracts/taxonomy";
import type { CategoryId, JobMatchingJson } from "@/contracts/matching";
import type { CompanySummary, JobDetailResponse } from "@/contracts/api";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const session = await requireUser();
  if (!session) {
    return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  }

  const { jobId } = await context.params;
  if (!jobId) {
    return jsonError(400, "INVALID_JOB_ID", "공고 ID가 필요합니다.");
  }

  const userId = session.user.id;
  const admin = createAdminClient();

  const profile = await getDecryptedYouthProfile(admin, userId, session.user.email);
  if (!profile) {
    return jsonError(409, "ONBOARDING_REQUIRED", "온보딩을 먼저 완료해주세요.");
  }

  // 1. Fetch job with company & categories
  const { data: jobRow, error: jobErr } = await admin
    .from("jobs")
    .select(`
      id,
      title,
      position_raw,
      preferred,
      employment_type_raw,
      employment_kind,
      career_req,
      education_req,
      salary,
      work_address,
      work_gu,
      deadline,
      status,
      source,
      industry,
      raw_text,
      matching_json,
      job_version,
      crawled_at,
      companies (
        id,
        name,
        business_desc,
        gu,
        is_demo
      ),
      job_post_categories (
        category_slug
      )
    `)
    .eq("id", jobId)
    .eq("match_status", "verified")
    .single();

  if (jobErr || !jobRow) {
    return jsonError(404, "JOB_NOT_FOUND", "존재하지 않는 채용공고입니다.");
  }

  // 2. Check if user already applied
  const { data: existingApp } = await admin
    .from("applications")
    .select("id")
    .eq("youth_user_id", userId)
    .eq("job_id", jobId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const companyRow = (jobRow.companies as any) || {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categoryRows = (jobRow.job_post_categories as any[]) || [];
  const categories = categoryRows.map((c) => c.category_slug as CategoryId);
  const isParticipating = Boolean(companyRow.is_demo);

  const isApplied = Boolean(existingApp);
  const todayKST = getTodayKST();
  const deadlineStr = jobRow.deadline ? String(jobRow.deadline) : null;
  const isClosed = jobRow.status === "closed" || (deadlineStr != null && deadlineStr < todayKST);
  const hasResume = profile.resume?.matching_json != null;

  let canApply = true;
  let applyBlockReason:
    | "already_applied"
    | "closed"
    | "company_not_participating"
    | "resume_required"
    | null = null;

  if (isApplied) {
    canApply = false;
    applyBlockReason = "already_applied";
  } else if (isClosed) {
    canApply = false;
    applyBlockReason = "closed";
  } else if (!isParticipating) {
    canApply = false;
    applyBlockReason = "company_not_participating";
  } else if (!hasResume) {
    canApply = false;
    applyBlockReason = "resume_required";
  }

  const company: CompanySummary = {
    id: companyRow.id || "",
    name: companyRow.name || "강소기업",
    industry: jobRow.industry || companyRow.business_desc || null,
    gu: companyRow.gu || null,
    is_demo: isParticipating,
    participation: isParticipating ? "participating" : "non_participating",
  };

  const evaluatedMonth = getEvaluatedMonthKST();
  const resumeJson = profile.resume?.matching_json || null;
  const jobVersion = jobRow.job_version || 1;

  // 3. Check match_results cache first
  let cachedRow: CachedMatchResultRow | null = null;
  if (hasResume) {
    const { data } = await admin
      .from("match_results")
      .select("*")
      .eq("youth_user_id", userId)
      .eq("job_id", jobId)
      .maybeSingle();
    cachedRow = (data as CachedMatchResultRow | null) ?? null;
  }

  let match;
  let shouldUpsertCache = false;

  if (
    hasResume &&
    isMatchCacheValid(cachedRow, {
      profileVersion: profile.profile_version,
      jobVersion,
      taxonomyVersion: TAXONOMY_VERSION,
      evaluatedMonth,
    })
  ) {
    const cachedMatch = fromCachedMatchRow(cachedRow);
    if (!isClosed && cachedMatch.recommendable && !cachedMatch.reason && resumeJson && cachedMatch.breakdown) {
      match = {
        ...cachedMatch,
        reason: await generateLlmReason({
          companyName: company.name,
          jobTitle: jobRow.title,
          jobRawText: jobRow.raw_text,
          resume: resumeJson,
          breakdown: cachedMatch.breakdown,
        }),
      };
      shouldUpsertCache = true;
    } else {
      match = isClosed ? { ...cachedMatch, reason: null } : cachedMatch;
    }
  } else {
    const baseMatch = calculateMatchScore({
      desiredCategories: profile.desired_categories,
      resume: resumeJson,
      job: jobRow.matching_json as JobMatchingJson | null,
      profileVersion: profile.profile_version,
      jobVersion,
      taxonomyVersion: TAXONOMY_VERSION,
      evaluatedMonth,
    });

    match =
      !isClosed && baseMatch.recommendable && resumeJson && baseMatch.breakdown
        ? {
            ...baseMatch,
            reason: await generateLlmReason({
              companyName: company.name,
              jobTitle: jobRow.title,
              jobRawText: jobRow.raw_text,
              resume: resumeJson,
              breakdown: baseMatch.breakdown,
            }),
          }
        : baseMatch;
    shouldUpsertCache = hasResume && match.status === "ready";
  }

  if (shouldUpsertCache) {
    const rowToSave = toMatchResultRow({ youthUserId: userId, jobId, match });
    if (rowToSave) {
      const { error: cacheUpsertErr } = await admin
        .from("match_results")
        .upsert(rowToSave, { onConflict: "youth_user_id,job_id" });
      if (cacheUpsertErr) {
        console.error("Failed to upsert match_results in job detail:", cacheUpsertErr);
      }
    }
  }

  const policy = evaluateJobPolicy({
    age: profile.age,
    birthDate: profile.birth_date,
    sido: profile.address.sido,
    employment_kind: jobRow.employment_kind,
  });

  const response: JobDetailResponse = {
    job_id: jobRow.id,
    company,
    title: jobRow.title,
    categories,
    employment_kind: jobRow.employment_kind || "unknown",
    location: jobRow.work_address || (jobRow.work_gu ? `서울시 ${jobRow.work_gu}` : null),
    deadline: deadlineStr,
    is_closed: isClosed,
    applied: isApplied,
    can_apply: canApply,
    apply_block_reason: applyBlockReason,
    external_url: jobRow.source || null,
    match,
    policy,
    position_raw: jobRow.position_raw || null,
    preferred: jobRow.preferred || null,
    employment_type_raw: jobRow.employment_type_raw || null,
    career_req: jobRow.career_req || null,
    education_req: jobRow.education_req || null,
    salary: jobRow.salary || null,
    company_industry: jobRow.industry || companyRow.business_desc || null,
    crawled_at: jobRow.crawled_at || null,
    matching_json: jobRow.matching_json as JobMatchingJson | null,
  };

  return NextResponse.json(response);
}
