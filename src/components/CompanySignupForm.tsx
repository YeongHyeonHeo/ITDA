"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import JobitdaModal from "@/components/JobitdaModal";
import { routes } from "@/lib/jobitda-routes";
import { createClient } from "@/lib/supabase/client";
import { jobitdaApi, JobitdaApiError } from "@/lib/jobitda-api";
import type { CompanySummary } from "@/contracts/api";

type VerificationState = "idle" | "not_found" | "choose" | "verified";
type ModalKind = "terms" | "privacy" | "consent" | "invalid" | "error" | null;

/**
 * D-40 / S2-C 기업회원 가입 — 실제 API 연동.
 * 기업 검색(GET /api/companies) → Supabase 계정 생성 → 기업 연결(POST /api/company/profile).
 */
export default function CompanySignupForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [candidates, setCandidates] = useState<CompanySummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [verification, setVerification] = useState<VerificationState>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalKind>(null); const [modalMsg, setModalMsg] = useState("");
  const [searching, setSearching] = useState(false); const [busy, setBusy] = useState(false);

  const verified = candidates.find((c) => c.id === selectedId);
  const canSubmit = verification === "verified" && Boolean(verified) && termsAgreed && privacyAgreed && Boolean(email.trim()) && password.length >= 8 && !busy;

  function updateCompanyName(next: string) {
    setCompanyName(next); setCandidates([]); setSelectedId(""); setVerification("idle"); setError("");
  }
  async function verifyCompany() {
    setError(""); setSelectedId(""); setSearching(true);
    try {
      const { companies } = await jobitdaApi.companies(companyName.trim());
      setCandidates(companies);
      if (companies.length === 0) { setVerification("not_found"); return; }
      if (companies.length === 1) { setSelectedId(companies[0].id); setVerification("verified"); return; }
      setVerification("choose");
    } catch {
      setError("기업 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요."); setVerification("idle");
    } finally { setSearching(false); }
  }
  function chooseCompany(id: string) {
    setSelectedId(id); setError("");
    setVerification(id ? "verified" : "choose");
  }
  function fail(message: string) { setModalMsg(message); setModal("error"); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (verification !== "verified" || !verified) { setError("기업명 검색·선택을 먼저 완료해주세요."); return; }
    if (!termsAgreed || !privacyAgreed) { setModal("consent"); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || password.length < 8) { setModal("invalid"); return; }

    setBusy(true);
    try {
      const supabase = createClient();
      const { data, error: signErr } = await supabase.auth.signUp({ email: email.trim(), password });
      if (signErr) {
        if (/registered|already/i.test(signErr.message)) { fail("이미 가입된 이메일이에요. 기업 로그인을 이용하거나 다른 이메일로 가입해주세요."); return; }
        fail(signErr.message || "가입 처리 중 문제가 발생했어요."); return;
      }
      if (!data.session) {
        const { error: siErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (siErr) { fail("가입은 되었지만 로그인 세션을 만들지 못했어요. 이메일 인증이 필요한 설정일 수 있습니다."); return; }
      }
      await jobitdaApi.createCompanyProfile({ company_id: verified.id });
      router.push(routes.company);
    } catch (err) {
      if (err instanceof JobitdaApiError) {
        if (err.code === "PROFILE_ALREADY_EXISTS") { router.push(routes.company); return; }
        if (err.code === "ROLE_FORBIDDEN") { fail("이미 청년 계정으로 가입된 이메일이에요. 다른 이메일로 기업 가입을 진행해주세요."); return; }
        if (err.code === "COMPANY_NOT_FOUND") { fail("선택한 기업을 찾을 수 없어요. 기업명을 다시 검색해주세요."); return; }
        fail(err.message); return;
      }
      fail("가입 처리 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.");
    } finally { setBusy(false); }
  }

  return <>
    <form className="panel signup-form company-signup-form" noValidate onSubmit={submit}>
      <p className="demo-form-note" role="note">
        <strong>서울형 강소기업만 가입할 수 있어요.</strong> 기업명을 검색해 소속 기업을 선택한 뒤 가입하면 자사 지원자 목록을 확인할 수 있습니다.
      </p>

      <div className="field-group">
        <label className="form-label" htmlFor="company-signup-name">기업명</label>
        <div className="company-verify-row">
          <input id="company-signup-name" className="field" type="text" value={companyName}
            onChange={(e) => updateCompanyName(e.target.value)} placeholder="기업명을 입력해주세요" autoComplete="off" />
          <button type="button" className="btn btn-purple" onClick={verifyCompany} disabled={!companyName.trim() || searching}>
            {searching ? "검색 중..." : "검색하기"}
          </button>
        </div>
        <p className="form-hint">서울형 강소기업 명단에서 검색합니다.</p>
        {verification === "not_found" && <p className="company-verify-feedback is-error" role="status">
          서울형 강소기업 명단에서 찾지 못했어요. 기업명을 다시 확인해주세요.
        </p>}
        {verification === "choose" && <div className="company-choice-box">
          <label className="form-label" htmlFor="company-signup-candidate">검색 결과가 여러 건입니다. 소재 자치구로 선택해주세요.</label>
          <select id="company-signup-candidate" className="field" value={selectedId} onChange={(e) => chooseCompany(e.target.value)}>
            <option value="">기업 선택</option>
            {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.gu ?? "지역 미상"}</option>)}
          </select>
        </div>}
        {verification === "verified" && verified && <p className="company-verify-feedback is-success" role="status">
          ✓ {verified.name} · {verified.gu ?? "지역 미상"} 선택됨
        </p>}
      </div>

      <div className="field-group">
        <label className="form-label" htmlFor="company-signup-email">아이디 (이메일)</label>
        <input id="company-signup-email" className="field" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)} placeholder="company@company.com" autoComplete="email" />
      </div>
      <div className="field-group">
        <label className="form-label" htmlFor="company-signup-password">비밀번호</label>
        <input id="company-signup-password" className="field" type="password" value={password}
          onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상" autoComplete="new-password" />
        <p className="form-hint">8자 이상</p>
      </div>

      <div className="company-agreements">
        <div className="company-agreement-row">
          <label><input type="checkbox" checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)} />
            <span><strong>[필수]</strong> JOB잇다 기업회원 이용약관에 동의합니다.</span>
          </label>
          <button type="button" className="company-view-link" onClick={() => setModal("terms")}>보기</button>
        </div>
        <div className="company-agreement-row">
          <label><input type="checkbox" checked={privacyAgreed} onChange={(e) => setPrivacyAgreed(e.target.checked)} />
            <span><strong>[필수]</strong> 개인정보 수집·이용에 동의합니다.</span>
          </label>
          <button type="button" className="company-view-link" onClick={() => setModal("privacy")}>보기</button>
        </div>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-purple btn-wide company-signup-submit" disabled={!canSubmit}>
        {busy ? "가입 처리 중..." : "가입하기"}
      </button>
    </form>

    {modal === "terms" && <JobitdaModal accent="purple" title="기업회원 이용약관" onClose={() => setModal(null)}>
      <div className="company-terms-placeholder"><p><strong>약관 전문 연동 전</strong></p><p>확정된 기업회원 이용약관 전문을 이 위치에 표시합니다.</p></div>
    </JobitdaModal>}
    {modal === "privacy" && <JobitdaModal accent="purple" title="개인정보 수집·이용 동의" onClose={() => setModal(null)}>
      <div className="company-terms-placeholder"><p><strong>동의 전문 연동 전</strong></p><p>개인정보 수집·이용 동의 전문을 이 위치에 반영합니다.</p></div>
    </JobitdaModal>}
    {modal === "consent" && <JobitdaModal accent="purple" title="필수 동의를 확인해주세요" message="기업회원 이용약관과 개인정보 수집·이용 동의에 모두 체크해주세요." onClose={() => setModal(null)} />}
    {modal === "invalid" && <JobitdaModal accent="purple" title="입력 정보를 확인해주세요" message="이메일 형식과 8자 이상 비밀번호를 확인해주세요." onClose={() => setModal(null)} />}
    {modal === "error" && <JobitdaModal accent="purple" title="가입을 완료하지 못했어요" message={modalMsg} onClose={() => setModal(null)} />}
  </>;
}
