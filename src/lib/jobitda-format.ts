/** 화면 표시용 포맷 헬퍼 (API 응답 → 라벨/등급). 데모 데이터와 무관한 순수 함수. */
import type { PolicyStatus, JobCard } from "@/contracts/api";
import type { MatchResult } from "@/contracts/matching";
import { SKILL_TAXONOMY, EXPERIENCE_TAXONOMY } from "@/contracts/taxonomy";

/** 지원 경로 분기 (PRD D-39): 참여기업은 내부 지원, 미참여는 백엔드 검증 외부 링크. */
export type ApplyRoute =
  | { kind: "internal"; label: string }
  | { kind: "external"; url: string; label: string }
  | { kind: "unavailable"; label: string };
export function applyRoute(card: Pick<JobCard, "company" | "external_url">): ApplyRoute {
  if (card.company.participation === "participating") return { kind: "internal", label: "JOB잇다 지원" };
  if (card.external_url) return { kind: "external", url: card.external_url, label: "외부 사이트 지원" };
  return { kind: "unavailable", label: "지원 경로 확인 필요" };
}
export function applyRouteTone(r: ApplyRoute): string {
  return r.kind === "internal" ? "pill-route-internal" : "pill-route-external";
}

const TAXON_LABEL = new Map<string, string>(
  [...SKILL_TAXONOMY, ...EXPERIENCE_TAXONOMY].map((t) => [t.id, t.label])
);
/** 스킬·경험 사전 id → 한글 라벨 (일치 역량/추가 확인 항목 표시용). */
export function skillLabel(id: string): string {
  return TAXON_LABEL.get(id) ?? id;
}

export function policyText(status: PolicyStatus): string {
  return status === "eligible" ? "기본요건 충족 가능" : status === "needs_check" ? "추가 확인 필요" : "기본요건 불일치";
}

export function policyTone(status: PolicyStatus): string {
  return status === "eligible" ? "pill-orange" : status === "needs_check" ? "pill-warn" : "pill-red";
}

/** 고용형태 코드 → 표시 문구. */
export function employmentText(kind: string): string {
  switch (kind) {
    case "regular": return "정규직";
    case "probation": return "수습 후 정규직";
    case "conversion": return "정규직 전환형";
    case "non_regular": return "비정규직";
    default: return "근무형태 확인";
  }
}

/** 마감 라벨 (KST 기준 D-day). */
export function deadlineLabel(deadline: string | null, isClosed: boolean): string {
  if (isClosed) return "마감";
  if (!deadline) return "상시";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const n = Math.round((Date.parse(deadline + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86400000);
  return n < 0 ? "마감" : `D-${n}`;
}

/** 적합도 등급 라벨 (fit_grade 우선, 없으면 score 기준 matching-spec: 60+ high, 40-59 medium, <40 low). */
export function gradeLabel(match: Pick<MatchResult, "score" | "fit_grade">): string | null {
  if (match.score == null) return null;
  const g = match.fit_grade ?? (match.score >= 60 ? "high" : match.score >= 40 ? "medium" : "low");
  return g === "high" ? "높음" : g === "medium" ? "보통" : "낮음";
}

export function gradeTone(match: Pick<MatchResult, "score" | "fit_grade">): string {
  if (match.score == null) return "pill-gray";
  const g = match.fit_grade ?? (match.score >= 60 ? "high" : match.score >= 40 ? "medium" : "low");
  return g === "high" ? "pill-indigo" : g === "medium" ? "pill-green" : "pill-red";
}

/** 지원 불가 사유 → 버튼 문구. */
export function applyButtonText(card: { applied: boolean; is_closed: boolean; apply_block_reason: string | null }): string {
  if (card.applied || card.apply_block_reason === "already_applied") return "지원완료";
  if (card.is_closed || card.apply_block_reason === "closed") return "모집마감";
  return "지원하기";
}
