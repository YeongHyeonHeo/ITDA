"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ChangeEvent, type FormEvent } from "react";
import SiteHeader from "@/components/SiteHeader";
import CompanySignupForm from "@/components/CompanySignupForm";
import JobitdaModal from "@/components/JobitdaModal";
import {categories,writeDemoProfile,type DemoProfile} from "@/lib/demo-data";
import {getLocalities} from "@/lib/regions";
import {routes} from "@/lib/jobitda-routes";

type ModalName="consent"|"duplicate"|"analyzing"|"invalid"|null;
const MAX_RESUME_BYTES=5*1024*1024;
function SignupInner(){
  const searchParams=useSearchParams();
  const router=useRouter();
  const [name,setName]=useState(""); const [birth,setBirth]=useState("");
  const [province]=useState("서울특별시");const [district,setDistrict]=useState(""); const [chosen,setChosen]=useState<string[]>([]);
  const [file,setFile]=useState<File|null>(null); const [email,setEmail]=useState("");
  const [password,setPassword]=useState(""); const [agreed,setAgreed]=useState(false);
  const [modal,setModal]=useState<ModalName>(null); const [error,setError]=useState("");
  const [role,setRole]=useState<"youth"|"company">(searchParams.get("role")==="company"?"company":"youth");
  function toggleCategory(category:string){
    setError("");
    setChosen(prev=>prev.includes(category)?prev.filter(item=>item!==category):prev.length>=3?prev:[...prev,category]);
  }
  function chooseFile(event:ChangeEvent<HTMLInputElement>){
    const picked=event.target.files?.[0];if(!picked)return;
    if(!picked.name.toLowerCase().endsWith(".pdf") || (picked.type!=="application/pdf"&&picked.type!=="")){
      setError("PDF 파일만 선택할 수 있어요.");event.target.value="";return;
    }
    if(picked.size>MAX_RESUME_BYTES){setError("5MB 이하 PDF 파일을 선택해주세요.");event.target.value="";return;}
    setFile(picked);setError("");
    // PDF 본문이나 비밀번호는 로컬 스토리지 및 서버에 저장하지 않습니다.
  }
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setError("");
    if(!agreed){setModal("consent");return;}
    if(!name.trim()||!birth||!province||!district||!chosen.length||!email.includes("@")||password.length<8){
      setError("이름·생년월일·주소·희망직무·이메일과 8자 이상 비밀번호를 확인해주세요.");setModal("invalid");return;
    }
    if(email.trim().toLowerCase()==="minsu@example.com"){
      setModal("duplicate");return;
    }
    const profile:DemoProfile={name:name.trim(),birth,province,district,categories:chosen,email:email.trim(),resumeName:file?.name??null};
    // 브라우저 세션에 화면 시연용으로만 입력값을 보관합니다. 실사용 개인정보 입력 금지.
    writeDemoProfile(profile);
    if(file){setModal("analyzing");return;}
    router.push(routes.youth);
  }
  return <><SiteHeader/><main className="page-shell narrow-shell signup-shell">
    <h1 className="page-title">{role==="youth"?"청년 회원가입":"기업 회원가입"}</h1>
    <div className="seg-tabs" role="tablist" aria-label="가입 유형">
      <button type="button" role="tab" aria-selected={role==="youth"} className={role==="youth"?"active-orange":""} onClick={()=>setRole("youth")}>청년</button>
      <button type="button" role="tab" aria-selected={role==="company"} className={role==="company"?"active-purple":""} onClick={()=>setRole("company")}>기업</button>
    </div>
    {role==="company"?<CompanySignupForm/>:
    <form className="panel signup-form" noValidate onSubmit={submit}>
      <p className="demo-form-note">로컬 시연 화면입니다. 실제 개인정보나 평소 사용하는 비밀번호를 입력하지 말고 가상 정보만 사용해주세요. 실제 회원가입·AI 분석·파일 업로드는 수행되지 않습니다.</p>
      <label className="field-group"><span className="form-label">이름</span><input className="field" value={name} onChange={e=>setName(e.target.value)} placeholder="예: 홍길동" autoComplete="off"/></label>
      <label className="field-group"><span className="form-label">생년월일</span><input className="field" type="date" value={birth} onChange={e=>setBirth(e.target.value)} max="2026-11-21"/><span className="form-hint">만 나이는 자동 계산 · 지원금 기본요건 만 18~39세 판정 시 사용</span></label>
      <div className="field-group"><label className="form-label" htmlFor="province">실거주지 주소 (서울특별시 / 자치구)</label><div className="input-row">
        <select id="province" className="field" value={province} disabled aria-label="서울특별시 고정"><option value="서울특별시">서울특별시</option></select>
        <select id="locality" className="field" value={district} aria-label="서울특별시 자치구 선택" disabled={!province} onChange={e=>setDistrict(e.target.value)}><option value="">자치구 선택</option>{getLocalities("서울특별시").map(d=><option key={d} value={d}>{d}</option>)}</select>
      </div><p className="form-hint">실거주지 기준 서울특별시 자치구를 선택해주세요. 상세 주소는 수집하지 않으며, 정책 요건은 별도 확인합니다.</p></div>
      <div className="field-group"><p className="form-label">희망직무 카테고리 (최대 3개)</p><div className="chip-row" role="group" aria-label="희망직무 카테고리">{categories.map(c=><button className={`chip ${chosen.includes(c)?"is-selected":""}`} type="button" key={c} aria-pressed={chosen.includes(c)} disabled={chosen.length>=3&&!chosen.includes(c)} onClick={()=>toggleCategory(c)}>{c}</button>)}</div><p className="form-hint">{chosen.length}개 선택됨</p></div>
      <div className="field-group"><label className="form-label" htmlFor="resume">이력서 PDF (선택)</label><div className="upload-area"><div className="upload-inner"><span aria-hidden="true">📄</span><div className="upload-text"><strong>{file?`${file.name} 선택됨`:"이력서 PDF를 업로드하세요."}</strong><small>{file?"PDF 선택 완료 · 실제 서버에는 업로드되지 않음":"텍스트 PDF · 5MB 이하 · 5쪽 이하(서버 검증 예정)"}</small></div><label htmlFor="resume" className="btn btn-orange">{file?"이력서 재업로드":"이력서 업로드"}</label></div><input id="resume" className="visually-hidden" type="file" accept=".pdf,application/pdf" onChange={chooseFile}/></div><p className="form-hint">올리지 않아도 가입 가능. 단, 이력서 등록 전에는 AI 맞춤 추천과 지원이 제한돼요.</p></div>
      <label className="field-group"><span className="form-label">이메일</span><input className="field" type="email" autoComplete="off" placeholder="demo@example.com" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label className="field-group"><span className="form-label">비밀번호</span><input className="field" type="password" autoComplete="new-password" placeholder="8자 이상 (시연용 가상 비밀번호)" value={password} onChange={e=>setPassword(e.target.value)}/><span className="form-hint">8자 이상 · 브라우저 저장/서버 전송 안 함</span></label>
      <label className="consent-box"><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/><span><strong>[필수] 개인정보 제공 동의</strong><small>시연: 실제 기업에 정보가 전달되지 않습니다. 정식 서비스에서는 동의한 항목만 지원 기업에 전달되도록 별도 구현이 필요합니다.</small></span></label>
      {error&&<p className="inline-error" role="alert">{error}</p>}
      <button className="btn btn-orange btn-wide submit-btn" type="submit">가입하고 맞춤 공고 보기</button>
    </form>}
    {modal==="consent"&&<JobitdaModal title="개인정보 제공 동의를 확인해주세요" message={"지원한 기업에 이름·이메일·이력서 등을 전달하려면 동의가 필요합니다.\n동의 후 가입을 진행해주세요."} onClose={()=>setModal(null)}/>}
    {modal==="duplicate"&&<JobitdaModal title="이미 가입된 이메일이에요" message={`${email} 으로 가입된 계정이 있습니다. 로그인하거나 다른 이메일로 가입해주세요. (시연용 예시)`} onClose={()=>setModal(null)}/>}
    {modal==="invalid"&&<JobitdaModal title="입력 정보를 확인해주세요" message="필수 항목을 작성한 후 다시 시도해주세요." onClose={()=>setModal(null)}/>}
    {modal==="analyzing"&&<JobitdaModal title="맞춤 공고를 분석하고 있어요" message={"AI로 작성하신 개인정보 및 이력서를 분석하고 있습니다.\n약 20~40초 소요될 수 있습니다.\n\n※ 이 화면은 시연용이며 실제 AI 분석은 실행되지 않습니다."} primaryLabel="닫기" onClose={()=>{setModal(null);router.push(routes.youth);}}/>}
  </main></>;
}

export default function SignupPage(){
  return <Suspense fallback={<main className="page-shell">회원가입 화면을 불러오는 중...</main>}><SignupInner/></Suspense>;
}
