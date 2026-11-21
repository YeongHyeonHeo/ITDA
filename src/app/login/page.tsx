"use client";
import Link from "next/link";
import {useRouter,useSearchParams} from "next/navigation";
import {Suspense,useState,type FormEvent} from "react";
import SiteHeader from "@/components/SiteHeader";
import JobitdaModal from "@/components/JobitdaModal";
import {routes} from "@/lib/jobitda-routes";
import {createClient} from "@/lib/supabase/client";
import {jobitdaApi} from "@/lib/jobitda-api";

type Role="youth"|"company";
function LoginForm({role,onError}:{role:Role;onError:(msg?:string)=>void}){
  const router=useRouter();const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!email.includes("@")||password.length<8){onError();return;}
    setBusy(true);
    try{
      const supabase=createClient();
      const {error}=await supabase.auth.signInWithPassword({email:email.trim(),password});
      if(error){onError("이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해주세요.");return;}
      setPassword("");
      // 실제 역할로 분기 (카드 선택값이 아니라 서버 판단을 신뢰)
      const me=await jobitdaApi.me();
      if(me.role==="company")router.push(routes.company);
      else if(me.role==="youth")router.push(routes.youth);
      else router.push(routes.signup); // 온보딩 전 계정
    }catch{
      onError("로그인 처리 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.");
    }finally{setBusy(false);}
  }
  return <form className="panel login-card" onSubmit={submit} noValidate>
    <h2>{role==="youth"?"청년 로그인":"기업 로그인"}</h2>
    <label className="field-group"><span className="form-label">이메일</span><input className="field" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" placeholder="demo@example.com"/></label>
    <label className="field-group"><span className="form-label">비밀번호</span><input className="field" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="8자 이상 입력"/></label>
    <div className="login-actions"><button type="submit" className={`btn ${role==="youth"?"btn-orange":"btn-purple"}`} disabled={busy}>{busy?"로그인 중...":"로그인"}</button></div>
    <p className="login-signup-link">계정이 없나요? <Link href={`/signup?role=${role}`}>회원가입</Link></p>
  </form>;
}
function LoginInner(){
  const search=useSearchParams();const role=search.get("role");const [errorModal,setErrorModal]=useState<{role:Role;msg:string}|null>(null);
  const show=(r:Role)=>(msg?:string)=>setErrorModal({role:r,msg:msg??"이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해주세요."});
  return <><SiteHeader/><main className="page-shell login-shell"><h1 className="page-title">로그인</h1>
    <div className="login-cards"><div className={role==="youth"?"login-highlight":""}><LoginForm role="youth" onError={show("youth")}/></div><div className={role==="company"?"login-highlight":""}><LoginForm role="company" onError={show("company")}/></div></div>
    <p className="demo-form-note">가입한 이메일·비밀번호로 로그인하세요. 역할(청년/기업)은 계정에 따라 자동으로 분기됩니다.</p>
    {errorModal&&<JobitdaModal accent={errorModal.role==="company"?"purple":"orange"} title="로그인할 수 없어요" message={errorModal.msg} onClose={()=>setErrorModal(null)}/>}
  </main></>;
}
export default function LoginPage(){return <Suspense fallback={<main className="page-shell">로그인 화면을 불러오는 중...</main>}><LoginInner/></Suspense>}
