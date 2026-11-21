import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError, verifySameOrigin } from "@/lib/supabase/admin";
import { extractResumeMatchingJson, extractTextFromPdf } from "@/server/resumes/extract";
import type { ResumeResponse } from "@/contracts/api";
import type { ResumeMatchingJson } from "@/contracts/matching";

const MAX_BYTES = 5 * 1024 * 1024;

export async function PUT(request: Request) {
  if (!verifySameOrigin(request)) {
    return jsonError(403, "ORIGIN_FORBIDDEN", "요청 출처가 올바르지 않습니다.");
  }

  const session = await requireUser();
  if (!session) return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");

  let file: File | null = null;
  try {
    const formData = await request.formData();
    const f = formData.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return jsonError(400, "VALIDATION_ERROR", "multipart/form-data 요청이 필요합니다.");
  }
  if (!file) return jsonError(400, "VALIDATION_ERROR", "PDF 이력서 파일(file)이 필요합니다.");

  if (file.size > MAX_BYTES) {
    return jsonError(413, "FILE_TOO_LARGE", "이력서 파일은 최대 5MiB입니다.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return jsonError(415, "UNSUPPORTED_FILE_TYPE", "PDF 파일만 업로드할 수 있습니다.");
  }

  const userId = session.user.id;
  const admin = createAdminClient();

  const { data: youth } = await admin
    .from("youth_profiles")
    .select("profile_version")
    .eq("user_id", userId)
    .maybeSingle();
  if (!youth) return jsonError(409, "ONBOARDING_REQUIRED", "온보딩을 먼저 완료해주세요.");

  // 텍스트 추출 (비어 있으면 기존 현재 이력서를 유지한 채 거절)
  let rawText = "";
  try {
    rawText = await extractTextFromPdf(buffer);
  } catch {
    rawText = "";
  }
  if (rawText.replace(/\s+/g, "").length === 0) {
    return jsonError(400, "PDF_TEXT_EMPTY", "텍스트를 추출할 수 없는 PDF입니다. 스캔본은 지원하지 않습니다.");
  }

  const resumeId = crypto.randomUUID();
  const storagePath = `${userId}/${resumeId}.pdf`;

  const { error: uploadError } = await admin.storage
    .from("resumes")
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });
  if (uploadError) {
    console.error("Storage upload error:", uploadError);
    return jsonError(503, "RESUME_SAVE_FAILED", "이력서 파일 저장에 실패했습니다.");
  }

  // AI 정제: 실패해도 PDF와 행은 failed 상태로 저장하고 200 반환
  let matchingJson: ResumeMatchingJson | null = null;
  let extractionError: string | null = null;
  try {
    matchingJson = await extractResumeMatchingJson(rawText);
  } catch (err) {
    console.error("Resume extraction failed:", err);
    extractionError = "이력서 분석에 실패했습니다.";
  }
  const extractionStatus = matchingJson ? "completed" : "failed";

  const { data: inserted, error: insertErr } = await admin
    .from("resume_versions")
    .insert({
      id: resumeId,
      youth_user_id: userId,
      storage_path: storagePath,
      original_filename: file.name.slice(0, 255),
      matching_json: matchingJson,
      resume_text: rawText,
      extraction_status: extractionStatus,
      extraction_error: extractionError,
    })
    .select()
    .single();

  if (insertErr || !inserted) {
    console.error("DB resume insertion error:", insertErr);
    await admin.storage.from("resumes").remove([storagePath]); // 고아 파일 정리
    return jsonError(503, "RESUME_SAVE_FAILED", "이력서 데이터 저장에 실패했습니다.");
  }

  const newVersion = youth.profile_version + 1;
  const { error: linkErr } = await admin
    .from("youth_profiles")
    .update({
      current_resume_id: resumeId,
      profile_version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (linkErr) {
    console.error("Profile link error:", linkErr);
    await admin.from("resume_versions").delete().eq("id", resumeId);
    await admin.storage.from("resumes").remove([storagePath]);
    return jsonError(503, "RESUME_SAVE_FAILED", "이력서 연결에 실패했습니다.");
  }

  await admin.from("match_results").delete().eq("youth_user_id", userId);

  const body: ResumeResponse = {
    resume_id: inserted.id,
    filename: inserted.original_filename,
    uploaded_at: inserted.created_at,
    extraction_status: inserted.extraction_status,
    extraction_error: extractionError
      ? { code: "EXTRACTION_FAILED", message: extractionError }
      : null,
    matching_json: matchingJson,
    profile_version: newVersion,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
