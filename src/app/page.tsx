import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import {routes} from "@/lib/jobitda-routes";

export default function Home(){
  return <>
    <SiteHeader/>
    <main className="page-shell home-shell">
      <section className="hero">
        <span className="eyebrow">서울형 강소기업 × 청년 AI 매칭</span>
        <h1>서울시 청년 고용정책을<br/>실제 채용으로 잇습니다</h1>
        <p>이력서를 AI가 분석해 서울형 강소기업 공고를 적합도순으로 보여주고,<br/>기업에는 지원자를 직무 적합성과 정책 기본요건으로 나눠 보여줍니다.</p>
      </section>
      <section className="hero-cards" aria-label="서비스 역할 선택">
        <article className="hero-card"><h2>청년으로 시작</h2>
          <p>이력서를 올리면 나에게 맞는<br/>강소기업 공고를 추천받고 바로 지원</p>
          <p className="hero-extra">적합도순 전체 공고 · 추천 최대 3개 · 정책요건 배지</p>
          <Link className="btn btn-orange btn-wide" href={routes.signup}>청년으로 시작</Link>
        </article>
        <article className="hero-card"><h2>기업으로 시작</h2>
          <p>자사 공고에 지원한 청년을<br/>적합도와 인센티브 기본요건으로 검토</p>
          <p className="hero-extra">시연 계정 로그인 · 지원자 목록 · 기본요건 필터</p>
          <Link className="btn btn-purple btn-wide" href="/login?role=company">기업으로 시작</Link>
        </article>
      </section>
      <p className="hero-note">본 서비스의 기업 계정과 지원 기록은 해커톤 시연용임</p>
    </main>
  </>;
}
