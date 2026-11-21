"use client";

import {useEffect, useMemo, useState} from "react";
import {usePathname} from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import CompanySubsidyPanel from "@/components/CompanySubsidyPanel";
import JobitdaModal from "@/components/JobitdaModal";
import DemoNotice from "@/components/DemoNotice";
import {jobitdaApi} from "@/lib/jobitda-api";
import {demoApplicants, readDemoApplied, policyText, type PolicyStatus, type DemoApplicant} from "@/lib/demo-data";
import {
  PREVIEW_POSTINGS, parseDetailedSubsidy, parseOverviewPostings,
  subsidyLabel, record, stringValue, numberValue, arrayStrings,
  type CompanyPosting, type CompanySubsidy,
} from "@/lib/company-dashboard";

type Filter = "all" | PolicyStatus;
type ApplicantView = {
  id:string; name:string; age:number|null; district:string; email:string;
  category:string; skills:string[]; missing:string[]; score:number|null;
  policy:PolicyStatus|null; appliedAt:string; reason:string|null;
  school:string; certificate:string; experience:string; resumeUrl:string|null;
};
type ApplicantCounts = Record<Filter, number>;
type LiveApplicants = {
  jobId:string;
  applicants:ApplicantView[];
  counts:ApplicantCounts;
  detailedSubsidy:CompanySubsidy|null;
};
const filters:{id:Filter;label:string}[] = [
  {id:"all",label:"전체"},{id:"eligible",label:"기본요건 충족 가능"},
  {id:"needs_check",label:"추가 확인 필요"},{id:"ineligible",label:"기본요건 불일치"},
];
const emptyCounts:ApplicantCounts = {all:0,eligible:0,needs_check:0,ineligible:0};
function policyStatus(value:unknown):PolicyStatus|null {
  return value==="eligible"||value==="needs_check"||value==="ineligible"?value:null;
}
function normalizeDemo(applicant:DemoApplicant):ApplicantView {
  return {...applicant,reason:applicant.reason,resumeUrl:null};
}
function mapLiveApplicant(value:unknown):ApplicantView|null {
  const a=record(value);
  if(!a) return null;
  const id=stringValue(a.application_id);
  if(!id) return null;
  const address=record(a.address);
  const summary=record(a.resume_summary);
  const match=record(a.match_snapshot);
  const policy=record(a.policy_snapshot);
  const matched=record(match?.breakdown);
  const rawUrl=stringValue(a.resume_url);
  // Never open arbitrary URLs from untrusted API data; use authorized local F01 route only.
  const resumeUrl=rawUrl && /^\/api\/applications\/[a-zA-Z0-9-]+\/resume$/.test(rawUrl)?rawUrl:null;
  const skills=arrayStrings(summary?.skills);
  const missing=arrayStrings(match?.missing_ids).length
    ?arrayStrings(match?.missing_ids):arrayStrings(record(matched?.skills)?.missing_ids);
  const category=arrayStrings(a.desired_categories).join(" · ");
  const school=stringValue(summary?.education)??"";
  const major=stringValue(summary?.major);
  return {
    id,
    name:stringValue(a.name)??"이름 미제공",
    age:numberValue(a.age),
    district:stringValue(address?.sigungu)??"지역 미제공",
    email:stringValue(a.email)??"",
    category:category||"희망직무 미제공",
    skills,missing,
    score:numberValue(match?.score),
    policy:policyStatus(policy?.status),
    appliedAt:stringValue(a.applied_at)?.slice(0,10)??"날짜 미제공",
    reason:stringValue(match?.reason),
    school:major?`${school} ${major}`.trim():school,
    certificate:arrayStrings(summary?.certificates).join(" · "),
    experience:arrayStrings(summary?.experiences).join(" · "),
    resumeUrl,
  };
}
function countsFromApplicants(applicants:ApplicantView[]):ApplicantCounts {
  return {
    all:applicants.length,
    eligible:applicants.filter(a=>a.policy==="eligible").length,
    needs_check:applicants.filter(a=>a.policy==="needs_check").length,
    ineligible:applicants.filter(a=>a.policy==="ineligible").length,
  };
}
function parseLiveApplicants(response:unknown,jobId:string):LiveApplicants {
  const body=record(response);
  const applicants=Array.isArray(body?.applicants)
    ?body.applicants.map(mapLiveApplicant).filter((a):a is ApplicantView=>a!==null):[];
  const derived=countsFromApplicants(applicants);
  const numbers=record(body?.counts);
  const counts:ApplicantCounts={
    all:numberValue(numbers?.all)??derived.all,
    eligible:numberValue(numbers?.eligible)??derived.eligible,
    needs_check:numberValue(numbers?.needs_check)??derived.needs_check,
    ineligible:numberValue(numbers?.ineligible)??derived.ineligible,
  };
  return {jobId,applicants,counts,detailedSubsidy:parseDetailedSubsidy(response)};
}
function Chevron({open}:{open:boolean}) {
  return <svg className="ui-chevron" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="14" height="14">
    <path d={open?"M4 10 L8 6 L12 10":"M4 6 L8 10 L12 6"} stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export default function CompanyHome() {
  const pathname=usePathname();
  const isPreview=pathname?.startsWith("/preview/")??false;
  const [liveJobs,setLiveJobs]=useState<CompanyPosting[]>([]);
  const [companyName,setCompanyName]=useState("기업 담당자");
  const [overviewLoading,setOverviewLoading]=useState(!isPreview);
  const [overviewError,setOverviewError]=useState<string|null>(null);
  const [selectedJobId,setSelectedJobId]=useState(isPreview?PREVIEW_POSTINGS[0].id:"");
  const [liveApplicants,setLiveApplicants]=useState<LiveApplicants|null>(null);
  const [applicantsLoading,setApplicantsLoading]=useState(false);
  const [applicantsError,setApplicantsError]=useState<string|null>(null);
  const [filter,setFilter]=useState<Filter>("all");
  const [expanded,setExpanded]=useState<string|null>("mins");
  const [demoApplied,setDemoApplied]=useState(false);
  const [policyOpen,setPolicyOpen]=useState(false);
  const [pdfNotice,setPdfNotice]=useState(false);

  // Preview data and live enterprise data must not be mixed.
  useEffect(()=>{
    if(!isPreview) return;
    queueMicrotask(()=>setDemoApplied(readDemoApplied().includes("marketing-content")));
  },[isPreview]);
  useEffect(()=>{
    if(isPreview) return;
    let active=true;
    jobitdaApi.companyOverview()
      .then(response=>{
        if(!active)return;
        const parsed=parseOverviewPostings(response);
        const body=record(response);
        const companies=Array.isArray(body?.companies)?body.companies:[];
        const first=record(companies[0]);
        setCompanyName(stringValue(record(first?.company)?.name)??"기업 담당자");
        setLiveJobs(parsed);
        setApplicantsLoading(parsed.length>0);
        setSelectedJobId(parsed[0]?.id??"");
        setOverviewError(null);
      })
      .catch(()=>{if(active)setOverviewError("자사 공고를 불러오지 못했어요. 기업 로그인 또는 API 연결 상태를 확인해주세요.");})
      .finally(()=>{if(active)setOverviewLoading(false);});
    return ()=>{active=false;};
  },[isPreview]);
  useEffect(()=>{
    if(isPreview || !selectedJobId) return;
    let active=true;
    jobitdaApi.applicants(selectedJobId,"all")
      .then(response=>{
        if(!active)return;
        setLiveApplicants(parseLiveApplicants(response,selectedJobId));
        setApplicantsError(null);
      })
      .catch(()=>{
        if(active){setLiveApplicants(null);setApplicantsError("지원자 목록을 불러오지 못했어요. 기업의 공고 접근 권한을 확인해주세요.");}
      })
      .finally(()=>{if(active)setApplicantsLoading(false);});
    return ()=>{active=false;};
  },[isPreview,selectedJobId]);

  const postings=isPreview?PREVIEW_POSTINGS:liveJobs;
  const selectedPosting=postings.find(job=>job.id===selectedJobId)??null;
  const detailedSubsidy=liveApplicants?.jobId===selectedJobId?liveApplicants.detailedSubsidy:null;
  const subsidy=detailedSubsidy??selectedPosting?.subsidy??null;

  const previewApplicants=useMemo(()=>{
    const result=demoApplicants.map(normalizeDemo);
    if(demoApplied) result.push(normalizeDemo({
      id:"session-demo",name:"시연 지원자",age:25,district:"마포구",email:"sample@example.com",
      category:"마케팅·홍보",skills:["SNS 운영","엑셀"],missing:["광고 플랫폼 집행"],score:77,
      policy:"needs_check",appliedAt:"현재 세션",reason:"시연용 가상 지원 기록",school:"가상 학력",
      certificate:"시연용",experience:"시연 지원 이력",
    }));
    return result.sort((a,b)=>(b.score??-1)-(a.score??-1));
  },[demoApplied]);
  const applicants=isPreview?(selectedJobId==="marketing-content"?previewApplicants:[])
    :(liveApplicants?.jobId===selectedJobId?liveApplicants.applicants:[]);
  const counts=isPreview?countsFromApplicants(applicants)
    :(liveApplicants?.jobId===selectedJobId?liveApplicants.counts:emptyCounts);
  const shown=filter==="all"?applicants:applicants.filter(applicant=>applicant.policy===filter);
  const listLoading=overviewLoading||(!isPreview&&applicantsLoading);
  const listError=overviewError||applicantsError;
  function selectPosting(id:string){
    setSelectedJobId(id);setFilter("all");setExpanded(null);
    setLiveApplicants(null);setApplicantsError(null);
    if(!isPreview)setApplicantsLoading(true);
  }

  return <><SiteHeader role="company"/><main className="page-shell company-shell">
    <section className="company-banner">
      <div><h1>{isPreview?"가온마케팅랩":companyName}</h1><p>{isPreview?"광고·마케팅 대행업 · 서울 마포구":"자사 채용공고 · 지원자 현황"}</p></div>
      <div className="company-status">
        {isPreview&&<span className="pill pill-indigo">서울형 강소기업 인증 (가상)</span>}{" "}
        {isPreview&&<span className="pill pill-purple">JOB잇다 참여기업 (시연)</span>}{" "}
        {isPreview&&<span className="pill pill-gray">시연 계정</span>}
      </div>
    </section>

    <section className="company-job-picker" aria-label="공고 선택">
      <label htmlFor="company-job-select">자사 채용공고 선택</label>
      <select id="company-job-select" className="field company-job-select" value={selectedPosting?.id??""}
        onChange={e=>selectPosting(e.target.value)} disabled={overviewLoading||postings.length===0}>
        {postings.length===0?<option value="">{overviewLoading?"공고 불러오는 중":"선택할 공고 없음"}</option>
          :postings.map(job=><option value={job.id} key={job.id}>
              {job.title} · {subsidyLabel(job.subsidy)}{(isPreview&&job.id==="marketing-content"?previewApplicants.length:job.applicantCount)!==null?` · 지원자 ${isPreview&&job.id==="marketing-content"?previewApplicants.length:job.applicantCount}명`:""}
            </option>)}
      </select>
    </section>

    <CompanySubsidyPanel posting={selectedPosting} subsidy={subsidy}
      preview={isPreview} loading={overviewLoading} error={overviewError}/>

    <div className="company-filters">
      {subsidy?.status==="ineligible"&&<p className="company-subsidy-alert" role="status">
        이 공고는 고용형태상 근무환경개선금 대상이 아닙니다.
      </p>}
      <div className="filter-buttons" role="group" aria-label="지원자 기본요건 필터">
        {filters.map(option=><button type="button" key={option.id}
          className={`filter-pill ${filter===option.id?"active":""}`}
          aria-pressed={filter===option.id}
          onClick={()=>{setFilter(option.id);setExpanded(null);}}>
          {option.label} <strong>{counts[option.id]}</strong>
        </button>)}
        <span className="company-policy-note">기본요건은 지원금 참고 정보이며 채용 판단 기준이 아닙니다.</span>
      </div>
    </div>

    <div className="applicant-table">
      <div className="applicant-head"><span>지원자</span><span>희망직무 · 핵심 기술</span><span>적합도</span><span>인센티브 구분</span><span>지원일</span><span aria-hidden="true"/></div>
      {listLoading?<div className="empty-state" role="status">지원자 정보를 불러오는 중입니다.</div>
      :listError?<div className="empty-state" role="alert">{listError}</div>
      :shown.length?shown.map(applicant=><div key={applicant.id}>
        <div className="applicant-row">
          <div><strong>{applicant.name}</strong><p className="small-text">{applicant.age===null?"연령 미제공":`${applicant.age}세`} · {applicant.district==="성남시"?"경기 ":""}{applicant.district}<br/>{applicant.email}</p></div>
          <div><strong>{applicant.category}</strong><p className="small-text">{applicant.skills.slice(0,3).join(" · ")||"보유 기술 미제공"}</p></div>
          <span>{applicant.score===null?<span className="pill pill-gray">미분석</span>
            :<span className={`pill ${applicant.score>=60?"pill-indigo":applicant.score>=40?"pill-green":"pill-gray"}`}>
              {applicant.score>=60?"높음":applicant.score>=40?"보통":"낮음"}</span>}</span>
          <span><span className={`pill ${applicant.policy==="eligible"?"pill-purple":applicant.policy==="needs_check"?"pill-warn":applicant.policy==="ineligible"?"pill-red":"pill-gray"}`}>
            {applicant.policy?policyText(applicant.policy):"정보 없음"}</span></span>
          <span className="small-text">{applicant.appliedAt}</span>
          <button type="button" className="expand-link" aria-expanded={expanded===applicant.id}
            onClick={()=>setExpanded(expanded===applicant.id?null:applicant.id)}>
            <span>{expanded===applicant.id?"접기":"자세히"}</span><Chevron open={expanded===applicant.id}/>
          </button>
        </div>
        {expanded===applicant.id&&<div className="applicant-extra">
          <div><h3>일치 역량</h3>
            <div className="tags">{applicant.skills.length?applicant.skills.map(skill=><span className="tag" key={skill}>{skill}</span>):<span className="subtle">제공된 역량 정보 없음</span>}</div>
            <h4>확인되지 않은 요구 역량</h4><div className="tags">
              {applicant.missing.length?applicant.missing.map(skill=><span className="tag tag-warn" key={skill}>{skill}</span>):<span className="subtle">제공된 항목 없음</span>}
            </div>
            {applicant.reason&&<><h4>적합도 참고 정보</h4><p>{applicant.reason}</p></>}
          </div>
          <div><h3>자격요건 매핑 결과</h3>
            <p>학력 {applicant.school||"미제공"}</p><p>자격증 {applicant.certificate||"미제공"}</p>
            <p>경험 {applicant.experience||"미제공"}</p>
            <h4>지원 당시 기본요건 예비판정</h4><span className="pill pill-gray">{applicant.policy?policyText(applicant.policy):"정보 없음"}</span>
            <div className="pdf-buttons">
              {applicant.resumeUrl?<a className="btn btn-ghost" href={applicant.resumeUrl} target="_blank" rel="noopener noreferrer">이력서 원본 PDF 보기</a>
                :<button type="button" className="btn btn-ghost" onClick={()=>setPdfNotice(true)}>이력서 원본 PDF 보기</button>}
              <span className="small-text">실제 파일은 서버 권한 검사를 통과해야 열람할 수 있습니다.</span>
            </div>
          </div>
        </div>}
      </div>):<div className="empty-state">
        <h3>{counts.all===0?"아직 이 공고의 지원자가 0명입니다":"선택한 조건에 해당하는 지원자가 0명입니다"}</h3>
        <p>{counts.all===0?"지원자가 등록되면 이곳에서 확인할 수 있어요.":"다른 필터를 선택하면 지원자를 확인할 수 있어요."}</p>
      </div>}
    </div>

    <section className="policy-accordion"><button type="button" aria-expanded={policyOpen} onClick={()=>setPolicyOpen(!policyOpen)}>
      <strong>서울형 강소기업 지원 혜택 안내</strong><span className="accordion-toggle">{policyOpen?"접기":"펼치기"}<Chevron open={policyOpen}/></span>
    </button>{policyOpen&&<div className="policy-accordion-body">
      <p>기업 청년 고용 지원제도의 주요 요건과 신청 방법은 공식 공고로 확인해주세요. 플랫폼은 지원금 신청을 대행하거나 수급을 확정하지 않습니다.</p>
      <p>기업별 인증 유효기간·신규채용 여부·고용 유지기간은 추가 확인이 필요해요.</p>
    </div>}</section>
    <p className="footnote">지원금과 지원자 기본요건은 예비진단 정보입니다. {isPreview?"현재 표시된 지원자·공고는 가상 데이터입니다.":"실제 데이터는 기업의 접근 권한과 API 응답을 기준으로 표시합니다."}</p>
    {isPreview&&<DemoNotice/>}
    {pdfNotice&&<JobitdaModal title="이력서 원본 PDF 확인" message="현재 이력서 원본 PDF의 권한 확인 또는 파일 정보가 제공되지 않았습니다. 실제 PDF는 승인된 기업 계정에만 열람할 수 있습니다." onClose={()=>setPdfNotice(false)}/>}
  </main></>;
}
