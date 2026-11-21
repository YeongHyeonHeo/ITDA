"use client";
import {useEffect,useMemo,useState} from "react";
import SiteHeader from "@/components/SiteHeader";
import CompanySubsidyPanel from "@/components/CompanySubsidyPanel";
import {usePathname} from "next/navigation";
import JobitdaModal from "@/components/JobitdaModal";
import DemoNotice from "@/components/DemoNotice";
import {demoApplicants,readDemoApplied,policyText,type PolicyStatus,type DemoApplicant} from "@/lib/demo-data";

type Filter="all"|PolicyStatus;
const options:{id:Filter;label:string}[]=[
  {id:"all",label:"전체"},{id:"eligible",label:"기본요건 충족 가능"},
  {id:"needs_check",label:"추가 확인 필요"},{id:"ineligible",label:"기본요건 불일치"},
];
function Chevron({open}:{open:boolean}){
  return <svg className="ui-chevron" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="14" height="14">
    <path d={open?"M4 10 L8 6 L12 10":"M4 6 L8 10 L12 6"} stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
export default function CompanyHome(){
  const pathname=usePathname();
  const isPreview=pathname?.startsWith("/preview/") ?? false;
  const [selectedJob,setSelectedJob]=useState("marketing-content");const [filter,setFilter]=useState<Filter>("all");
  const [expanded,setExpanded]=useState<string|null>("mins");const [demoApplied,setDemoApplied]=useState(false);
  const [policyOpen,setPolicyOpen]=useState(false);const [pdfNotice,setPdfNotice]=useState(false);
  useEffect(()=>{queueMicrotask(()=>setDemoApplied(readDemoApplied().includes("marketing-content")));},[]);
  const baseApplicants=useMemo<DemoApplicant[]>(()=>{
    const base=[...demoApplicants];
    if(demoApplied)base.push({id:"session-demo",name:"시연 지원자",age:25,district:"마포구",email:"sample@example.com",category:"마케팅·홍보",skills:["SNS 운영","엑셀"],missing:["광고 플랫폼 집행"],score:77,policy:"needs_check",appliedAt:"현재 세션",reason:"UI 시연에서 지원 버튼으로 등록한 가상 지원 기록",school:"가상 학력",certificate:"시연용",experience:"시연용 지원 이력"});
    return base.sort((a,b)=>b.score-a.score);
  },[demoApplied]);
  const current=selectedJob==="marketing-content"?baseApplicants:[];
  const counts={all:current.length,eligible:current.filter(a=>a.policy==="eligible").length,needs_check:current.filter(a=>a.policy==="needs_check").length,ineligible:current.filter(a=>a.policy==="ineligible").length};
  const shown=filter==="all"?current:current.filter(a=>a.policy===filter);
  return <><SiteHeader role="company"/><main className="page-shell company-shell">
    <section className="company-banner"><div><h1>가온마케팅랩</h1><p>광고·마케팅 대행업 · 서울 마포구</p></div><div className="company-status"><span className="pill pill-indigo">서울형 강소기업 인증 (가상)</span> <span className="pill pill-purple">JOB잇다 참여기업 (시연)</span> <span className="pill pill-gray">시연 계정</span></div></section>
    <CompanySubsidyPanel preview={isPreview}/>
    <div className="company-filters"><select className="field company-job-select" value={selectedJob} onChange={e=>{setSelectedJob(e.target.value);setExpanded(null);setFilter("all");}} aria-label="자사 채용공고 선택">
      <option value="marketing-content">콘텐츠 마케터 (신입) · 12/01 마감 · 지원자 {counts.all}명</option>
      <option value="another-job">홍보 지원 (시연) · 지원자 0명</option>
    </select><div className="filter-buttons" role="group" aria-label="정책 기본요건 필터">{options.map(o=><button type="button" key={o.id} className={`filter-pill ${filter===o.id?"active":""}`} aria-pressed={filter===o.id} onClick={()=>{setFilter(o.id);setExpanded(null);}}>{o.label} <strong>{counts[o.id]}</strong></button>)}<span className="company-policy-note">기본요건은 지원금 참고 정보이며 채용 판단 기준이 아닙니다.</span></div></div>
    <div className="applicant-table"><div className="applicant-head"><span>지원자</span><span>희망직무 · 핵심 기술</span><span>적합도</span><span>인센티브 구분</span><span>지원일</span><span aria-hidden="true"></span></div>
      {shown.length?shown.map(applicant=><div key={applicant.id}>
        <div className="applicant-row"><div><strong>{applicant.name}</strong><p className="small-text">{applicant.age}세 · {applicant.district==="성남시"?"경기 ":"서울 "}{applicant.district}<br/>{applicant.email}</p></div><div><strong>{applicant.category}</strong><p className="small-text">{applicant.skills.slice(0,3).join(" · ")}</p></div><span><span className={`pill ${applicant.score>=80?"pill-indigo":"pill-green"}`}>{applicant.score>=80?"높음":"보통"}</span></span><span><span className={`pill ${applicant.policy==="eligible"?"pill-purple":applicant.policy==="needs_check"?"pill-warn":"pill-red"}`}>{policyText(applicant.policy)}</span></span><span className="small-text">{applicant.appliedAt}</span><button type="button" className="expand-link" aria-expanded={expanded===applicant.id} onClick={()=>setExpanded(expanded===applicant.id?null:applicant.id)}><span>{expanded===applicant.id?"접기":"자세히"}</span><Chevron open={expanded===applicant.id}/></button></div>
        {expanded===applicant.id&&<div className="applicant-extra"><div><h3>적합도 근거</h3><p>{applicant.reason}</p><h4>일치 역량</h4><div className="tags">{applicant.skills.map(skill=><span className="tag" key={skill}>{skill}</span>)}</div><h4>확인되지 않은 요구 역량</h4><div className="tags">{applicant.missing.length?applicant.missing.map(m=><span className="tag tag-warn" key={m}>{m}</span>):<span className="subtle">시연 데이터상 표시된 항목 없음</span>}</div></div>
          <div><h3>자격요건 매핑 결과</h3><p>학력 {applicant.school}</p><p>자격증 {applicant.certificate}</p><p>경험 {applicant.experience}</p><h4>기본요건 항목별 근거</h4><div className="tags"><span className={`tag ${applicant.policy==="ineligible"?"tag-warn":""}`}>연령 충족 (만 {applicant.age}세)</span><span className={`tag ${applicant.district==="성남시"?"tag-warn":""}`}>{applicant.district==="성남시"?"서울 거주 불일치":"서울 거주 충족"}</span><span className="tag">정규직 공고</span></div><div className="pdf-buttons"><button type="button" className="btn btn-ghost" onClick={()=>setPdfNotice(true)}>이력서 원본 PDF 보기</button><span className="small-text">권한 검사·원본 제공은 실제 API 연결 후 제공</span></div></div>
        </div>}
      </div>):<div className="empty-state"><h3>{counts.all===0?"아직 이 공고의 지원자가 0명입니다":"선택한 조건에 해당하는 지원자가 0명입니다"}</h3><p>{counts.all===0?"지원자가 등록되면 이곳에서 확인할 수 있어요.":"다른 필터를 선택하면 지원자를 확인할 수 있어요."}</p></div>}
    </div>
    <section className="policy-accordion"><button type="button" aria-expanded={policyOpen} onClick={()=>setPolicyOpen(!policyOpen)}><strong>서울형 강소기업 지원 혜택 안내</strong><span className="accordion-toggle">{policyOpen?"접기":"펼치기"}<Chevron open={policyOpen}/></span></button>{policyOpen&&<div className="policy-accordion-body"><p>기업 청년 고용 지원제도의 주요 요건과 신청 방법은 공식 공고로 확인해주세요. 플랫폼은 지원금 신청을 대행하거나 수급을 확정하지 않습니다.</p><p>기업별 인증 유효기간·신규채용 여부·고용 유지기간은 추가 확인이 필요해요.</p></div>}</section>
    <p className="footnote">인센티브 구분은 입력정보·공고에 근거한 예비진단이며 최종 수급 여부는 서울시 심사로 결정됩니다. 지원자 정보는 신청 시점 기준으로 보존하는 것이 목표이며, 현재는 모두 가상 데이터입니다.</p>
    <DemoNotice/>
    {pdfNotice&&<JobitdaModal title="추가 확인이 필요해요" message="이력서 원본 PDF 열람은 지원자의 동의와 기업의 자사 공고 접근 권한을 서버에서 검증한 다음 제공됩니다. 현재는 시연 데이터이므로 원본 PDF가 없습니다." onClose={()=>setPdfNotice(false)}/>}
  </main></>;
}
