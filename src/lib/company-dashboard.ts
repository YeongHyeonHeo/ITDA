/**
 * D-38 / PRD v1.5 A7: normalize company posting subsidy data for the UI.
 * The server alone decides subsidy eligibility; do not infer it from the job title.
 */
export type SubsidyStatus = "eligible" | "needs_check" | "ineligible";
export type CompanySubsidy = {
  status: SubsidyStatus;
  reason: string | null;
  employmentKindRaw: string | null;
};
export type CompanyPosting = {
  id: string;
  title: string;
  applicantCount: number | null;
  subsidy: CompanySubsidy | null;
};

export const PREVIEW_POSTINGS: CompanyPosting[] = [
  {
    id: "marketing-content", title: "콘텐츠 마케터 (신입) · 정규직 (시연)", applicantCount: 4,
    subsidy: {status: "eligible", employmentKindRaw: "정규직", reason: "정규직으로 기재되어 고용형태 요건 충족 가능 (가상 판정)"},
  },
  {
    id: "another-job", title: "홍보 인턴 · 인턴 (시연)", applicantCount: 0,
    subsidy: {status: "ineligible", employmentKindRaw: "인턴", reason: "인턴 채용이므로 정규직 채용 요건 불일치 (가상 판정)"},
  },
  {
    id: "mixed-job", title: "마케팅 지원 · 정규직/인턴 혼합 (시연)", applicantCount: 0,
    subsidy: {status: "needs_check", employmentKindRaw: "정규직 / 인턴", reason: "고용형태가 혼합 기재되어 확인 필요 (가상 판정)"},
  },
];

export const subsidyLabels: Record<SubsidyStatus, string> = {
  eligible: "지원금 대상 공고",
  needs_check: "고용형태 확인 필요",
  ineligible: "지원금 대상 아님",
};
export const subsidyClasses: Record<SubsidyStatus, string> = {
  eligible: "pill-green",
  needs_check: "pill-warn",
  ineligible: "pill-red",
};

export function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
export function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
export function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
export function arrayStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue).filter((v): v is string => v !== null) : [];
}

export function parseSubsidy(value: unknown): CompanySubsidy | null {
  const item = record(value);
  const status = item?.status ?? value;
  if (status !== "eligible" && status !== "ineligible" && status !== "needs_check") return null;
  return {
    status,
    reason: stringValue(item?.reason),
    employmentKindRaw: stringValue(item?.employment_kind_raw)
      ?? stringValue(item?.employment_type_raw),
  };
}

export function parseOverviewPostings(value: unknown): CompanyPosting[] {
  const result = record(value);
  if (!Array.isArray(result?.companies)) return [];
  const postings: CompanyPosting[] = [];
  for (const value of result.companies) {
    const company = record(value);
    if (!Array.isArray(company?.jobs)) continue;
    for (const row of company.jobs) {
      const job = record(row);
      const id = stringValue(job?.job_id);
      const title = stringValue(job?.title);
      if (!id || !title || postings.some(p => p.id === id)) continue;
      // Accept both naming conventions until the backend contract is finalized.
      const subsidy = parseSubsidy(job?.subsidy ?? job?.job_subsidy);
      postings.push({id, title, applicantCount: numberValue(job?.applicant_count), subsidy});
    }
  }
  return postings;
}

export function parseDetailedSubsidy(value: unknown): CompanySubsidy | null {
  const response = record(value);
  const job = record(response?.job);
  return parseSubsidy(job?.job_subsidy ?? job?.subsidy ?? response?.job_subsidy);
}

export function subsidyLabel(subsidy: CompanySubsidy | null): string {
  return subsidy ? subsidyLabels[subsidy.status] : "판정 정보 없음";
}
