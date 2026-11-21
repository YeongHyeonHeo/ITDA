import type { JobMatchingJson, MatchResult, ResumeMatchingJson } from "./matching";
import type { MainResponse } from "./api";
// Fictional, frontend-only fixtures. Never substitute these for production AI output.
export const jobMatchingFixture = {
  schema_version: "matching-v1", taxonomy_version: "v1",
  categories: [{ id: "it_data", evidence: "데이터 분석 신입 채용" }],
  required_skills: [{ id: "sql_db", evidence: "SQL 활용 가능자" }, { id: "data_analysis", evidence: "데이터 분석 역량" }],
  preferred_skills: [{ id: "python", evidence: "Python 우대" }],
  experience_requirements: [{ id: "data_reporting", evidence: "대시보드 제작 경험" }, { id: "market_customer_research", evidence: "고객 리서치 경험" }],
  career: { accepts_new_graduate: true, accepts_experienced: false, min_months: null, max_months: null, evidence: "신입 채용" },
  unmapped: [],
} satisfies JobMatchingJson;
export const resumeMatchingFixture = {
  education: "OO대학교 경영학 졸업",
  major: "경영학",
  certificates: ["컴퓨터활용능력 2급"],
  schema_version: "matching-v1", taxonomy_version: "v1",
  skills: [{ id: "sql_db", evidence: "SQL로 데이터 분석 및 대시보드 제작" }, { id: "data_analysis", evidence: "SQL로 데이터 분석 및 대시보드 제작" }],
  experiences: [{ id: "exp_1", kind: "project", title: "교내 대시보드", evidence: "SQL로 데이터 분석 및 대시보드 제작", competency_ids: ["data_reporting"], start_month: null, end_month: null, is_current: null }],
  career: { declared_total_months: 0, explicitly_no_experience: true, evidence: "직장 경력 없음" },
  unmapped: [],
} satisfies ResumeMatchingJson;
export const matchFixture = {
  status: "ready", score: 77.5, fit_grade: "high",
  breakdown: {
    category: { score: 20, max_score: 20, matched_ids: ["it_data"], missing_ids: [], needs_check: false },
    skills: { score: 30, max_score: 40, matched_ids: ["sql_db", "data_analysis"], missing_ids: ["python"], needs_check: false },
    experience: { score: 12.5, max_score: 25, matched_ids: ["data_reporting"], missing_ids: ["market_customer_research"], needs_check: false },
    career: { score: 15, max_score: 15, matched_ids: [], missing_ids: [], needs_check: false },
  },
  recommendable: true, reason: "SQL·데이터 분석 역량과 대시보드 제작 경험이 공고와 일치합니다.",
  needs_check: [], algorithm_version: "rules-v1-20-40-25-15", profile_version: 1, job_version: 1, taxonomy_version: "v1", evaluated_month: "2026-11-01",
} satisfies MatchResult;
const jobCard = {
  job_id: "00000000-0000-4000-8000-000000000001",
  company: { id: "00000000-0000-4000-8000-000000000002", name: "가상 데이터기업", industry: "데이터·AI 서비스업", gu: "마포구", is_demo: true },
  title: "데이터 분석 신입 채용", categories: ["it_data"], employment_kind: "regular",
  location: "서울 마포구", deadline: null, is_closed: false, applied: false,
  can_apply: true, apply_block_reason: null, match: matchFixture,
  policy: { status: "needs_check", items: { age: "unknown", residence: "unknown", regular: "pass" }, disclaimer: "입력정보 기반 예비진단이며 지원금 수급을 확정하지 않습니다." },
} satisfies MainResponse["postings"][number];
export const mainFixture = {
  youth_summary: {
    name: "김민수",
    age: 25,
    address: { sido: "서울특별시", sigungu: "마포구" },
    youth_policy: {
      status: "eligible",
      items: { age: "pass", residence: "pass" },
      disclaimer: "입력정보 기반 예비진단이며 지원금 수급을 확정하지 않습니다.",
    },
  },
  has_resume: true,
  recommended: [jobCard],
  postings: [jobCard],
  fallback_used: false,
} satisfies MainResponse;
