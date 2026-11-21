"use client";

import {
  subsidyClasses, subsidyLabel,
  type CompanyPosting, type CompanySubsidy,
} from "@/lib/company-dashboard";

/**
 * A7: A single controlled panel. The parent owns the selected posting ID,
 * so this cannot drift apart from the posting selector/applicant table.
 */
type Props = {
  posting: CompanyPosting | null;
  subsidy: CompanySubsidy | null;
  preview: boolean;
  loading?: boolean;
  error?: string | null;
};

export default function CompanySubsidyPanel({posting, subsidy, preview, loading, error}: Props) {
  return <section className="company-subsidy-box" aria-labelledby="company-subsidy-heading">
    <div className="company-subsidy-heading">
      <div>
        <h2 id="company-subsidy-heading">공고별 지원금 예비진단</h2>
        <p>선택한 공고의 고용형태 기준 판정입니다. 최종 지원금 지급을 보장하지 않습니다.</p>
      </div>
      {preview && <span className="pill pill-purple">시연 데이터</span>}
    </div>
    {loading ? <p className="company-subsidy-feedback" role="status">자사 채용공고를 불러오는 중이에요.</p>
      : error ? <p className="company-subsidy-feedback" role="alert">{error}</p>
      : !posting ? <p className="company-subsidy-feedback">조회할 자사 공고가 없습니다.</p>
      : <div className="company-subsidy-detail" aria-live="polite">
          <span className="company-subsidy-label">선택한 공고</span>
          <div className="company-subsidy-result">
            <strong>{posting.title}</strong>
            <span className={`pill ${subsidy ? subsidyClasses[subsidy.status] : "pill-gray"}`}>
              {subsidyLabel(subsidy)}
            </span>
          </div>
          {subsidy?.employmentKindRaw && <p className="company-subsidy-meta">고용형태: {subsidy.employmentKindRaw}</p>}
          <p className="company-subsidy-reason">
            {subsidy?.reason ?? "지원금 판정 근거가 전달되지 않았습니다. 기업 담당자가 확인해야 합니다."}
          </p>
        </div>}
    <p className="company-subsidy-disclaimer">
      ※ 공고별 지원금 판정은 지원자별 기본요건과 구분되며, 채용 판단의 자동 기준이 아닙니다.
    </p>
  </section>;
}
