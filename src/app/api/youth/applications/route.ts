import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError } from "@/lib/supabase/admin";
import type { ApplicationSummary, ApplicationsResponse, PolicyResult } from "@/contracts/api";
import type { MatchResult } from "@/contracts/matching";

// Y08: GET /api/youth/applications — 본인 지원 내역 (지원 당시 스냅샷)
export async function GET() {
  const auth = await requireUser();
  if (!auth) return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  const { user } = auth;

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("applications")
    .select("id, job_id, created_at, fit_snapshot, policy_snapshot, jobs(title, company_name)")
    .eq("youth_user_id", user.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });

  if (error) {
    return jsonError(500, "INTERNAL_ERROR", "지원 내역 조회 중 오류가 발생했습니다.");
  }

  const applications: ApplicationSummary[] = (rows ?? []).map((row) => {
    const jobRel = Array.isArray(row.jobs) ? row.jobs[0] : row.jobs;
    return {
      application_id: row.id,
      job_id: row.job_id,
      title: jobRel?.title ?? "",
      company_name: jobRel?.company_name ?? "",
      applied_at: row.created_at,
      match_snapshot: row.fit_snapshot as unknown as MatchResult,
      policy_snapshot: row.policy_snapshot as unknown as PolicyResult,
      resume_url: `/api/applications/${row.id}/resume`,
    };
  });

  const body: ApplicationsResponse = { applications };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
