"use client";
import {useState} from "react";
import SiteHeader from "@/components/SiteHeader";
import ResumeErrorModal from "@/components/ResumeErrorModal";
import {RESUME_ERROR_CONTENT, type ResumeErrorCode} from "@/lib/resume-errors";

const EXAMPLES: ResumeErrorCode[] = [
  "FILE_TOO_LARGE", "UNSUPPORTED_FILE_TYPE", "PDF_TEXT_EMPTY", "EXTRACTION_FAILED",
];
/** Tester-only interface: does not upload a file or trigger real AI analysis. */
export default function ResumeErrorPreview() {
  const [current, setCurrent] = useState<ResumeErrorCode | null>(null);
  return <><SiteHeader/><main className="page-shell narrow-shell signup-shell">
    <h1 className="page-title">이력서 오류 팝업 테스트</h1>
    <section className="panel signup-form resume-error-preview">
      <p className="demo-form-note">개발 환경 전용 QA 화면이에요. 버튼은 팝업 디자인만 미리 보여주며 실제 파일 업로드·AI 분석은 실행하지 않습니다.</p>
      <div className="resume-error-preview-actions">
        {EXAMPLES.map(code=><button key={code} type="button" className="btn btn-outline-orange" onClick={()=>setCurrent(code)}>{RESUME_ERROR_CONTENT[code].title}</button>)}
      </div>
      <p className="form-hint">실제 회원가입·마이페이지에서는 PDF 크기와 파일 서명을 확인해 오류 팝업을 표시해요. 스캔 PDF·AI 실패 판정은 향후 서버 결과를 연결해야 합니다.</p>
    </section>
    {current&&<ResumeErrorModal demoOnly error={current} onClose={()=>setCurrent(null)}/>}
  </main></>;
}
