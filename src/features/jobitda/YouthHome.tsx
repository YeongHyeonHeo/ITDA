"use client";
import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import SiteHeader from "@/components/SiteHeader";
import ResumeRequiredModal from "@/components/ResumeRequiredModal";
import DemoNotice from "@/components/DemoNotice";
import {readDemoProfile,jobs,jobDeadlineLabel,policyText,ageAtKst,demoBasicPrecheck,type DemoProfile,type DemoJob,defaultProfile} from "@/lib/demo-data";
import {routes} from "@/lib/jobitda-routes";
import {getJobApplicationRoute} from "@/lib/job-application-route";
import {formatRegion} from "@/lib/regions";

function ScorePill({job}:{job:DemoJob}){return <span className={`pill ${job.score>=80?"pill-indigo":job.score>=60?"pill-green":"pill-red"}`}>적합도 {job.score>=80?"높음":job.score>=60?"보통":"낮음"}</span>}
function PolicyPill({job}:{job:DemoJob}){return <span className={`pill ${job.status==="eligible"?"pill-orange":job.status==="needs_check"?"pill-warn":"pill-red"}`}>{policyText(job.status)}</span>}
function ApplyMethodPill({job}:{job:DemoJob}){const route=getJobApplicationRoute(job);return <span className={`pill ${route.kind==="internal"?"pill-route-internal":"pill-route-external"}`}>{route.label}</span>}
function JobListRow({job,withResume}:{job:DemoJob;withResume:boolean}){
  return <Link className="job-list-row" href={routes.job(job.id)}>
    <div className="job-row-description"><span className="small-text">{job.company}</span><h3>{job.title}</h3><p>{job.employment} · {job.location} · {job.category}</p></div>
    <div className="tags job-row-tags">{withResume&&<ScorePill job={job}/>}<PolicyPill job={job}/><ApplyMethodPill job={job}/><span className="pill pill-gray">{job.closed?"모집 마감":"진행 중"}</span><span className="pill pill-pink">{job.employment==="정규직"?"정규직":"근무형태 확인"}</span></div>
    <strong className={`deadline ${job.closed?"deadline-closed":""}`}>{jobDeadlineLabel(job)}</strong>
  </Link>;
}
export default function YouthHome(){
  const [profile,setProfile]=useState<DemoProfile>(defaultProfile);
  const [resumeModal,setResumeModal]=useState(false);
  const [showOnlyOpen,setShowOnlyOpen]=useState(false);
  useEffect(()=>{queueMicrotask(()=>setProfile(readDemoProfile()));},[]);
  const withResume=Boolean(profile.resumeName);
  const sorted=useMemo(()=>{
    // 이력서가 없을 때는 점수를 계산하지 않고 관심 직무 일치 여부만 앞에 표시합니다.
    const result=[...jobs];
    result.sort((a,b)=>withResume?b.score-a.score:Number(profile.categories.includes(b.category))-Number(profile.categories.includes(a.category)));
    return result.filter(j=>!showOnlyOpen||!j.closed);
  },[withResume,showOnlyOpen,profile.categories]);
  const recommended=withResume?jobs.filter(j=>j.score>=80&&!j.closed&&j.reason.length>0).slice(0,3):[];
  const age=ageAtKst(profile.birth);
  const precheck=demoBasicPrecheck(profile);
  return <><SiteHeader role="youth" name={profile.name}/><main className="page-shell youth-shell">
    <div className="youth-intro"><h1>{profile.name} 님에게 맞는 서울형 강소기업 공고</h1><div className="summary-line">내 기본요건 예비진단 <span className={`pill ${precheck.tone}`}>{precheck.label}</span><span>만 {age??"?"}세 · {formatRegion(profile.province,profile.district)}</span></div><p className="intro-caution">예비진단은 일부 제도의 연령·거주 조건을 가정한 시연용 표시이며 지원금 수급 확정이 아니에요. 거주지와 관계없이 공고는 확인할 수 있지만 실제 지원·정책 요건은 별도 확인해야 해요.</p></div>
    <div className="section-heading"><h2>AI 추천 공고</h2><span>적합도 높은 공고만 최대 3개</span></div>
    {withResume?<div className="top-jobs">{recommended.map(job=><Link href={routes.job(job.id)} className="job-highlight" key={job.id}>
      <div className="tags"><span className="pill pill-orange">추천</span><ScorePill job={job}/><ApplyMethodPill job={job}/><span className="pill pill-gray">진행 중</span><span className="pill pill-pink">{job.employment==="정규직"?"정규직":"고용형태 확인"}</span></div>
      <span className="small-text" style={{marginTop:15}}>{job.company}</span><h3>{job.title}</h3><p>{job.employment} · {job.location} · {jobDeadlineLabel(job)}</p>
      <div className="reason"><strong>추천 이유</strong><p>{job.reason}</p></div><div className="tags"><PolicyPill job={job}/></div>
    </Link>)}</div>:<div className="locked-recommend"><div><strong>🔒 AI 추천 공고</strong><p>이력서를 올리면 적합도순 정렬과 추천 이유를 볼 수 있어요.</p><button className="btn btn-orange" onClick={()=>setResumeModal(true)}>추천 공고 보기</button></div><p className="form-hint">전체 공고는 열람할 수 있습니다.</p></div>}
    <div className="section-heading all-jobs-heading"><h2>전체 공고 {sorted.length}건</h2><span>{withResume?"적합도 높은 순 · 진행중 + 모집 마감 포함":"희망 직무 일치 순 · 점수 미계산"}</span><label className="check-inline"><input type="checkbox" checked={showOnlyOpen} onChange={e=>setShowOnlyOpen(e.target.checked)}/> 진행 중만 보기</label></div>
    <div className="listing">{sorted.map(job=><JobListRow key={job.id} job={job} withResume={withResume}/>)}</div>
    <p className="footnote">이 화면의 공고 18건·참여 여부·지원 경로·추천 순위는 UI 검토를 위한 가상 데이터입니다. 외부 공고 URL은 확인되지 않아 시연에서 활성화되지 않습니다. 실제 조회·지원 경로는 API 연결 후 사용합니다.</p>
    <DemoNotice/>
    {resumeModal&&<ResumeRequiredModal onClose={()=>setResumeModal(false)}/>}
  </main></>;
}
