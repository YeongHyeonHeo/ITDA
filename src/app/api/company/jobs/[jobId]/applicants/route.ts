import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError } from "@/lib/supabase/admin";
import { evaluateJobIncentivePolicy } from "@/server/policy/evaluate";
import type { Applicant, ApplicantsResponse, PolicyResult, PolicyStatus } from "@/contracts/api";
import type { CategoryId, MatchResult } from "@/contracts/matching";

const POLICY_FILTERS = ["all", "eligible", "needs_check", "ineligible"] as const;
type PolicyFilter = (typeof POLICY_FILTERS)[number];

// C02: GET /api/company/jobs/[jobId]/applicants?policy=all — 자사 공고 지원자 목록/필터
export async function GET(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;

  const auth = await requireUser();
  if (!auth) return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  const { user } = auth;

  const admin = createAdminClient();

  // 역할 확인
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profile?.role !== "company") {
    return jsonError(403, "ROLE_FORBIDDEN", "기업 계정만 접근할 수 있습니다.");
  }

  // 공고 존재 확인
  const { data: job } = await admin
    .from("jobs")
    .select("id, title, company_id, employment_kind, employment_type_raw")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return jsonError(404, "JOB_NOT_FOUND", "존재하지 않는 공고입니다.");

  // 소유 기업 확인
  const { data: link } = await admin
    .from("company_accounts")
    .select("company_id")
    .eq("user_id", user.id)
    .eq("company_id", job.company_id)
    .maybeSingle();
  if (!link) return jsonError(403, "COMPANY_ACCESS_DENIED", "다른 기업의 공고입니다.");

  // policy 쿼리 검증
  const policyParam = new URL(request.url).searchParams.get("policy") ?? "all";
  if (!POLICY_FILTERS.includes(policyParam as PolicyFilter)) {
    return jsonError(400, "VALIDATION_ERROR", "policy 값이 올바르지 않습니다.");
  }
  const policy = policyParam as PolicyFilter;

  // 해당 공고 지원자 전체
  const { data: rows } = await admin
    .from("applications")
    .select("id, created_at, applicant_snapshot, fit_snapshot, policy_snapshot, desired_categories_snapshot")
    .eq("job_id", jobId);

  const all = rows ?? [];

  // 필터 전 전체 기준 counts (eligible + needs_check + ineligible === all)
  const counts = { all: all.length, eligible: 0, needs_check: 0, ineligible: 0 };
  for (const r of all) {
    const st = (r.policy_snapshot as PolicyResult | null)?.status as PolicyStatus | undefined;
    if (st === "eligible") counts.eligible++;
    else if (st === "ineligible") counts.ineligible++;
    else counts.needs_check++; // needs_check 및 누락은 needs_check로 집계
  }

  // 필터 적용
  const filtered =
    policy === "all"
      ? all
      : all.filter((r) => {
          const st = (r.policy_snapshot as PolicyResult | null)?.status;
          return (st ?? "needs_check") === policy;
        });

  // 정렬: score DESC (null 마지막) → created_at ASC → id ASC
  filtered.sort((a, b) => {
    const sa = (a.fit_snapshot as MatchResult | null)?.score;
    const sb = (b.fit_snapshot as MatchResult | null)?.score;
    if (sa != null && sb != null && sa !== sb) return sb - sa;
    if (sa == null && sb != null) return 1;
    if (sa != null && sb == null) return -1;
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  const applicants: Applicant[] = filtered.map((r) => {
    const snap = (r.applicant_snapshot ?? {}) as {
      name?: string;
      age?: number;
      address?: { sido: string; sigungu: string };
      email?: string;
      resume_summary?: Applicant["resume_summary"];
    };
    return {
      application_id: r.id,
      name: snap.name ?? "",
      age: snap.age ?? 0,
      address: snap.address ?? { sido: "", sigungu: "" },
      email: snap.email ?? "",
      desired_categories: (r.desired_categories_snapshot ?? []) as CategoryId[],
      resume_summary: snap.resume_summary ?? null,
      match_snapshot: r.fit_snapshot as unknown as MatchResult,
      policy_snapshot: r.policy_snapshot as unknown as PolicyResult,
      resume_url: `/api/applications/${r.id}/resume`,
      applied_at: r.created_at,
    };
  });

  const body: ApplicantsResponse = {
    job: {
      job_id: job.id,
      title: job.title,
      job_policy: evaluateJobIncentivePolicy({
        employment_kind: job.employment_kind,
        employment_type_raw: job.employment_type_raw,
      }),
    },
    counts,
    applicants,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
