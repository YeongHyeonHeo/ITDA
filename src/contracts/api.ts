/** API v1 target contract. Business routes are not implemented yet. */
import type { CategoryId, ExtractionStatus, JobMatchingJson, MatchResult, ResumeMatchingJson } from "./matching";
export type PolicyStatus = "eligible" | "needs_check" | "ineligible";
export type ApiError = { error: { code: string; message: string } };
export type PolicyResult = {
  status: PolicyStatus;
  items: { age: "pass" | "fail" | "unknown"; residence: "pass" | "fail" | "unknown"; regular: "pass" | "fail" | "unknown" };
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
  age: number;
  address: { sido: string; sigungu: string };
  desired_categories: CategoryId[];
};
export type CreateProfileRequest = ProfileInput & { privacy_consent: true };
export type UpdateProfileRequest = Partial<ProfileInput>;
export type ProfileResponse = ProfileInput & {
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
export type CompanySummary = {
  id: string; name: string;
  participation: "certified_only" | "posting_verified" | "demo_participant";
  is_demo: boolean;
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
  match: MatchResult;
  policy: PolicyResult;
};
export type MainResponse = { has_resume: boolean; recommended: JobCard[]; postings: JobCard[]; fallback_used: boolean };
export type JobDetailResponse = JobCard & {
  duties: string | null; requirements: string | null; preferred: string | null;
  matching_json: JobMatchingJson | null;
};
export type ApplyRequest = { job_id: string };
export type ApplyResponse = { application_id: string; already_applied: boolean };
export type ApplicationSummary = {
  application_id: string; job_id: string; title: string; company_name: string;
  applied_at: string; match_snapshot: MatchResult; policy_snapshot: PolicyResult;
  resume_url: string;
};
export type ApplicationsResponse = { applications: ApplicationSummary[] };
export type CompanyOverviewResponse = {
  companies: { company: CompanySummary; jobs: { job_id: string; title: string; is_closed: boolean; applicant_count: number }[] }[];
};
export type Applicant = {
  application_id: string; name: string; desired_categories: CategoryId[];
  match_snapshot: MatchResult; policy_snapshot: PolicyResult;
  resume_url: string; applied_at: string;
};
export type ApplicantsResponse = {
  job: { job_id: string; title: string };
  counts: { all: number; eligible: number; needs_check: number; ineligible: number };
  applicants: Applicant[];
};
