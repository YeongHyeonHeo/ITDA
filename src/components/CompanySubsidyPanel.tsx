"use client";

import { useEffect, useState } from "react";
import { jobitdaApi } from "@/lib/jobitda-api";

/**
 * D-38: 기업 채용공고 자체의 지원금 대상 여부.
 * NOTE: 지원자 개개인의 policy_snapshot과는 별개의 판정입니다.
 * 회사/지원자 권한 검증과 실제 판정은 서버 API만 수행합니다.
 */
type SubsidyStatus = "eligible" | "needs_check" | "ineligible";
type Subsidy = {
  status: SubsidyStatus;
  reason: string | null;
  employmentKindRaw: string | null;
};
type JobEntry = {
  id: string;
  title: string;
  subsidy: Subsidy | null;
};

type Props = { preview: boolean };

const DEMO_JOBS: JobEntry[] = [
  {
    id: "marketing-content",
    title: "콘텐츠 마케터 (신입) · 정규직 (시연)",
    subsidy: {
      status: "eligible",
      reason: "정규직 채용공고로 설정된 시연 예시입니다.",
      employmentKindRaw: "정규직",
    },
  },
  {
    id: "another-job",
    title: "홍보 인턴 · 인턴 (시연)",
    subsidy: {
      status: "ineligible",
      reason: "인턴 채용으로 설정되어 정규직 채용 요건에 해당하지 않는 시연 예시입니다.",
      employmentKindRaw: "인턴",
    },
  },
  {
    id: "mixed-job",
    title: "마케팅 지원 · 정규직/인턴 혼합 (시연)",
    subsidy: {
      status: "needs_check",
      reason: "정규직과 인턴이 함께 기재되어 채용 형태를 추가로 확인해야 하는 시연 예시입니다.",
      employmentKindRaw: "정규직 / 인턴",
    },
  },
];

const LABELS: Record<SubsidyStatus, string> = {
  eligible: "지원금 대상 가능",
  needs_check: "확인 필요",
  ineligible: "지원금 대상 아님",
};
const CLASSES: Record<SubsidyStatus, string> = {
  eligible: "pill-green",
  needs_check: "pill-warn",
  ineligible: "pill-red",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * C01에는 `subsidy`, C02에는 `job_subsidy`가 추가되었다는 개발팀 변경사항을 반영.
 * 누락/예상 밖 상태는 임의로 '대상 가능'이나 '대상 아님'으로 단정하지 않습니다.
 */
function readSubsidy(value: unknown): Subsidy | null {
  const raw = asRecord(value);
  const status = raw ? raw.status : value;
  if (status !== "eligible" && status !== "needs_check" && status !== "ineligible") {
    return null;
  }
  return {
    status,
    reason: asString(raw?.reason),
    employmentKindRaw: asString(raw?.employment_kind_raw) ?? asString(raw?.employment_type_raw),
  };
}

function readOverviewJobs(value: unknown): JobEntry[] {
  const response = asRecord(value);
  if (!Array.isArray(response?.companies)) return [];

  const entries: JobEntry[] = [];
  for (const company of response.companies) {
    const group = asRecord(company);
    if (!Array.isArray(group?.jobs)) continue;
    for (const jobValue of group.jobs) {
      const job = asRecord(jobValue);
      if (!job) continue;
      const id = asString(job.job_id);
      const title = asString(job.title);
      if (!id || !title) continue;
      // The developer's C01 change names the property `subsidy`.
      // `job_subsidy` is accepted for compatibility with any newer contract.
      entries.push({
        id,
        title,
        subsidy: readSubsidy(job.subsidy ?? job.job_subsidy),
      });
    }
  }
  return entries;
}

function SubsidyBadge({ subsidy }: { subsidy: Subsidy | null }) {
  return subsidy ? (
    <span className={`pill ${CLASSES[subsidy.status]}`}>{LABELS[subsidy.status]}</span>
  ) : (
    <span className="pill pill-gray">판정 정보 없음</span>
  );
}

export default function CompanySubsidyPanel({ preview }: Props) {
  const [jobs, setJobs] = useState<JobEntry[]>(preview ? DEMO_JOBS : []);
  const [selectedJobId, setSelectedJobId] = useState(preview ? DEMO_JOBS[0].id : "");
  const [detail, setDetail] = useState<{ id: string; subsidy: Subsidy } | null>(null);
  const [loading, setLoading] = useState(!preview);
  const [error, setError] = useState<string | null>(null);

  // Real company page: fetch only the authenticated company's own jobs.
  useEffect(() => {
    if (preview) return;
    let active = true;
    jobitdaApi.companyOverview()
      .then((response) => {
        if (!active) return;
        const next = readOverviewJobs(response);
        setJobs(next);
        setSelectedJobId(next[0]?.id ?? "");
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setError("공고별 지원금 정보를 불러오지 못했습니다. 기업 계정 로그인 및 API 연결 상태를 확인해주세요.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [preview]);

  // C02: select a job to fetch the source reason (if supplied by the API).
  useEffect(() => {
    if (preview || !selectedJobId) return;
    let active = true;
    jobitdaApi.applicants(selectedJobId, "all")
      .then((response) => {
        if (!active) return;
        const payload = asRecord(response);
        const job = asRecord(payload?.job);
        const resolved = readSubsidy(job?.job_subsidy ?? payload?.job_subsidy ?? job?.subsidy);
        setDetail(resolved ? { id: selectedJobId, subsidy: resolved } : null);
      })
      .catch(() => {
        if (active) setDetail(null); // Keep C01's result; do not fabricate a reason.
      });
    return () => { active = false; };
  }, [preview, selectedJobId]);

  const selectedJob = jobs.find((item) => item.id === selectedJobId);
  const selectedSubsidy =
    detail?.id === selectedJobId && detail.subsidy ? detail.subsidy : selectedJob?.subsidy ?? null;

  return (
    <section className="company-subsidy-box" aria-labelledby="company-subsidy-heading">
      <div className="company-subsidy-heading">
        <div>
          <h2 id="company-subsidy-heading">공고별 지원금 예비진단</h2>
          <p>공고의 고용형태를 기준으로 정규직 채용 요건을 확인합니다.</p>
        </div>
        {preview && <span className="pill pill-purple">시연 데이터</span>}
      </div>

      {loading ? (
        <p className="company-subsidy-feedback" role="status">기업 공고 정보를 불러오는 중입니다.</p>
      ) : error ? (
        <p className="company-subsidy-feedback" role="alert">{error}</p>
      ) : jobs.length === 0 ? (
        <p className="company-subsidy-feedback">조회할 자사 공고가 없습니다.</p>
      ) : (
        <div className="company-subsidy-layout">
          <div className="company-subsidy-list" role="group" aria-label="지원금 예비진단 공고 목록">
            {jobs.map((job) => (
              <button
                type="button"
                key={job.id}
                className="company-subsidy-job"
                aria-pressed={selectedJobId === job.id}
                onClick={() => { setSelectedJobId(job.id); setDetail(null); }}
              >
                <span className="company-subsidy-job-title">{job.title}</span>
                <SubsidyBadge subsidy={job.subsidy} />
              </button>
            ))}
          </div>

          <div className="company-subsidy-detail" aria-live="polite">
            <span className="company-subsidy-label">선택한 공고의 판정</span>
            <div className="company-subsidy-result">
              <strong>{selectedJob?.title ?? "공고 선택"}</strong>
              <SubsidyBadge subsidy={selectedSubsidy} />
            </div>
            {selectedSubsidy?.employmentKindRaw && (
              <p className="company-subsidy-meta">고용형태 원문: {selectedSubsidy.employmentKindRaw}</p>
            )}
            <p className="company-subsidy-reason">
              {selectedSubsidy?.reason ?? "판정 근거가 제공되지 않았습니다. 담당자 확인이 필요합니다."}
            </p>
          </div>
        </div>
      )}
      <p className="company-subsidy-disclaimer">
        ※ 공고별 정규직 요건의 예비판정입니다. 청년 지원 가능 여부 및 지원자별 기본요건과 별개이며,
        지원금 수급은 최종 심사를 통해 결정됩니다.
      </p>
    </section>
  );
}
