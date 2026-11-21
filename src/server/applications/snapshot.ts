import "server-only";
import { MATCHING_VERSION } from "@/contracts/matching";
import type { FitGrade, MatchResult, ResumeMatchingJson } from "@/contracts/matching";
import type { ApplicantResumeSummary } from "@/contracts/api";
import { getEvaluatedMonthKST } from "@/server/auth/crypto";

/**
 * 지원 스냅샷 공용 매퍼.
 * applications 행에 고정 저장되는 스냅샷(applicant_snapshot/fit_snapshot 등)과,
 * 기업/청년 조회 응답(Applicant / ApplicationSummary)에서 쓰이는 순수 변환 함수 모음.
 */

const TAXONOMY_VERSION = "v1";

/** score → fit_grade (PRD v1.4 D-05): 60+ high, 40-59 medium, <40 low */
function fitGrade(score: number): FitGrade {
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

/** 이력서 matching_json → 지원자 표시용 요약(ApplicantResumeSummary). 없으면 null. */
export function buildResumeSummary(mj: ResumeMatchingJson | null | undefined): ApplicantResumeSummary | null {
  if (!mj) return null;
  return {
    education: mj.education ?? null,
    major: mj.major ?? null,
    certificates: Array.isArray(mj.certificates) ? mj.certificates : [],
    skills: Array.isArray(mj.skills) ? mj.skills.map((s) => s.id) : [],
    experiences: Array.isArray(mj.experiences)
      ? mj.experiences.map((e) => ({
          title: e.title,
          kind: e.kind,
          evidence: e.evidence,
          start_month: e.start_month ?? null,
          end_month: e.end_month ?? null,
          is_current: e.is_current ?? null,
        }))
      : [],
  };
}

type MatchRow = {
  fit_score: number | string;
  recommendable: boolean;
  breakdown: MatchResult["breakdown"];
  needs_check: string[] | null;
  reason: string | null;
  profile_version: number;
  job_version: number;
  algorithm_version: string;
  taxonomy_version: string;
  evaluated_month: string;
};

/** match_results 캐시 행 → MatchResult (status 'ready'). */
export function matchRowToResult(row: MatchRow): MatchResult {
  const score = typeof row.fit_score === "string" ? Number(row.fit_score) : row.fit_score;
  return {
    status: "ready",
    score,
    fit_grade: fitGrade(score),
    breakdown: row.breakdown,
    recommendable: row.recommendable,
    reason: row.reason ?? null,
    needs_check: row.needs_check ?? [],
    algorithm_version: MATCHING_VERSION,
    profile_version: row.profile_version,
    job_version: row.job_version,
    taxonomy_version: row.taxonomy_version,
    evaluated_month: String(row.evaluated_month).slice(0, 10),
  };
}

/**
 * match_results 캐시가 없을 때의 fit_snapshot 기본값.
 * 100점 규칙 엔진(트랙 1, src/server/matching/score.ts)이 메인 조회(Y05)에서
 * 캐시를 채우기 전이면 'pending'으로 고정한다. 숫자 0점과 미계산 null을 구분한다.
 */
export function fallbackMatchResult(profileVersion: number, jobVersion: number): MatchResult {
  return {
    status: "pending",
    score: null,
    fit_grade: null,
    breakdown: null,
    recommendable: false,
    reason: null,
    needs_check: [],
    algorithm_version: MATCHING_VERSION,
    profile_version: profileVersion,
    job_version: jobVersion,
    taxonomy_version: TAXONOMY_VERSION,
    evaluated_month: getEvaluatedMonthKST(),
  };
}
