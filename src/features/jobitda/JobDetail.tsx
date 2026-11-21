"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import JobitdaModal from "@/components/JobitdaModal";
import ResumeRequiredModal from "@/components/ResumeRequiredModal";
import { routes } from "@/lib/jobitda-routes";
import { categoryLabel } from "@/lib/categories";
import { jobitdaApi, JobitdaApiError } from "@/lib/jobitda-api";
import { policyText, policyTone, employmentText, deadlineLabel, gradeLabel, skillLabel } from "@/lib/jobitda-format";
import type { JobDetailResponse } from "@/contracts/api";

type ModalKind = "confirm" | "complete" | "resume" | "error" | null;

export default function JobDetail() {
  const params = useParams(); const id = String(params.id);
  const router = useRouter();
  const [job, setJob] = useState<JobDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [applied, setApplied] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null); const [modalMsg, setModalMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await jobitdaApi.jobDetail(id);
        if (!alive) return;
        setJob(res); setApplied(res.applied); setLoading(false);
      } catch (err) {
        if (!alive) return;
        if (err instanceof JobitdaApiError) {
          if (err.status === 401) { router.replace(routes.login); return; }
          if (err.code === "ONBOARDING_REQUIRED") { router.replace(routes.signup); return; }
          if (err.code === "JOB_NOT_FOUND" || err.status === 404) { setNotFound(true); setLoading(false); return; }
        }
        setNotFound(true); setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, router]);

  if (loading) return <><SiteHeader role="youth" /><main className="page-shell narrow-shell"><div className="panel">공고를 불러오는 중이에요...</div></main></>;
  if (notFound || !job) return <><SiteHeader role="youth" /><main className="page-shell narrow-shell"><div className="panel"><h1>공고를 찾을 수 없어요</h1><p>마감되었거나 존재하지 않는 공고입니다.</p><Link href={routes.youth} className="btn btn-orange">전체 공고 보기</Link></div></main></>;

  const bd = job.match.breakdown;
  const matched = bd ? [...bd.skills.matched_ids, ...bd.experience.matched_ids] : [];
  const missing = bd ? [...bd.skills.missing_ids, ...bd.experience.missing_ids] : [];
  const buttonText = applied ? "지원완료" : job.is_closed ? "모집마감" : "지원하기";
  const cannotApply = applied || job.is_closed;

  function startApply() {
    if (cannotApply) return;
    if (job!.apply_block_reason === "resume_required") { setModal("resume"); return; }
    setModal("confirm");
  }
  async function confirmApply() {
    setBusy(true);
    try {
      const res = await jobitdaApi.apply({ job_id: job!.job_id });
      setApplied(true); setModal("complete"); void res;
    } catch (err) {
      if (err instanceof JobitdaApiError) {
        if (err.code === "RESUME_REQUIRED") { setModal("resume"); return; }
        if (err.code === "POSTING_CLOSED") { setModalMsg("이미 마감된 공고예요."); setModal("error"); return; }
        if (err.status === 401) { router.replace(routes.login); return; }
        setModalMsg(err.message); setModal("error"); return;
      }
      setModalMsg("지원 처리 중 문제가 발생했어요."); setModal("error");
    } finally { setBusy(false); }
  }

  const grade = gradeLabel(job.match);
  return <><SiteHeader role="youth" /><main className="page-shell detail-shell"><Link className="back-link" href={routes.youth}>← 전체 공고로 돌아가기</Link>
    <section className="panel detail-head"><div className="tags"><span className="pill pill-indigo">서울형 강소기업</span>{grade && <span className="pill pill-indigo">적합도 {grade}</span>}</div><p className="company-name">{job.company.name}</p><h1>{job.title}</h1><p className="subtle">{[job.categories.map(categoryLabel).join("·"), employmentText(job.employment_kind), job.location, job.deadline ? `${job.deadline} 마감 (${deadlineLabel(job.deadline, job.is_closed)})` : "상시 채용"].filter(Boolean).join(" · ")}</p>
      <div className="summary-line">이 공고 기준 예비진단 <span className={`pill ${policyTone(job.policy.status)}`}>{policyText(job.policy.status)}</span><span>연령·거주·근무형태 기준</span></div>
    </section>
    {job.match.status === "ready" ? <section className="reason-box">{job.match.reason && <><h2>왜 추천했나</h2><p>{job.match.reason}</p></>}<h3>일치 역량</h3><div className="tags">{matched.length ? matched.map(x => <span className="tag" key={x}>{skillLabel(x)}</span>) : <span className="subtle">표시된 일치 역량이 없어요.</span>}</div><h3>추가 확인 항목</h3><div className="tags">{missing.length ? missing.map(x => <span className="tag tag-warn" key={x}>{skillLabel(x)}</span>) : <span className="subtle">표시된 항목 없음</span>}</div></section> : <section className="panel reason-locked"><h2>🔒 AI 추천 근거는 이력서 등록 후 제공돼요</h2><p>현재는 공고 정보만 확인할 수 있어요.</p><Link className="btn btn-orange" href={routes.mypage}>이력서 등록하러 가기</Link></section>}
    <section className="panel detail-info">{job.position_raw && <><h2>모집분야</h2><p>{job.position_raw}</p></>}{job.preferred && <><h2>우대사항</h2><p>{job.preferred}</p></>}<h2>근무조건</h2><dl className="detail-dl"><dt>고용형태</dt><dd>{job.employment_type_raw || employmentText(job.employment_kind)}</dd><dt>경력</dt><dd>{job.career_req || "확인 필요"}</dd><dt>학력</dt><dd>{job.education_req || "확인 필요"}</dd><dt>급여</dt><dd>{job.salary || "확인 필요"}</dd><dt>근무지</dt><dd>{job.location || "확인 필요"}</dd><dt>마감일</dt><dd>{job.deadline ?? "상시"}</dd></dl></section>
    <section className="panel company-info"><h2>기업 정보</h2><p>업종 {job.company_industry || "확인 필요"}　 소재지 {job.location || "확인 필요"}</p></section>
    <section className="panel apply-bar"><div><strong>바로 지원</strong><p className="small-text">지원 시점의 이력서·적합도·정책 판정이 그대로 저장됩니다. 지원 후에는 취소할 수 없어요.</p></div><button type="button" className={`btn ${cannotApply ? "btn-disabled" : "btn-orange"}`} disabled={cannotApply || busy} onClick={startApply}>{buttonText}</button></section>
    {modal === "confirm" && <JobitdaModal title="지원하시겠습니까?" message={`${job.company.name} <${job.title}>에 지원합니다.\n지원 후에는 취소할 수 없습니다.`} primaryLabel={busy ? "지원 중..." : "네"} secondaryLabel="아니요" onClose={() => !busy && setModal(null)} onPrimary={confirmApply} />}
    {modal === "complete" && <JobitdaModal title="지원이 완료되었어요" message="지원 당시 이력서와 적합도·정책 판정이 저장되었습니다. 마이페이지 지원 내역에서 확인할 수 있어요." onClose={() => setModal(null)} />}
    {modal === "resume" && <ResumeRequiredModal onClose={() => setModal(null)} />}
    {modal === "error" && <JobitdaModal title="지원하지 못했어요" message={modalMsg} onClose={() => setModal(null)} />}
  </main></>;
}
