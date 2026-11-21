"use client";
import Link from "next/link";
import {useRouter,useSearchParams} from "next/navigation";
import {Suspense,useState,type FormEvent} from "react";
import SiteHeader from "@/components/SiteHeader";
import JobitdaModal from "@/components/JobitdaModal";
import {routes} from "@/lib/jobitda-routes";

type Role="youth"|"company";
function LoginForm({role,onError}:{role:Role;onError:()=>void}){
  const router=useRouter();const [email,setEmail]=useState("");const [password,setPassword]=useState("");
  function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    // 실제 인증이 아닙니다. 시연용 임의 입력 검증 후 미리보기로 이동합니다.
    if(!email.includes("@")||password.length<8){onError();return;}
    setPassword("");router.push(role==="youth"?routes.youth:routes.company);
  }
  return <form className="panel login-card" onSubmit={submit} noValidate>
    <h2>{role==="youth"?"청년 로그인":"기업 로그인"}</h2>
    <label className="field-group"><span className="form-label">이메일</span><input className="field" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="off" placeholder="demo@example.com"/></label>
    <label className="field-group"><span className="form-label">비밀번호</span><input className="field" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="off" placeholder="8자 이상 입력"/></label>
    <div className="login-actions"><button type="submit" className={`btn ${role==="youth"?"btn-orange":"btn-purple"}`}>로그인</button></div>
    <p className="login-signup-link">계정이 없나요? <Link href={`/signup?role=${role}`}>회원가입</Link></p>
  </form>;
}
function LoginInner(){
  const search=useSearchParams();const role=search.get("role");const [errorRole,setErrorRole]=useState<Role|null>(null);
  return <><SiteHeader/><main className="page-shell login-shell"><h1 className="page-title">로그인</h1>
    <div className="login-cards"><div className={role==="youth"?"login-highlight":""}><LoginForm role="youth" onError={()=>setErrorRole("youth")}/></div><div className={role==="company"?"login-highlight":""}><LoginForm role="company" onError={()=>setErrorRole("company")}/></div></div>
    <p className="demo-form-note">현재는 UI 시연 모드입니다. 입력값은 실제 Supabase 인증에 사용되지 않으며, 가상 데이터 화면으로만 이동합니다.</p>
    {errorRole&&<JobitdaModal accent={errorRole==="company"?"purple":"orange"} title="로그인할 수 없어요" message={"이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해주세요.\n(시연에서는 이메일 형식과 8자 이상을 확인합니다.)"} onClose={()=>setErrorRole(null)}/>}
  </main></>;
}
export default function LoginPage(){return <Suspense fallback={<main className="page-shell">로그인 화면을 불러오는 중...</main>}><LoginInner/></Suspense>}
