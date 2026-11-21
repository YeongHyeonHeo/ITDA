"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import { routes } from "@/lib/jobitda-routes";
import { formatRegion } from "@/lib/regions";
import { categoryLabel } from "@/lib/categories";
import { jobitdaApi, JobitdaApiError } from "@/lib/jobitda-api";
import { policyText, policyTone, employmentText, deadlineLabel, gradeLabel, gradeTone, applyRoute, applyRouteTone } from "@/lib/jobitda-format";
import type { MainResponse, JobCard } from "@/contracts/api";

function ScorePill({ card }: { card: JobCard }) {
  const label = gradeLabel(card.match);
  if (!label) return null;
  return <span className={`pill ${gradeTone(card.match)}`}>적합도 {label}</span>;
}
function PolicyPill({ card }: { card: JobCard }) {
  return <span className={`pill ${policyTone(card.policy.status)}`}>{policyText(card.policy.status)}</span>;
}
function ApplyMethodPill({ card }: { card: JobCard }) {
  const r = applyRoute(card);
  return <span className={`pill ${applyRouteTone(r)}`}>{r.label}</span>;
}
function metaLine(card: JobCard) {
  return [employmentText(card.employment_kind), card.location, card.categories.map(categoryLabel).join("·")].filter(Boolean).join(" · ");
}
function JobListRow({ card, withResume }: { card: JobCard; withResume: boolean }) {
  return <Link className="job-list-row" href={routes.job(card.job_id)}>
    <div className="job-row-description"><span className="small-text">{card.company.name}</span><h3>{card.title}</h3><p>{metaLine(card)}</p></div>
    <div className="tags job-row-tags">{withResume && <ScorePill card={card} />}<PolicyPill card={card} /><ApplyMethodPill card={card} /><span className="pill pill-gray">{card.is_closed ? "모집 마감" : "진행 중"}</span></div>
    <strong className={`deadline ${card.is_closed ? "deadline-closed" : ""}`}>{deadlineLabel(card.deadline, card.is_closed)}</strong>
  </Link>;
}

export default function YouthHome() {
  const router = useRouter();
  const [data, setData] = useState<MainResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState("");
  const [showOnlyOpen, setShowOnlyOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await jobitdaApi.youthMain();
        if (alive) { setData(res); setLoading(false); }
      } catch (err) {
        if (!alive) return;
        if (err instanceof JobitdaApiError) {
          if (err.status === 401) { router.replace(routes.login); return; }
          if (err.code === "ONBOARDING_REQUIRED") { router.replace(routes.signup); return; }
          setErrMsg(err.message);
        } else setErrMsg("공고를 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [router]);

  const postings = useMemo(() => {
    if (!data) return [];
    return showOnlyOpen ? data.postings.filter(j => !j.is_closed) : data.postings;
  }, [data, showOnlyOpen]);

  if (loading) return <><SiteHeader role="youth" /><main className="page-shell youth-shell"><div className="panel">맞춤 공고를 불러오는 중이에요...</div></main></>;
  if (errMsg || !data) return <><SiteHeader role="youth" /><main className="page-shell youth-shell"><div className="panel"><h1>공고를 불러오지 못했어요</h1><p>{errMsg}</p><button className="btn btn-orange" onClick={() => location.reload()}>다시 시도</button></div></main></>;

  const { youth_summary: s, has_resume, recommended } = data;
  return <><SiteHeader role="youth" name={s.name} /><main className="page-shell youth-shell">
    <div className="youth-intro"><h1>{s.name} 님에게 맞는 서울형 강소기업 공고</h1><div className="summary-line">내 기본요건 예비진단 <span className={`pill ${policyTone(s.youth_policy.status)}`}>{policyText(s.youth_policy.status)}</span><span>만 {s.age}세 · {formatRegion(s.address.sido, s.address.sigungu)}</span></div><p className="intro-caution">예비진단은 일부 제도의 연령·거주 조건을 가정한 표시이며 지원금 수급 확정이 아니에요. 거주지와 관계없이 공고는 확인할 수 있지만 실제 지원·정책 요건은 별도 확인해야 해요.</p></div>
    <div className="section-heading"><h2>AI 추천 공고</h2><span>적합도 높은 공고만 최대 3개</span></div>
    {has_resume ? <div className="top-jobs">{recommended.length ? recommended.map(card => <Link href={routes.job(card.job_id)} className="job-highlight" key={card.job_id}>
      <div className="tags"><span className="pill pill-orange">추천</span><ScorePill card={card} /><ApplyMethodPill card={card} /><span className="pill pill-gray">{card.is_closed ? "모집 마감" : "진행 중"}</span></div>
      <span className="small-text" style={{ marginTop: 15 }}>{card.company.name}</span><h3>{card.title}</h3><p>{employmentText(card.employment_kind)} · {card.location} · {deadlineLabel(card.deadline, card.is_closed)}</p>
      {card.match.reason && <div className="reason"><strong>추천 이유</strong><p>{card.match.reason}</p></div>}<div className="tags"><PolicyPill card={card} /></div>
    </Link>) : <p className="subtle">아직 추천할 만한 공고를 찾지 못했어요. 전체 공고에서 확인해보세요.</p>}</div> : <div className="locked-recommend"><div><strong>🔒 AI 추천 공고</strong><p>이력서를 올리면 적합도순 정렬과 추천 이유를 볼 수 있어요.</p><Link className="btn btn-orange" href={routes.mypage}>이력서 등록하러 가기</Link></div><p className="form-hint">전체 공고는 열람할 수 있습니다.</p></div>}
    <div className="section-heading all-jobs-heading"><h2>전체 공고 {postings.length}건</h2><span>{has_resume ? "적합도 높은 순 · 진행중 + 모집 마감 포함" : "최신 순 · 점수 미계산"}</span><label className="check-inline"><input type="checkbox" checked={showOnlyOpen} onChange={e => setShowOnlyOpen(e.target.checked)} /> 진행 중만 보기</label></div>
    <div className="listing">{postings.map(card => <JobListRow key={card.job_id} card={card} withResume={has_resume} />)}</div>
  </main></>;
}
