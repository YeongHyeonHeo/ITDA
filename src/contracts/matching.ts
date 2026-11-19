/** Shared AI normalization and rule scoring contracts; not an implemented engine. */
export const MATCHING_VERSION = "rules-v1-20-40-25-15" as const;
export const MATCHING_WEIGHTS = { category: 20, skills: 40, experience: 25, career: 15 } as const;
export const CATEGORY_IDS = [
  "development_it", "data_ai", "design", "marketing_pr", "business_admin",
  "production_quality", "sales_customer", "research",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];
export type ExtractionStatus = "pending" | "completed" | "failed";
/** IDs must be checked against the versioned closed lexicon, not arbitrary AI strings. */
export type EvidenceItem = { id: string; evidence: string };
export type UnmappedItem = { raw: string; evidence: string };
export type JobMatchingJson = {
  schema_version: "matching-v1";
  taxonomy_version: string;
  categories: { id: CategoryId; evidence: string }[];
  required_skills: EvidenceItem[];
  preferred_skills: EvidenceItem[];
  experience_requirements: EvidenceItem[];
  career: {
    accepts_new_graduate: boolean | null;
    accepts_experienced: boolean | null;
    min_months: number | null;
    max_months: number | null;
    evidence: string | null;
  };
  unmapped: UnmappedItem[];
};
export type ResumeMatchingJson = {
  major: string | null;
  schema_version: "matching-v1";
  taxonomy_version: string;
  skills: EvidenceItem[];
  experiences: {
    id: string;
    kind: "employment" | "internship" | "project" | "other";
    title: string;
    evidence: string;
    competency_ids: string[];
    start_month: string | null; // YYYY-MM; no inferred dates
    end_month: string | null;
    is_current: boolean | null;
  }[];
  career: {
    declared_total_months: number | null;
    explicitly_no_experience: boolean | null;
    evidence: string | null;
  };
  unmapped: UnmappedItem[];
};
export type ScorePart = { score: number; max_score: number; matched_ids: string[]; missing_ids: string[]; needs_check: boolean };
export type MatchResult = {
  status: "ready" | "no_resume" | "pending" | "failed";
  score: number | null; // 0..100, one decimal; null means not computed
  breakdown: { category: ScorePart; skills: ScorePart; experience: ScorePart; career: ScorePart } | null;
  recommendable: boolean;
  reason: string | null;
  needs_check: string[];
  algorithm_version: typeof MATCHING_VERSION;
  profile_version: number;
  job_version: number;
  taxonomy_version: string;
  evaluated_month: string; // YYYY-MM-01, KST; ongoing careers invalidate monthly
};
