"use client";
import JobitdaModal from "@/components/JobitdaModal";
import {RESUME_ERROR_CONTENT, type ResumeErrorCode} from "@/lib/resume-errors";

type Props = {error: ResumeErrorCode; onClose: () => void; demoOnly?: boolean};

/** Shared popup for both signup and mypage; consistent with existing Job잇다 modal design. */
export default function ResumeErrorModal({error, onClose, demoOnly = false}: Props) {
  const content = RESUME_ERROR_CONTENT[error];
  const message = demoOnly ? `${content.message}\n\n※ 시연용 오류 화면입니다. 실제 파일 업로드나 AI 분석은 실행하지 않았습니다.` : content.message;
  return <JobitdaModal title={content.title} message={message} onClose={onClose}/>;
}
