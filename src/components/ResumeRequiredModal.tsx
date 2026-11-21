"use client";
import {useRouter} from "next/navigation";
import JobitdaModal from "@/components/JobitdaModal";
import {routes} from "@/lib/jobitda-routes";
export default function ResumeRequiredModal({onClose}:{onClose:()=>void}){
  const router=useRouter();
  return <JobitdaModal kind="wide" title="이력서를 업로드하지 않으면 AI 추천 공고를 볼 수 없어요" primaryLabel="이력서 업로드하러 가기" secondaryLabel="닫기" onClose={onClose} onPrimary={()=>{onClose();router.push(routes.mypage);}}>
    <div className="resume-needed-body"><div className="locked-preview"><strong>🔒 AI 추천 공고</strong><p>이력서를 올리면 적합도순 정렬과 추천 이유를 볼 수 있어요.</p><span className="btn btn-disabled">추천 공고 보기</span><p>전체 공고는 확인할 수 있어요.</p></div><div className="locked-explain"><strong>이력서가 필요함</strong><p>이력서를 업로드해야 맞춤 추천 공고를 볼 수 있어요.</p></div></div>
  </JobitdaModal>;
}
