import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError } from "@/lib/supabase/admin";

// F01: GET /api/applications/[applicationId]/resume — 지원 당시 이력서 PDF 스트리밍
// 매 요청마다 세션 + (지원 본인 OR 해당 공고 소유 기업) 권한을 재확인하고
// 지원 시점 resume_version_id의 PDF를 비공개 Storage에서 스트리밍한다.
export async function GET(_request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  const { applicationId } = await params;

  const auth = await requireUser();
  if (!auth) return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  const { user } = auth;

  const admin = createAdminClient();

  // 지원 조회
  const { data: app } = await admin
    .from("applications")
    .select("id, youth_user_id, job_id, resume_version_id")
    .eq("id", applicationId)
    .maybeSingle();
  if (!app) return jsonError(404, "APPLICATION_NOT_FOUND", "존재하지 않는 지원입니다.");

  // 권한: 지원 본인 또는 해당 공고 소유 기업
  let allowed = app.youth_user_id === user.id;
  if (!allowed) {
    const { data: job } = await admin
      .from("jobs")
      .select("company_id")
      .eq("id", app.job_id)
      .maybeSingle();
    if (job?.company_id) {
      const { data: link } = await admin
        .from("company_accounts")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("company_id", job.company_id)
        .maybeSingle();
      allowed = Boolean(link);
    }
  }
  if (!allowed) {
    return jsonError(403, "APPLICATION_ACCESS_DENIED", "이 이력서를 열람할 권한이 없습니다.");
  }

  // 지원 시점 이력서 버전 (파일 경로/원본 파일명)
  const { data: resume } = await admin
    .from("resume_versions")
    .select("storage_path, original_filename")
    .eq("id", app.resume_version_id)
    .maybeSingle();
  if (!resume) return jsonError(404, "RESUME_NOT_FOUND", "이력서 파일을 찾을 수 없습니다.");

  // 비공개 Storage에서 다운로드 후 스트리밍
  const { data: blob, error: dlErr } = await admin.storage.from("resumes").download(resume.storage_path);
  if (dlErr || !blob) {
    return jsonError(404, "RESUME_NOT_FOUND", "이력서 파일을 찾을 수 없습니다.");
  }

  return new Response(blob, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(resume.original_filename)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
