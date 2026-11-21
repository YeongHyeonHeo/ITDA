import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError } from "@/lib/supabase/admin";
import { getTodayKST } from "@/server/auth/crypto";
import { evaluateJobIncentivePolicy } from "@/server/policy/evaluate";
import type { CompanyOverviewResponse, CompanySummary } from "@/contracts/api";

// C01: GET /api/company/overview — 자사 공고·지원자 수 요약
export async function GET() {
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

  // 연결된 기업
  const { data: links } = await admin
    .from("company_accounts")
    .select("company_id")
    .eq("user_id", user.id);
  const companyIds = (links ?? []).map((l) => l.company_id as string);

  if (companyIds.length === 0) {
    return NextResponse.json({ companies: [] } satisfies CompanyOverviewResponse, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const { data: companies } = await admin
    .from("companies")
    .select("id, name, business_desc, gu, is_demo")
    .in("id", companyIds);

  // 자사 검증 공고 전체
  const { data: jobs } = await admin
    .from("jobs")
    .select("id, company_id, title, status, deadline, employment_kind, employment_type_raw")
    .in("company_id", companyIds)
    .eq("match_status", "verified");

  // 공고별 지원자 수 집계 (단일 조회 후 JS 집계)
  const jobIds = (jobs ?? []).map((j) => j.id as string);
  const applicantCount = new Map<string, number>();
  if (jobIds.length > 0) {
    const { data: apps } = await admin.from("applications").select("job_id").in("job_id", jobIds);
    for (const a of apps ?? []) {
      applicantCount.set(a.job_id, (applicantCount.get(a.job_id) ?? 0) + 1);
    }
  }

  const todayKST = getTodayKST();
  const body: CompanyOverviewResponse = {
    companies: (companies ?? []).map((c) => {
      const company: CompanySummary = {
        id: c.id,
        name: c.name,
        industry: c.business_desc ?? null, // companies 테이블엔 업종 전용 컬럼이 없어 사업내용으로 대체
        gu: c.gu ?? null,
        is_demo: c.is_demo,
      };
      const companyJobs = (jobs ?? [])
        .filter((j) => j.company_id === c.id)
        .map((j) => ({
          job_id: j.id,
          title: j.title,
          is_closed: j.status !== "open" || (j.deadline != null && j.deadline < todayKST),
          applicant_count: applicantCount.get(j.id) ?? 0,
          job_policy: evaluateJobIncentivePolicy({
            employment_kind: j.employment_kind,
            employment_type_raw: j.employment_type_raw,
          }),
        }));
      return { company, jobs: companyJobs };
    }),
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
