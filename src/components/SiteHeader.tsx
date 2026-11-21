"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import JobitdaModal from "@/components/JobitdaModal";
import { routes } from "@/lib/jobitda-routes";
import { createClient } from "@/lib/supabase/client";

type Props={role?:"youth"|"company"|"guest";name?:string};
export default function SiteHeader({role="guest",name="사용자"}:Props){
  const [logoutOpen,setLogoutOpen]=useState(false);
  const router=useRouter();
  async function logout(){
    try{ await createClient().auth.signOut(); }catch{ /* 세션 정리 실패해도 홈으로 */ }
    setLogoutOpen(false);
    router.push("/");
  }
  return <>
    <header className="site-header"><div className="site-header-inner">
      <Link href="/" aria-label="Job잇다 메인"><Image src="/jobitda-logo-clean-v4.png" alt="Job잇다" className="logo" width={1610} height={410} priority unoptimized /></Link>
      <nav className="site-nav" aria-label="주요 메뉴">
        {role==="youth"?<><span>{name} 님</span><Link href={routes.mypage}>마이페이지</Link><button className="nav-link" type="button" onClick={()=>setLogoutOpen(true)}>로그아웃</button></>
          :role==="company"?<><span>가온마케팅랩 담당자</span><button className="nav-link" type="button" onClick={()=>setLogoutOpen(true)}>로그아웃</button></>
          :<Link href={routes.login}>로그인</Link>}
      </nav>
    </div></header>
    {logoutOpen&&<JobitdaModal title="로그아웃 하시겠습니까?" primaryLabel="네" secondaryLabel="아니요" onClose={()=>setLogoutOpen(false)} onPrimary={logout}/>}
  </>;
}
