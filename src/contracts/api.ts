/** API v1 target contract. Business routes are not implemented yet. */
import type { CategoryId, ExtractionStatus, JobMatchingJson, MatchResult, ResumeMatchingJson } from "./matching";
export type PolicyStatus = "eligible" | "needs_check" | "ineligible";
export type ApiError = { error: { code: string; message: string } };
export type PolicyResult = {
  status: PolicyStatus;
  items: { age: "pass" | "fail" | "unknown"; residence: "pass" | "fail" | "unknown"; regular: "pass" | "fail" | "unknown" };
  disclaimer: string;
};
export type YouthPolicyResult = {
  status: PolicyStatus;
  items: { age: "pass" | "fail" | "unknown"; residence: "pass" | "fail" | "unknown" };
  disclaimer: string;
};
export type MeResponse = {
  user_id: string;
  role: "youth" | "company" | null;
  onboarding_complete: boolean;
  company_ids: string[];
};
export type ProfileInput = {
  name: string;
  birth_date: string; // YYYY-MM-DD (서버에서 KST 기준 만 나이 계산)
  address: { sido: string; sigungu: string };
  desired_categories: CategoryId[]; // 중복 없는 1~3개
};
export type CreateProfileRequest = ProfileInput & { privacy_consent: true };
export type UpdateProfileRequest = Partial<ProfileInput>;
export type ProfileResponse = ProfileInput & {
  age: number; // KST 기준 계산된 만 나이
  email: string; // S6 내 정보 표시용 (변경 불가)
  youth_policy: YouthPolicyResult; // 연령·서울 거주 기준 예비진단
  user_id: string;
  profile_version: number;
  privacy_consent_at: string;
  resume: ResumeResponse | null;
};
export type ResumeResponse = {
  resume_id: string;
  filename: string;
  uploaded_at: string;
  extraction_status: ExtractionStatus;
  extraction_error: { code: string; message: string } | null;
  matching_json: ResumeMatchingJson | null;
  profile_version: number;
};
export type CompanyParticipation = "participating" | "non_participating";
export type CompanySummary = {
  id: string;
  name: string;
  industry: string | null;
  gu: string | null;
  is_demo: boolean;
  participation: CompanyParticipation;
};
export type JobCard = {
  job_id: string;
  company: CompanySummary;
  title: string;
  categories: CategoryId[];
  employment_kind: "regular" | "probation" | "conversion" | "non_regular" | "unknown";
  location: string | null;
  deadline: string | null;
  is_closed: boolean;
  applied: boolean;
  can_apply: boolean;
  apply_block_reason: "already_applied" | "closed" | "company_not_participating" | "resume_required" | null;
  external_url: string | null;
  match: MatchResult;
  policy: PolicyResult;
};
export type MainResponse = {
  youth_summary: {
    name: string;
    age: number;
    address: { sido: string; sigungu: string };
    youth_policy: YouthPolicyResult;
  };
  has_resume: boolean;
  recommended: JobCard[];
  postings: JobCard[];
  fallback_used: boolean;
};
export type JobDetailResponse = JobCard & {
  work_address: string | null;
  work_gu: string | null;
  holiday_type: string | null;
  posted_at: string | null;
  work_hours: string | null;
  selection_process: string | null;
  documents: string | null;
  benefits: string | null;
  company_homepage: string | null;
  headcount: number | null;
  position_raw: string | null;
  preferred: string | null;
  employment_type_raw: string | null;
  career_req: string | null;
  education_req: string | null;
  salary: string | null;
  company_industry: string | null;
  crawled_at: string | null;
  matching_json: JobMatchingJson | null;
};
export type ApplyRequest = { job_id: string };
export type ApplyResponse = { application_id: string; already_applied: boolean };
export type ApplicationSummary = {
  application_id: string;
  job_id: string;
  title: string;
  company_name: string;
  applied_at: string;
  match_snapshot: MatchResult;
  policy_snapshot: PolicyResult;
  resume_url: string;
};
export type ApplicationsResponse = { applications: ApplicationSummary[] };
export type EmploymentKind = "regular" | "probation" | "conversion" | "non_regular" | "unknown";
export type JobIncentivePolicy = {
  status: PolicyStatus; // "eligible" | "needs_check" | "ineligible"
  regular: "pass" | "fail" | "unknown";
  employment_kind: EmploymentKind;
  employment_type_raw: string | null;
  reason: string;
  disclaimer: string;
};
export type CreateCompanyProfileRequest = { company_id: string };
export type CompanyProfileResponse = {
  user_id: string;
  role: "company";
  company: CompanySummary;
};
export type CompanyOverviewResponse = {
  companies: {
    company: CompanySummary;
    jobs: {
      job_id: string;
      title: string;
      is_closed: boolean;
      applicant_count: number;
      job_policy: JobIncentivePolicy;
    }[];
  }[];
};
export type ApplicantResumeSummary = {
  education: string | null;
  major: string | null;
  certificates: string[];
  skills: string[];
  experiences: {
    title: string;
    kind: "employment" | "internship" | "project" | "other";
    evidence: string;
    start_month: string | null;
    end_month: string | null;
    is_current: boolean | null;
  }[];
};
export type Applicant = {
  application_id: string;
  name: string;
  age: number;
  address: { sido: string; sigungu: string };
  email: string;
  desired_categories: CategoryId[];
  resume_summary: ApplicantResumeSummary | null;
  match_snapshot: MatchResult;
  policy_snapshot: PolicyResult;
  resume_url: string;
  applied_at: string;
};
export type ApplicantsResponse = {
  job: { job_id: string; title: string; job_policy: JobIncentivePolicy };
  counts: { all: number; eligible: number; needs_check: number; ineligible: number };
  applicants: Applicant[];
};
