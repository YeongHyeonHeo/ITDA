"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ChangeEvent, type FormEvent } from "react";
import SiteHeader from "@/components/SiteHeader";
import JobitdaModal from "@/components/JobitdaModal";
import { getLocalities, PROVINCES } from "@/lib/regions";
import { CATEGORY_OPTIONS } from "@/lib/categories";
import { routes } from "@/lib/jobitda-routes";
import { createClient } from "@/lib/supabase/client";
import { jobitdaApi, JobitdaApiError } from "@/lib/jobitda-api";
import type { CategoryId } from "@/contracts/matching";

type ModalName = "consent" | "duplicate" | "invalid" | "error" | null;
const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState(""); const [birth, setBirth] = useState("");
  const [province, setProvince] = useState("서울특별시"); const [district, setDistrict] = useState("");
  const [chosen, setChosen] = useState<CategoryId[]>([]);
  const [file, setFile] = useState<File | null>(null); const [email, setEmail] = useState("");
  const [password, setPassword] = useState(""); const [agreed, setAgreed] = useState(false);
  const [modal, setModal] = useState<ModalName>(null); const [error, setError] = useState("");
  const [modalMsg, setModalMsg] = useState(""); const [busy, setBusy] = useState(false); const [busyLabel, setBusyLabel] = useState("");
  const [role, setRole] = useState<"youth" | "company">("youth");

  function changeProvince(next: string) { setProvince(next); setDistrict(""); setError(""); }
  function toggleCategory(id: CategoryId) {
    setError("");
    setChosen(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 3 ? prev : [...prev, id]);
  }
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]; if (!picked) return;
    if (!picked.name.toLowerCase().endsWith(".pdf") || (picked.type !== "application/pdf" && picked.type !== "")) {
      setError("PDF 파일만 선택할 수 있어요."); event.target.value = ""; return;
    }
    if (picked.size > MAX_RESUME_BYTES) { setError("5MB 이하 PDF 파일을 선택해주세요."); event.target.value = ""; return; }
    setFile(picked); setError("");
  }

  function fail(message: string) { setModalMsg(message); setModal("error"); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (!agreed) { setModal("consent"); return; }
    if (!name.trim() || !birth || !province || !district || !chosen.length || !email.includes("@") || password.length < 8) {
      setError("이름·생년월일·주소·희망직무·이메일과 8자 이상 비밀번호를 확인해주세요."); setModal("invalid"); return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      // 1) Supabase Auth 가입
      setBusyLabel("계정을 만드는 중...");
      const { data, error: signErr } = await supabase.auth.signUp({ email: email.trim(), password });
      if (signErr) {
        if (/registered|already/i.test(signErr.message)) { setModal("duplicate"); return; }
        fail(signErr.message || "가입 처리 중 문제가 발생했어요."); return;
      }
      // 2) 세션 확보 (이메일 확인 비활성 프로젝트는 즉시 세션 발급)
      if (!data.session) {
        const { error: siErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (siErr) { fail("가입은 되었지만 로그인 세션을 만들지 못했어요. 이메일 인증이 필요한 설정일 수 있습니다."); return; }
      }
      // 3) 청년 프로필 생성 (Y01)
      setBusyLabel("프로필을 저장하는 중...");
      await jobitdaApi.createProfile({
        name: name.trim(), birth_date: birth,
        address: { sido: province, sigungu: district },
        desired_categories: chosen, privacy_consent: true,
      });
      // 4) 이력서 업로드 (선택, Y04) — 실패해도 가입 자체는 완료로 진행
      if (file) {
        setBusyLabel("이력서를 분석하는 중... (최대 40초)");
        try { await jobitdaApi.uploadResume(file); } catch { /* 이력서 실패는 마이페이지에서 재시도 가능 */ }
      }
      router.push(routes.youth);
    } catch (err) {
      if (err instanceof JobitdaApiError) {
        if (err.code === "PROFILE_ALREADY_EXISTS") { router.push(routes.youth); return; }
        if (err.code === "ROLE_FORBIDDEN") { fail("이미 기업 계정으로 등록된 이메일이에요. 기업 로그인을 이용해주세요."); return; }
        if (err.code === "CONSENT_REQUIRED") { setModal("consent"); return; }
        if (err.code === "VALIDATION_ERROR") { setModal("invalid"); return; }
        fail(err.message); return;
      }
      fail("가입 처리 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.");
    } finally { setBusy(false); setBusyLabel(""); }
  }

  return <><SiteHeader /><main className="page-shell narrow-shell signup-shell">
    <h1 className="page-title">{role === "youth" ? "청년 회원가입" : "기업 회원가입 안내"}</h1>
    <div className="seg-tabs" role="tablist" aria-label="가입 유형">
      <button type="button" role="tab" aria-selected={role === "youth"} className={role === "youth" ? "active-orange" : ""} onClick={() => setRole("youth")}>청년</button>
      <button type="button" role="tab" aria-selected={role === "company"} className={role === "company" ? "active-purple" : ""} onClick={() => setRole("company")}>기업</button>
    </div>
    {role === "company" ? <section className="panel company-signup-note"><h2>기업 계정은 사전 등록된 계정을 사용합니다</h2><p>해커톤 MVP에서는 기업 자체 회원가입과 실명 인증을 지원하지 않습니다. 등록된 기업 계정으로 로그인해 자사 지원자 목록을 확인할 수 있습니다.</p><Link href="/login?role=company" className="btn btn-purple">기업 로그인으로 이동</Link></section> :
      <form className="panel signup-form" noValidate onSubmit={submit}>
        <label className="field-group"><span className="form-label">이름</span><input className="field" value={name} onChange={e => setName(e.target.value)} placeholder="예: 홍길동" autoComplete="name" /></label>
        <label className="field-group"><span className="form-label">생년월일</span><input className="field" type="date" value={birth} onChange={e => setBirth(e.target.value)} max="2026-12-31" /><span className="form-hint">만 나이는 자동 계산 · 지원금 기본요건 만 18~39세 판정 시 사용</span></label>
        <div className="field-group"><label className="form-label" htmlFor="province">실거주지 주소 (시·도 / 시·군·구)</label><div className="input-row">
          <select id="province" className="field" value={province} aria-label="시·도 선택" onChange={e => changeProvince(e.target.value)}>{PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}</select>
          <select id="locality" className="field" value={district} aria-label="시·군·구 선택" disabled={!province} onChange={e => setDistrict(e.target.value)}><option value="">시·군·구 선택</option>{getLocalities(province).map(d => <option key={d} value={d}>{d}</option>)}</select>
        </div><p className="form-hint">실거주지 기준 시·도와 시·군·구를 선택해주세요. 상세 주소는 수집하지 않으며, 지원금 거주 요건(예: 서울 거주)은 제도별로 별도 확인합니다.</p></div>
        <div className="field-group"><p className="form-label">희망직무 카테고리 (최대 3개)</p><div className="chip-row" role="group" aria-label="희망직무 카테고리">{CATEGORY_OPTIONS.map(opt => <button className={`chip ${chosen.includes(opt.id) ? "is-selected" : ""}`} type="button" key={opt.id} aria-pressed={chosen.includes(opt.id)} onClick={() => toggleCategory(opt.id)}>{opt.label}</button>)}</div><p className="form-hint">{chosen.length}개 선택됨</p></div>
        <div className="field-group"><label className="form-label" htmlFor="resume">이력서 PDF (선택)</label><div className="upload-area"><div className="upload-inner"><span aria-hidden="true">📄</span><div className="upload-text"><strong>{file ? `${file.name} 선택됨` : "이력서 PDF를 업로드하세요."}</strong><small>{file ? "가입 시 함께 업로드·분석됩니다" : "텍스트 PDF · 5MB 이하"}</small></div><label htmlFor="resume" className="btn btn-orange">{file ? "이력서 재업로드" : "이력서 업로드"}</label></div><input id="resume" className="visually-hidden" type="file" accept=".pdf,application/pdf" onChange={chooseFile} /></div><p className="form-hint">올리지 않아도 가입 가능. 단, 이력서 등록 전에는 AI 맞춤 추천과 지원이 제한돼요.</p></div>
        <label className="field-group"><span className="form-label">이메일</span><input className="field" type="email" autoComplete="email" placeholder="demo@example.com" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label className="field-group"><span className="form-label">비밀번호</span><input className="field" type="password" autoComplete="new-password" placeholder="8자 이상" value={password} onChange={e => setPassword(e.target.value)} /><span className="form-hint">8자 이상</span></label>
        <label className="consent-box"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} /><span><strong>[필수] 개인정보 제공 동의</strong><small>지원한 기업에 이름·이메일·이력서 등 동의한 항목이 전달됩니다.</small></span></label>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <button className="btn btn-orange btn-wide submit-btn" type="submit" disabled={busy}>{busy ? (busyLabel || "처리 중...") : "가입하고 맞춤 공고 보기"}</button>
      </form>}
    {modal === "consent" && <JobitdaModal title="개인정보 제공 동의를 확인해주세요" message={"지원한 기업에 이름·이메일·이력서 등을 전달하려면 동의가 필요합니다.\n동의 후 가입을 진행해주세요."} onClose={() => setModal(null)} />}
    {modal === "duplicate" && <JobitdaModal title="이미 가입된 이메일이에요" message={`${email} 으로 가입된 계정이 있습니다. 로그인하거나 다른 이메일로 가입해주세요.`} primaryLabel="로그인하기" onClose={() => setModal(null)} onPrimary={() => router.push(routes.login)} />}
    {modal === "invalid" && <JobitdaModal title="입력 정보를 확인해주세요" message="필수 항목을 작성한 후 다시 시도해주세요." onClose={() => setModal(null)} />}
    {modal === "error" && <JobitdaModal title="가입을 완료하지 못했어요" message={modalMsg} onClose={() => setModal(null)} />}
  </main></>;
}
