"use client";
import type {ResumeProgress} from "@/lib/resume-upload-progress";

const stageLabel:Record<ResumeProgress["stage"],string>={
  validating:"PDF 파일 확인 중",
  reading:"PDF 읽는 중 (시연: 로컬 파일 확인)",
  uploading:"이력서 업로드 중",
  processing:"파일 전송 완료 · 서버에서 텍스트 추출 및 AI 분석 중",
  completed:"이력서 업로드 완료",
  demo:"로컬 파일 확인 완료 · 실제 서버 업로드 없음",
  failed:"업로드 처리 실패",
};
export default function ResumeUploadProgress({progress}:{progress:ResumeProgress|null}){
  if(!progress)return null;
  const isBusy=["validating","reading","uploading","processing"].includes(progress.stage);
  return <div className="resume-upload-status" role="status" aria-live="polite" aria-busy={isBusy}>
    <div className="resume-upload-status-head">
      <strong>{stageLabel[progress.stage]}</strong>
      {progress.percent!==null&&<span>{progress.percent}%</span>}
    </div>
    {progress.percent!==null
      ?<progress className="resume-upload-progress" max={100} value={progress.percent} aria-label={progress.stage==="reading"?"로컬 파일 읽기 진행률":"파일 전송 진행률"}/>
      :isBusy?<span className="resume-upload-indeterminate" aria-hidden="true"/>:null}
    {progress.stage==="processing"&&<p className="form-hint">AI 처리 단계의 실시간 퍼센트는 현재 서버 API에서 제공하지 않습니다.</p>}
  </div>;
}
