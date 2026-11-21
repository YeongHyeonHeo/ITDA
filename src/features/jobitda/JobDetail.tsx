"use client";
import Link from "next/link";
import {useParams} from "next/navigation";
import {useEffect,useState} from "react";
import SiteHeader from "@/components/SiteHeader";
import JobitdaModal from "@/components/JobitdaModal";
import ResumeRequiredModal from "@/components/ResumeRequiredModal";
import DemoNotice from "@/components/DemoNotice";
import {getJob,readDemoProfile,readDemoApplied,saveDemoApplied,jobDeadlineLabel,policyText,type DemoProfile,defaultProfile} from "@/lib/demo-data";
import {routes} from "@/lib/jobitda-routes";

type ModalKind="confirm"|"complete"|"resume"|null;
export default function JobDetail(){
  const params=useParams();const id=String(params.id);
  const job=getJob(id);
  const [profile,setProfile]=useState<DemoProfile>(defaultProfile);const [applied,setApplied]=useState(false);
  const [modal,setModal]=useState<ModalKind>(null);
  useEffect(()=>{queueMicrotask(()=>{setProfile(readDemoProfile());setApplied(readDemoApplied().includes(id));});},[id]);
  if(!job)return <><SiteHeader role="youth"/><main className="page-shell narrow-shell"><div className="panel"><h1>공고를 찾을 수 없어요</h1><p>시연 데이터에 없는 공고입니다.</p><Link href={routes.youth} className="btn btn-orange">전체 공고 보기</Link></div></main></>;
  const cannotApply=job.closed||applied;
  // 시연 대상 공고는 모두 플랫폼 참여기업 공고로 취급합니다.
  // 지원 가능 / 지원 완료 / 모집 마감 / 이력서 미등록(안내 팝업)의 네 상태를 사용합니다.
  const buttonText=applied?"지원완료":job.closed?"모집마감":"지원하기";
  function startApply(){if(cannotApply)return;if(!profile.resumeName){setModal("resume");return;}setModal("confirm");}
  function finishApply(){const ids=readDemoApplied();if(!ids.includes(id))saveDemoApplied([...ids,id]);setApplied(true);setModal("complete");}
  return <><SiteHeader role="youth" name={profile.name}/><main className="page-shell detail-shell"><Link className="back-link" href={routes.youth}>← 전체 공고로 돌아가기</Link>
    <section className="panel detail-head"><div className="tags"><span className="pill pill-indigo">서울형 강소기업 (가상)</span>{profile.resumeName&&<span className="pill pill-indigo">AI 추천 예시</span>}{profile.resumeName&&<span className="pill pill-indigo">적합도 {job.score>=80?"높음":job.score>=60?"보통":"낮음"}</span>}</div><p className="company-name">{job.company}</p><h1>{job.title}</h1><p className="subtle">{job.category} · {job.employment} · {job.location} · {job.deadline?`${job.deadline} 마감 (${jobDeadlineLabel(job)})`:"상시 채용"}</p>
      <div className="summary-line">이 공고 기준 예비진단 <span className={`pill ${job.status==="eligible"?"pill-orange":job.status==="needs_check"?"pill-warn":"pill-red"}`}>{policyText(job.status)}</span><span>연령·서울 거주·근무형태 예시</span></div>
    </section>
    {profile.resumeName?<section className="reason-box"><h2>왜 추천했나</h2><p>{job.reason}</p><h3>일치 역량</h3><div className="tags">{job.skills.map(x=><span className="tag" key={x}>{x}</span>)}</div><h3>추가 확인 항목</h3><div className="tags">{job.missing.map(x=><span className="tag tag-warn" key={x}>{x}</span>)}</div></section>:<section className="panel reason-locked"><h2>🔒 AI 추천 근거는 이력서 등록 후 제공돼요</h2><p>현재는 공고 정보만 확인할 수 있어요.</p><button className="btn btn-orange" onClick={()=>setModal("resume")}>이력서 등록 안내</button></section>}
    <section className="panel detail-info"><h2>담당업무</h2><ul>{job.duties.map(t=><li key={t}>{t}</li>)}</ul><h2>자격요건</h2><ul>{job.requirements.map(t=><li key={t}>{t}</li>)}</ul><h2>우대사항</h2><ul>{job.preferred.map(t=><li key={t}>{t}</li>)}</ul><h2>근무조건</h2><dl className="detail-dl"><dt>고용형태</dt><dd>{job.employment}</dd><dt>근무지</dt><dd>{job.location}</dd><dt>모집 직종</dt><dd>{job.title}</dd><dt>경력</dt><dd>신입 가능(시연)</dd><dt>마감일</dt><dd>{job.deadline??"상시"}</dd></dl></section>
    <section className="panel company-info"><h2>기업 정보</h2><p>업종 {job.industry}　 소재지 {job.location}</p><p className="small-text">출처: Figma 시연 화면 기반 가상 기업·공고 데이터. 실제 서울시 채용정보 확인을 대신하지 않습니다.</p></section>
    <section className="panel apply-bar"><div><strong>바로 지원</strong><p className="small-text">지원 의사 기록은 해커톤 브라우저 시연용이며 실제 기업에 전달되지 않습니다.</p></div><button type="button" className={`btn ${cannotApply?"btn-disabled":"btn-orange"}`} disabled={cannotApply} onClick={startApply}>{buttonText}</button></section>
    <DemoNotice/>
    {modal==="confirm"&&<JobitdaModal title="지원하시겠습니까?" message={`${job.company} <${job.title}>에 지원합니다.\n지원 후에는 취소할 수 없습니다.\n※ 이 동작은 현재 브라우저의 가상 지원 기록만 남깁니다.`} primaryLabel="네" secondaryLabel="아니요" onClose={()=>setModal(null)} onPrimary={finishApply}/>}
    {modal==="complete"&&<JobitdaModal title="지원이 완료되었어요" message="브라우저 시연용 지원 기록이 저장되었습니다. 실제 기업 접수는 이루어지지 않았습니다." onClose={()=>setModal(null)}/>}
    {modal==="resume"&&<ResumeRequiredModal onClose={()=>setModal(null)}/>}
  </main></>;
}
