/** PRD v1.5 B4/B5: local PDF checks and server-reported resume errors.
 * A scanned/text-empty PDF cannot be reliably detected in the browser without PDF parsing.
 * PDF_TEXT_EMPTY and EXTRACTION_FAILED must come from the server response in production.
 */
export type ResumeErrorCode =
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_FILE_TYPE"
  | "PDF_TEXT_EMPTY"
  | "EXTRACTION_FAILED"
  | "FILE_READ_FAILED";

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export const RESUME_ERROR_CONTENT: Record<ResumeErrorCode, {title: string; message: string}> = {
  FILE_TOO_LARGE: {
    title: "이력서 파일이 너무 커요",
    message: "PDF 파일은 5MB 이하여야 해요. 파일 크기를 줄인 뒤 다시 업로드해주세요.",
  },
  UNSUPPORTED_FILE_TYPE: {
    title: "PDF 파일을 확인해주세요",
    message: "PDF 형식의 이력서만 등록할 수 있어요. 파일 형식을 확인한 뒤 다시 선택해주세요.",
  },
  PDF_TEXT_EMPTY: {
    title: "PDF에서 글자를 읽을 수 없어요",
    message: "스캔 이미지로만 이루어진 PDF는 텍스트를 추출할 수 없어요. 글자를 선택할 수 있는 PDF로 다시 업로드해주세요.",
  },
  EXTRACTION_FAILED: {
    title: "AI 분석에 실패했어요",
    message: "파일은 저장됐지만 AI 분석에 실패했어요. 다시 올려주세요.",
  },
  FILE_READ_FAILED: {
    title: "파일을 읽지 못했어요",
    message: "선택한 PDF를 읽는 중 문제가 발생했어요. 파일을 확인한 뒤 다시 시도해주세요.",
  },
};

/** Client-side check: size, filename extension and actual %PDF- signature.
 * It does not claim that the PDF contains extractable text or that AI analysis succeeded.
 */
export async function validateLocalResumePdf(file: File): Promise<ResumeErrorCode | null> {
  if (file.size > MAX_RESUME_BYTES) return "FILE_TOO_LARGE";
  if (!file.name.toLowerCase().endsWith(".pdf")) return "UNSUPPORTED_FILE_TYPE";
  try {
    const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const matchesPdf = signature.length === 5 &&
      signature[0] === 0x25 && signature[1] === 0x50 && signature[2] === 0x44 &&
      signature[3] === 0x46 && signature[4] === 0x2d;
    return matchesPdf ? null : "UNSUPPORTED_FILE_TYPE";
  } catch {
    return "FILE_READ_FAILED";
  }
}

/** For future Y04 API integration: error.code or HTTP 200 extraction_status='failed'. */
export function resumeErrorFromApi(value: unknown): ResumeErrorCode | null {
  if (!value || typeof value !== "object") return null;
  const result = value as {extraction_status?: unknown; code?: unknown; error?: {code?: unknown}};
  if (result.extraction_status === "failed") return "EXTRACTION_FAILED";
  const code = result.error?.code ?? result.code;
  return typeof code === "string" && code in RESUME_ERROR_CONTENT
    ? code as ResumeErrorCode : null;
}
