"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import CompanySubsidyPanel from "@/components/CompanySubsidyPanel";
import { routes } from "@/lib/jobitda-routes";
import { categoryLabel } from "@/lib/categories";
import { jobitdaApi, JobitdaApiError, resumePdfPath } from "@/lib/jobitda-api";
import { policyText, policyTone, gradeLabel, gradeTone, skillLabel } from "@/lib/jobitda-format";
import { formatRegion } from "@/lib/regions";
import type { CompanyOverviewResponse, ApplicantsResponse, PolicyStatus } from "@/contracts/api";

type Filter = "all" | PolicyStatus;
const options: { id: Filter; label: string }[] = [
  { id: "all", label: "전체" }, { id: "eligible", label: "기본요건 충족 가능" },
  { id: "needs_check", label: "추가 확인 필요" }, { id: "ineligible", label: "기본요건 불일치" },
];
function Chevron({ open }: { open: boolean }) {
  return <svg className="ui-chevron" aria-hidden="true" focusable="false" viewBox="0 0 16 16" width="14" height="14">
    <path d={open ? "M4 10 L8 6 L12 10" : "M4 6 L8 10 L12 6"} stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}
function itemText(v: "pass" | "fail" | "unknown") { return v === "pass" ? "충족" : v === "fail" ? "불일치" : "추가 확인"; }

export default function CompanyHome() {
  const router = useRouter();
  const pathname = usePathname();
  const isPreview = pathname?.startsWith("/preview/") ?? false;
  const [overview, setOverview] = useState<CompanyOverviewResponse | null>(null);
  const [selectedJob, setSelectedJob] = useState("");
  const [data, setData] = useState<ApplicantsResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [loading, setLoading] = useState(true); const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await jobitdaApi.companyOverview();
        if (!alive) return;
        setOverview(res);
        const firstJob = res.companies.flatMap(c => c.jobs)[0]?.job_id ?? "";
        setSelectedJob(firstJob); setLoading(false);
      } catch (err) {
        if (!alive) return;
        if (err instanceof JobitdaApiError) {
          if (err.status === 401) { router.replace(routes.login); return; }
          if (err.code === "ROLE_FORBIDDEN") { setErrMsg("기업 계정으로 로그인해주세요."); setLoading(false); return; }
          setErrMsg(err.message);
        } else setErrMsg("기업 정보를 불러오지 못했어요.");
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [router]);

  useEffect(() => {
    if (!selectedJob) return;
    let alive = true;
    (async () => {
      try { const res = await jobitdaApi.applicants(selectedJob); if (alive) setData(res); }
      catch { if (alive) setData(null); }
    })();
    return () => { alive = false; };
  }, [selectedJob]);

  function changeJob(jobId: string) { setSelectedJob(jobId); setExpanded(null); setFilter("all"); }

  const selectedCompany = useMemo(() => {
    if (!overview) return null;
    return overview.companies.find(c => c.jobs.some(j => j.job_id === selectedJob))?.company ?? overview.companies[0]?.company ?? null;
  }, [overview, selectedJob]);

  const allJobs = overview?.companies.flatMap(c => c.jobs) ?? [];
  const counts = data?.counts ?? { all: 0, eligible: 0, needs_check: 0, ineligible: 0 };
  const applicants = data?.applicants ?? [];
  const shown = filter === "all" ? applicants : applicants.filter(a => a.policy_snapshot.status === filter);

  if (loading) return <><SiteHeader role="company" /><main className="page-shell company-shell"><div className="panel">기업 정보를 불러오는 중이에요...</div></main></>;
  if (errMsg) return <><SiteHeader role="company" /><main className="page-shell company-shell"><div className="panel"><h1>불러오지 못했어요</h1><p>{errMsg}</p></div></main></>;

  return <><SiteHeader role="company" /><main className="page-shell company-shell">
    <section className="company-banner"><div><h1>{selectedCompany?.name ?? "기업"}</h1><p>{[selectedCompany?.industry, selectedCompany?.gu].filter(Boolean).join(" · ")}</p></div><div className="company-status"><span className="pill pill-indigo">서울형 강소기업</span>{selectedCompany?.is_demo && <span className="pill pill-purple">시연 계정</span>}</div></section>
    <CompanySubsidyPanel preview={isPreview} />
    <div className="company-filters"><select className="field company-job-select" value={selectedJob} onChange={e => changeJob(e.target.value)} aria-label="자사 채용공고 선택">
      {allJobs.length ? allJobs.map(j => <option key={j.job_id} value={j.job_id}>{j.title} · 지원자 {j.applicant_count}명{j.is_closed ? " · 마감" : ""}</option>) : <option value="">등록된 공고가 없습니다</option>}
    </select><div className="filter-buttons" role="group" aria-label="정책 기본요건 필터">{options.map(o => <button type="button" key={o.id} className={`filter-pill ${filter === o.id ? "active" : ""}`} aria-pressed={filter === o.id} onClick={() => { setFilter(o.id); setExpanded(null); }}>{o.label} <strong>{counts[o.id]}</strong></button>)}</div></div>
    <div className="applicant-table"><div className="applicant-head"><span>지원자</span><span>희망직무 · 핵심 기술</span><span>적합도</span><span>인센티브 구분</span><span>지원일</span><span aria-hidden="true"></span></div>
      {shown.length ? shown.map(a => {
        const grade = gradeLabel(a.match_snapshot);
        const bd = a.match_snapshot.breakdown;
        const matched = bd ? [...bd.skills.matched_ids, ...bd.experience.matched_ids] : [];
        const missing = bd ? [...bd.skills.missing_ids, ...bd.experience.missing_ids] : [];
        const rs = a.resume_summary;
        return <div key={a.application_id}>
          <div className="applicant-row"><div><strong>{a.name}</strong><p className="small-text">{a.age}세 · {formatRegion(a.address.sido, a.address.sigungu)}<br />{a.email}</p></div><div><strong>{a.desired_categories.map(categoryLabel).join(" · ") || "-"}</strong><p className="small-text">{(rs?.skills ?? []).slice(0, 3).map(skillLabel).join(" · ")}</p></div><span>{grade ? <span className={`pill ${gradeTone(a.match_snapshot)}`}>{grade}</span> : <span className="pill pill-gray">미산정</span>}</span><span><span className={`pill ${policyTone(a.policy_snapshot.status)}`}>{policyText(a.policy_snapshot.status)}</span></span><span className="small-text">{a.applied_at.slice(0, 10)}</span><button type="button" className="expand-link" aria-expanded={expanded === a.application_id} onClick={() => setExpanded(expanded === a.application_id ? null : a.application_id)}><span>{expanded === a.application_id ? "접기" : "자세히"}</span><Chevron open={expanded === a.application_id} /></button></div>
          {expanded === a.application_id && <div className="applicant-extra"><div><h3>적합도 근거</h3><p>{a.match_snapshot.reason ?? "추천 이유 문장은 상위 추천에만 제공됩니다."}</p><h4>일치 역량</h4><div className="tags">{matched.length ? matched.map(s => <span className="tag" key={s}>{skillLabel(s)}</span>) : <span className="subtle">표시된 항목 없음</span>}</div><h4>확인되지 않은 요구 역량</h4><div className="tags">{missing.length ? missing.map(m => <span className="tag tag-warn" key={m}>{skillLabel(m)}</span>) : <span className="subtle">표시된 항목 없음</span>}</div></div>
            <div><h3>자격요건 매핑 결과</h3><p>학력·전공 {[rs?.education, rs?.major].filter(Boolean).join(" · ") || "-"}</p><p>자격증 {rs?.certificates.length ? rs.certificates.join(", ") : "-"}</p><p>경험 {rs?.experiences.length ? rs.experiences.map(e => e.title).join(", ") : "-"}</p><h4>기본요건 항목별</h4><div className="tags"><span className={`tag ${a.policy_snapshot.items.age === "fail" ? "tag-warn" : ""}`}>연령 {itemText(a.policy_snapshot.items.age)}</span><span className={`tag ${a.policy_snapshot.items.residence === "fail" ? "tag-warn" : ""}`}>서울 거주 {itemText(a.policy_snapshot.items.residence)}</span><span className={`tag ${a.policy_snapshot.items.regular === "fail" ? "tag-warn" : ""}`}>정규직 {itemText(a.policy_snapshot.items.regular)}</span></div><div className="pdf-buttons"><a className="btn btn-ghost" href={resumePdfPath(a.application_id)} target="_blank" rel="noreferrer">이력서 원본 PDF 보기</a><span className="small-text">지원 당시 제출본 · 권한 검증 후 제공</span></div></div>
          </div>}
        </div>;
      }) : <div className="empty-state"><h3>등록된 지원자가 없습니다</h3><p>다른 채용공고를 선택하거나 필터를 변경해주세요.</p></div>}
    </div>
    <section className="policy-accordion"><button type="button" aria-expanded={policyOpen} onClick={() => setPolicyOpen(!policyOpen)}><strong>서울형 강소기업 지원 혜택 안내</strong><span className="accordion-toggle">{policyOpen ? "접기" : "펼치기"}<Chevron open={policyOpen} /></span></button>{policyOpen && <div className="policy-accordion-body"><p>기업 청년 고용 지원제도의 주요 요건과 신청 방법은 공식 공고로 확인해주세요. 플랫폼은 지원금 신청을 대행하거나 수급을 확정하지 않습니다.</p><p>기업별 인증 유효기간·신규채용 여부·고용 유지기간은 추가 확인이 필요해요.</p></div>}</section>
    <p className="footnote">인센티브 구분은 입력정보·공고에 근거한 예비진단이며 최종 수급 여부는 서울시 심사로 결정됩니다. 지원자 정보는 지원 시점 스냅샷 기준으로 보존됩니다.</p>
  </main></>;
}
