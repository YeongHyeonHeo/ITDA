"use client";
import Link from "next/link";
import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import JobitdaModal from "@/components/JobitdaModal";
import { getLocalities, formatRegion, PROVINCES } from "@/lib/regions";
import { CATEGORY_OPTIONS, categoryLabel } from "@/lib/categories";
import { routes } from "@/lib/jobitda-routes";
import { jobitdaApi, JobitdaApiError, resumePdfPath } from "@/lib/jobitda-api";
import { policyText, policyTone, gradeLabel, skillLabel } from "@/lib/jobitda-format";
import type { ProfileResponse, ApplicationSummary } from "@/contracts/api";
import type { CategoryId } from "@/contracts/matching";

type Draft = { name: string; birth_date: string; province: string; district: string; categories: CategoryId[] };
type ModalName = "invalid" | "error" | "logout" | null;
const MAX = 5 * 1024 * 1024;

export default function MyPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [apps, setApps] = useState<ApplicationSummary[]>([]);
  const [loading, setLoading] = useState(true); const [errMsg, setErrMsg] = useState("");
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false); const [saving, setSaving] = useState(false);
  const [fileError, setFileError] = useState(""); const [fileBusy, setFileBusy] = useState(false);
  const [modal, setModal] = useState<ModalName>(null); const [modalMsg, setModalMsg] = useState("");

  // 이벤트 핸들러(이력서 재업로드)에서 쓰는 재조회
  async function refresh() {
    const [p, a] = await Promise.all([jobitdaApi.getProfile(), jobitdaApi.applications()]);
    setProfile(p); setApps(a.applications);
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [p, a] = await Promise.all([jobitdaApi.getProfile(), jobitdaApi.applications()]);
        if (alive) { setProfile(p); setApps(a.applications); setLoading(false); }
      } catch (err) {
        if (!alive) return;
        if (err instanceof JobitdaApiError) {
          if (err.status === 401) { router.replace(routes.login); return; }
          if (err.code === "ONBOARDING_REQUIRED") { router.replace(routes.signup); return; }
          setErrMsg(err.message);
        } else setErrMsg("내 정보를 불러오지 못했어요.");
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [router]);

  function startEdit() {
    if (!profile) return;
    setDraft({ name: profile.name, birth_date: profile.birth_date, province: profile.address.sido, district: profile.address.sigungu, categories: profile.desired_categories });
    setEditing(true); setSaved(false);
  }
  function toggleCategory(id: CategoryId) {
    setDraft(d => d && ({ ...d, categories: d.categories.includes(id) ? d.categories.filter(c => c !== id) : d.categories.length < 3 ? [...d.categories, id] : d.categories }));
  }
  async function save() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.birth_date || !draft.province || !draft.district || !draft.categories.length) { setModal("invalid"); return; }
    setSaving(true);
    try {
      const updated = await jobitdaApi.updateProfile({ name: draft.name.trim(), birth_date: draft.birth_date, address: { sido: draft.province, sigungu: draft.district }, desired_categories: draft.categories });
      setProfile(updated); setEditing(false); setSaved(true);
    } catch (err) {
      setModalMsg(err instanceof JobitdaApiError ? err.message : "저장에 실패했어요."); setModal("error");
    } finally { setSaving(false); }
  }
  async function pickResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type !== "application/pdf" && file.type !== "")) { setFileError("PDF 파일만 선택해주세요."); return; }
    if (file.size > MAX) { setFileError("5MB 이하 PDF 파일을 선택해주세요."); return; }
    setFileError(""); setFileBusy(true);
    try { await jobitdaApi.uploadResume(file); await refresh(); }
    catch (err) { setModalMsg(err instanceof JobitdaApiError ? err.message : "이력서 업로드에 실패했어요."); setModal("error"); }
    finally { setFileBusy(false); event.target.value = ""; }
  }
  async function logout() {
    const { createClient } = await import("@/lib/supabase/client");
    try { await createClient().auth.signOut(); } catch { }
    router.push("/");
  }

  if (loading) return <><SiteHeader role="youth" /><main className="page-shell mypage-shell"><div className="panel">내 정보를 불러오는 중이에요...</div></main></>;
  if (errMsg || !profile) return <><SiteHeader role="youth" /><main className="page-shell mypage-shell"><div className="panel"><h1>불러오지 못했어요</h1><p>{errMsg}</p><button className="btn btn-orange" onClick={() => location.reload()}>다시 시도</button></div></main></>;

  const resume = profile.resume;
  const mj = resume?.matching_json ?? null;
  return <><SiteHeader role="youth" name={profile.name} /><main className="page-shell mypage-shell"><h1 className="page-title">마이페이지</h1>
    <div className="mypage-stack"><section className="panel mypage-card"><div className="section-card-heading"><h2>내 정보</h2>{editing ? <div className="action-pair"><button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>취소</button><button className="btn btn-orange" type="button" onClick={save} disabled={saving}>{saving ? "저장 중..." : "저장"}</button></div> : <button className="btn btn-orange" type="button" onClick={startEdit}>정보 수정</button>}</div>
      {editing && draft ? <div className="mypage-edit"><label className="field-group"><span className="form-label">이름</span><input className="field" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label className="field-group"><span className="form-label">생년월일</span><input className="field" type="date" value={draft.birth_date} onChange={e => setDraft({ ...draft, birth_date: e.target.value })} /></label><div className="field-group"><span className="form-label">실거주지 주소 (시·도 / 시·군·구)</span><div className="input-row"><select className="field" aria-label="시·도 선택" value={draft.province} onChange={e => setDraft({ ...draft, province: e.target.value, district: "" })}>{PROVINCES.map(p => <option value={p} key={p}>{p}</option>)}</select><select className="field" aria-label="시·군·구 선택" value={draft.district} onChange={e => setDraft({ ...draft, district: e.target.value })} disabled={!draft.province}><option value="">시·군·구 선택</option>{getLocalities(draft.province).map(d => <option value={d} key={d}>{d}</option>)}</select></div></div><div className="field-group"><p className="form-label">희망직무 최대 3개</p><div className="chip-row">{CATEGORY_OPTIONS.map(o => <button key={o.id} type="button" className={`chip ${draft.categories.includes(o.id) ? "is-selected" : ""}`} onClick={() => toggleCategory(o.id)}>{o.label}</button>)}</div></div><p className="form-hint">이메일은 이 화면에서 변경할 수 없어요.</p></div> :
        <dl className="profile-dl"><dt>이름</dt><dd>{profile.name}</dd><dt>생년월일</dt><dd>{profile.birth_date} (만 {profile.age}세)</dd><dt>실거주지 주소</dt><dd>{formatRegion(profile.address.sido, profile.address.sigungu)}</dd><dt>희망직무</dt><dd>{profile.desired_categories.map(categoryLabel).join(", ")}</dd><dt>이메일</dt><dd>{profile.email} (변경 불가)</dd><dt>기본요건</dt><dd><span className={`pill ${policyTone(profile.youth_policy.status)}`}>{policyText(profile.youth_policy.status)}</span> <span className="small-text">{profile.youth_policy.disclaimer}</span></dd></dl>}
      {saved && <p className="alert alert-success">프로필이 저장됐어요.</p>}
    </section>
    <section className="panel mypage-card mypage-resume-card"><div className="section-card-heading"><h2>이력서</h2><label htmlFor="resume-reupload" className="btn btn-orange">{fileBusy ? "분석 중..." : "이력서 다시 올리기"}</label><input id="resume-reupload" className="visually-hidden" type="file" accept=".pdf,application/pdf" onChange={pickResume} disabled={fileBusy} /></div>
      <div className="file-summary">📄　<strong>{resume?.filename ?? "등록된 이력서가 없습니다"}</strong><span className="small-text">{resume ? (resume.extraction_status === "completed" ? "AI 분석 완료" : resume.extraction_status === "failed" ? "분석 실패 · 재업로드 권장" : "분석 처리 중") : "파일 업로드 전"}</span></div>
      {fileError && <p className="inline-error" role="alert">{fileError}</p>}
      <h3 className="profile-subheading">AI 분석 결과 <span className="pill pill-gray">읽기 전용</span></h3>
      {mj ? <><dl className="profile-dl"><dt>학력·전공</dt><dd>{[mj.education, mj.major].filter(Boolean).join(" · ") || "추출 없음"}</dd><dt>자격증</dt><dd>{mj.certificates.length ? mj.certificates.join(", ") : "추출 없음"}</dd><dt>보유 기술</dt><dd><div className="tags">{mj.skills.length ? mj.skills.map(s => <span className="pill pill-gray" key={s.id}>{skillLabel(s.id)}</span>) : <span className="subtle">추출 없음</span>}</div></dd><dt>경험</dt><dd>{mj.experiences.length ? mj.experiences.map((e, i) => <div key={i}>{e.title}<br /><span className="small-text">{e.evidence}</span></div>) : "추출 없음"}</dd></dl><p className="alert alert-amber">분석 결과는 직접 고칠 수 없어요. 바꾸려면 이력서를 다시 올리면 됩니다.</p></> :
        <p className="subtle">{resume && resume.extraction_status === "failed" ? "이력서 분석에 실패했어요. PDF를 다시 올려주세요." : "이력서를 등록하면 이 영역에 AI 분석 결과가 표시돼요."}</p>}
    </section>
    <section className="panel mypage-card"><h2>지원 내역 {apps.length}건</h2>
      {apps.length ? apps.map(app => <Link className="application-row" key={app.application_id} href={routes.job(app.job_id)}><div><span className="small-text">{app.company_name}</span><strong>{app.title}</strong><span className="small-text">{app.applied_at.slice(0, 10)} 지원</span></div><div className="tags">{gradeLabel(app.match_snapshot) && <span className="pill pill-indigo">지원 시점 적합도 {gradeLabel(app.match_snapshot)}</span>}<span className={`pill ${policyTone(app.policy_snapshot.status)}`}>{policyText(app.policy_snapshot.status)}</span><a className="pill pill-purple" href={resumePdfPath(app.application_id)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>이력서 PDF</a> ❯</div></Link>) : <p className="subtle">아직 지원한 공고가 없어요. <Link href={routes.youth} className="back-link">공고 보러 가기</Link></p>}
    </section></div>
    <button className="btn btn-ghost delete-account" onClick={() => setModal("logout")}>로그아웃</button>
    {modal === "logout" && <JobitdaModal title="로그아웃 하시겠습니까?" primaryLabel="네" secondaryLabel="아니요" onClose={() => setModal(null)} onPrimary={logout} />}
    {modal === "invalid" && <JobitdaModal title="입력 정보를 확인해주세요" message="이름·생년월일·실거주지·희망직무(1개 이상)를 확인해주세요." onClose={() => setModal(null)} />}
    {modal === "error" && <JobitdaModal title="문제가 발생했어요" message={modalMsg} onClose={() => setModal(null)} />}
  </main></>;
}
