"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import JobitdaModal from "@/components/JobitdaModal";
import {
  findDemoCompanyCandidates,
  type CompanyVerificationCandidate,
} from "@/lib/demo-company-verification";
import { routes } from "@/lib/jobitda-routes";

type VerificationState = "idle" | "not_found" | "choose" | "verified" | "registered";
type ModalKind = "terms" | "privacy" | "registered" | "duplicate_email" | "consent" | "invalid" | "complete" | null;

/**
 * D-40 / S2-C 기업회원 가입 시연.
 * 현 단계는 가상 명단 검증이며, Supabase 계정 생성 및 서버 인증은 수행하지 않습니다.
 */
export default function CompanySignupForm() {
  const router = useRouter();
  const [companyName, setCompanyName] = useState("");
  const [candidates, setCandidates] = useState<CompanyVerificationCandidate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [verification, setVerification] = useState<VerificationState>("idle");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalKind>(null);

  const verified = candidates.find(candidate => candidate.id === selectedId);
  const canSubmit = verification === "verified" && Boolean(verified) && termsAgreed && privacyAgreed && Boolean(email.trim()) && password.length >= 8;

  function updateCompanyName(nextName: string) {
    setCompanyName(nextName);
    setCandidates([]);
    setSelectedId("");
    setVerification("idle");
    setError("");
  }

  function verifyCompany() {
    setError("");
    setSelectedId("");
    const matches = findDemoCompanyCandidates(companyName);
    setCandidates(matches);
    if (matches.length === 0) {
      setVerification("not_found");
      return;
    }
    if (matches.every(company => company.alreadyRegistered)) {
      setVerification("registered");
      setModal("registered");
      return;
    }
    if (matches.length > 1) {
      setVerification("choose");
      return;
    }
    setSelectedId(matches[0].id);
    setVerification("verified");
  }

  function chooseCompany(id: string) {
    setSelectedId(id);
    setError("");
    const choice = candidates.find(candidate => candidate.id === id);
    if (!choice) {
      setVerification("choose");
    } else if (choice.alreadyRegistered) {
      setVerification("registered");
      setModal("registered");
    } else {
      setVerification("verified");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (verification !== "verified" || !verified) {
      setError("기업명 인증을 먼저 완료해주세요.");
      return;
    }
    if (!termsAgreed || !privacyAgreed) {
      setModal("consent");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || password.length < 8) {
      setModal("invalid");
      return;
    }
    // 이미 사용 중인 이메일 오류를 재현하는 가상 시연값입니다.
    if (email.trim().toLowerCase() === "registered@example.com") {
      setModal("duplicate_email");
      return;
    }
    setPassword(""); // 비밀번호는 보관하지 않고 시연 종료 시 즉시 비웁니다.
    setModal("complete");
  }

  return <>
    <form className="panel signup-form company-signup-form" noValidate onSubmit={submit}>
      <p className="demo-form-note" role="note">
        <strong>기업 가입 UI 시연입니다.</strong> 기업명 인증은 가상 명단으로만 확인하며 실제 기업 인증·계정 생성은 수행하지 않습니다.
        실제 기업 이메일과 평소 사용하는 비밀번호를 입력하지 마세요.
      </p>

      <div className="field-group">
        <label className="form-label" htmlFor="company-signup-name">기업명</label>
        <div className="company-verify-row">
          <input
            id="company-signup-name"
            className="field"
            type="text"
            value={companyName}
            onChange={event => updateCompanyName(event.target.value)}
            placeholder="기업명을 입력해주세요"
            autoComplete="off"
          />
          <button type="button" className="btn btn-purple" onClick={verifyCompany} disabled={!companyName.trim()}>
            인증하기
          </button>
        </div>
        <p className="form-hint">서울형 강소기업 인증 명단 확인 (현재는 시연용 예시 데이터)</p>
        {verification === "not_found" && <p className="company-verify-feedback is-error" role="status">
          JOB잇다는 서울형 강소기업만 가입할 수 있어요. (시연 명단에서 찾지 못했습니다.)
        </p>}
        {verification === "choose" && <div className="company-choice-box">
          <label className="form-label" htmlFor="company-signup-candidate">동일한 기업명이 있습니다. 자치구를 선택해주세요.</label>
          <select id="company-signup-candidate" className="field" value={selectedId} onChange={event => chooseCompany(event.target.value)}>
            <option value="">기업 소재 자치구 선택</option>
            {candidates.map(company => <option key={company.id} value={company.id}>
              {company.name} · {company.district}
            </option>)}
          </select>
        </div>}
        {verification === "verified" && verified && <p className="company-verify-feedback is-success" role="status">
          ✓ 서울형 강소기업 인증 확인 (시연) · {verified.name} · {verified.district}
        </p>}
        {verification === "registered" && <p className="company-verify-feedback is-error" role="status">
          이미 JOB잇다에 가입된 기업입니다. (시연)
        </p>}
      </div>

      <div className="field-group">
        <label className="form-label" htmlFor="company-signup-email">아이디 (이메일)</label>
        <input id="company-signup-email" className="field" type="email" value={email}
          onChange={event => setEmail(event.target.value)} placeholder="demo-company@example.com" autoComplete="off" />
      </div>
      <div className="field-group">
        <label className="form-label" htmlFor="company-signup-password">비밀번호</label>
        <input id="company-signup-password" className="field" type="password" value={password}
          onChange={event => setPassword(event.target.value)} placeholder="8자 이상 (시연용)" autoComplete="new-password" />
        <p className="form-hint">8자 이상 · 서버에 전송하거나 브라우저에 저장하지 않습니다.</p>
      </div>

      <div className="company-agreements">
        <div className="company-agreement-row">
          <label><input type="checkbox" checked={termsAgreed} onChange={event => setTermsAgreed(event.target.checked)} />
            <span><strong>[필수]</strong> JOB잇다 기업회원 이용약관에 동의합니다.</span>
          </label>
          <button type="button" className="company-view-link" onClick={() => setModal("terms")}>보기</button>
        </div>
        <div className="company-agreement-row">
          <label><input type="checkbox" checked={privacyAgreed} onChange={event => setPrivacyAgreed(event.target.checked)} />
            <span><strong>[필수]</strong> 개인정보 수집·이용에 동의합니다.</span>
          </label>
          <button type="button" className="company-view-link" onClick={() => setModal("privacy")}>보기</button>
        </div>
      </div>
      <p className="form-hint">동의 상태는 시연 화면에서만 사용되며 실제 동의 기록은 생성되지 않습니다.</p>
      {error && <p className="inline-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-purple btn-wide company-signup-submit" disabled={!canSubmit}>
        가입하기
      </button>
      <p className="company-signup-example">
        시연 테스트: <code>주식회사 블렌드엑스</code> (성공) · <code>시연기업 중복</code> (자치구 선택) ·
        <code>시연기업 기가입</code> (이미 가입)
      </p>
    </form>

    {modal === "terms" && <JobitdaModal accent="purple" title="기업회원 이용약관" onClose={() => setModal(null)}>
      <div className="company-terms-placeholder">
        <p><strong>약관 전문 연동 전</strong></p>
        <p>구현용 PRD 5-8의 확정된 기업회원 이용약관 전문이 아직 제공되지 않았습니다. 실제 서비스에서는 해당 전문을 이 위치에 표시해야 합니다.</p>
        <p>현재 화면은 동의 체크박스와 전문 열람 팝업의 UI 시연용이며 법적 동의는 수집하지 않습니다.</p>
      </div>
    </JobitdaModal>}
    {modal === "privacy" && <JobitdaModal accent="purple" title="개인정보 수집·이용 동의" onClose={() => setModal(null)}>
      <div className="company-terms-placeholder">
        <p><strong>동의 전문 연동 전</strong></p>
        <p>구현용 PRD 5-8의 개인정보 수집·이용 동의 전문을 확정한 후 이 위치에 반영해야 합니다. 실제 데이터 수집이나 동의 저장은 수행하지 않습니다.</p>
      </div>
    </JobitdaModal>}
    {modal === "registered" && <JobitdaModal accent="purple" title="이미 가입된 기업입니다" message={"이미 JOB잇다에 가입된 기업입니다.\n기존 계정으로 로그인해주세요. (시연용 예시)"} onClose={() => setModal(null)} />}
    {modal === "duplicate_email" && <JobitdaModal accent="purple" title="이미 가입된 이메일이에요" message={"이미 가입된 이메일입니다. 다른 이메일을 사용해주세요.\n(시연용 예시)"} onClose={() => setModal(null)} />}
    {modal === "consent" && <JobitdaModal accent="purple" title="필수 동의를 확인해주세요" message="기업회원 이용약관과 개인정보 수집·이용 동의에 모두 체크해주세요." onClose={() => setModal(null)} />}
    {modal === "invalid" && <JobitdaModal accent="purple" title="입력 정보를 확인해주세요" message="이메일 형식과 8자 이상 비밀번호를 확인해주세요." onClose={() => setModal(null)} />}
    {modal === "complete" && <JobitdaModal accent="purple" title="기업 회원가입 화면 시연 완료" message={"가상 기업 정보 입력과 필수 항목 확인을 마쳤습니다.\n실제 계정은 생성되지 않았습니다."} primaryLabel="기업 화면 보기" onClose={() => setModal(null)} onPrimary={() => {setModal(null); router.push(routes.company);}} />}
  </>;
}
