import "server-only";
import type { EmploymentKind, JobIncentivePolicy, PolicyResult, PolicyStatus, YouthPolicyResult } from "../../contracts/api";
import { calcKoreanAge } from "../auth/crypto";

export const POLICY_RULE_VERSION = "2026.1";
const POLICY_DISCLAIMER = "입력정보 기반 예비진단이며 지원금 수급을 확정하지 않습니다.";

const VALID_EMPLOYMENT_KINDS: ReadonlySet<string> = new Set([
  "regular",
  "probation",
  "conversion",
  "non_regular",
  "unknown",
]);

function normalizeEmploymentKind(kind?: string | null): EmploymentKind {
  return kind && VALID_EMPLOYMENT_KINDS.has(kind) ? (kind as EmploymentKind) : "unknown";
}

function judgeRegularItem(kind: EmploymentKind): "pass" | "fail" | "unknown" {
  if (kind === "regular" || kind === "probation") return "pass";
  if (kind === "non_regular" || kind === "conversion") return "fail";
  return "unknown";
}

/**
 * 기업 관점 공고 단위 지원금 대상 예비진단 (정규직 전용 요건)
 */
export function evaluateJobIncentivePolicy(params: {
  employment_kind?: string | null;
  employment_type_raw?: string | null;
}): JobIncentivePolicy {
  const kind = normalizeEmploymentKind(params.employment_kind);
  const regular = judgeRegularItem(kind);

  let status: PolicyStatus = "needs_check";
  let reason = "고용형태 정보가 불명확하여 정규직 채용 여부를 추가 확인해야 합니다.";

  if (regular === "pass") {
    status = "eligible";
    reason = "정규직 채용 공고로 청년 고용 지원금 기본요건(고용형태)에 해당합니다.";
  } else if (regular === "fail") {
    status = "ineligible";
    reason = "인턴·비정규직·전환형 공고는 정규직 전용 지원금 대상이 아닙니다.";
  }

  return {
    status,
    regular,
    employment_kind: kind,
    employment_type_raw: params.employment_type_raw ?? null,
    reason,
    disclaimer: POLICY_DISCLAIMER,
  };
}

export function evaluateYouthPolicy(params: {
  age: number;
  birthDate?: string | null;
  sido?: string | null;
  sigungu?: string | null;
}): YouthPolicyResult {
  const { age, birthDate, sido } = params;

  // 1. Age rule: 만 18세 ~ 39세 (PRD v1.4 9-2)
  // 6개월 이내에 경계 나이(만 40세 도달 또는 만 18세 미만에서 18세 도달)가 되면 "unknown" (추가 확인)
  let ageItem: "pass" | "fail" | "unknown" = "unknown";

  if (age > 0) {
    if (age < 17 || age >= 40) {
      ageItem = "fail";
    } else {
      let isBoundary = false;
      if (birthDate) {
        const today = new Date();
        const sixMonthsLater = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000);
        const ageIn6Months = calcKoreanAge(birthDate, sixMonthsLater);

        if (age === 17 && ageIn6Months >= 18) {
          isBoundary = true;
        } else if (age === 39 && ageIn6Months >= 40) {
          isBoundary = true;
        }
      } else {
        // birthDate not provided, fallback to checking if age is at boundaries
        if (age === 17 || age === 39) {
          isBoundary = true;
        }
      }

      if (isBoundary) {
        ageItem = "unknown"; // 추가 확인 필요
      } else if (age >= 18 && age <= 39) {
        ageItem = "pass";
      } else {
        ageItem = "fail";
      }
    }
  }

  // 2. Residence rule: 서울특별시
  const isSeoul = sido === "서울특별시" || sido === "서울" || sido === "서울시";
  const residenceItem: "pass" | "fail" | "unknown" = sido
    ? (isSeoul ? "pass" : "fail")
    : "unknown";

  // 3. Composite status (PRD v1.4 9-3)
  // - 하나라도 불일치(fail) -> ineligible (기본요건 불일치)
  // - 불일치 없고 추가 확인(unknown) 있음 -> needs_check (추가 확인 필요)
  // - 모두 충족(pass) -> eligible (기본요건 충족 가능)
  let status: "eligible" | "ineligible" | "needs_check" = "needs_check";
  if (ageItem === "fail" || residenceItem === "fail") {
    status = "ineligible";
  } else if (ageItem === "pass" && residenceItem === "pass") {
    status = "eligible";
  } else {
    status = "needs_check";
  }

  return {
    status,
    items: {
      age: ageItem,
      residence: residenceItem,
    },
    disclaimer: "입력정보 기반 예비진단이며 지원금 수급을 확정하지 않습니다.",
  };
}

export function evaluateJobPolicy(params: {
  age: number;
  birthDate?: string | null;
  sido?: string | null;
  employment_kind?: string | null;
}): PolicyResult {
  const youthPolicy = evaluateYouthPolicy({
    age: params.age,
    birthDate: params.birthDate,
    sido: params.sido,
  });

  // Regular employment check (PRD v1.4 9-2)
  // - 충족: regular, probation
  // - 불일치: non_regular, conversion
  // - 추가 확인: unknown / null
  let regularItem: "pass" | "fail" | "unknown" = "unknown";
  if (params.employment_kind) {
    if (["regular", "probation"].includes(params.employment_kind)) {
      regularItem = "pass";
    } else if (["non_regular", "conversion"].includes(params.employment_kind)) {
      regularItem = "fail";
    }
  }

  let status: "eligible" | "ineligible" | "needs_check" = "needs_check";
  if (
    youthPolicy.items.age === "fail" ||
    youthPolicy.items.residence === "fail" ||
    regularItem === "fail"
  ) {
    status = "ineligible";
  } else if (
    youthPolicy.items.age === "pass" &&
    youthPolicy.items.residence === "pass" &&
    regularItem === "pass"
  ) {
    status = "eligible";
  } else {
    status = "needs_check";
  }

  return {
    status,
    items: {
      age: youthPolicy.items.age,
      residence: youthPolicy.items.residence,
      regular: regularItem,
    },
    disclaimer: "입력정보 기반 예비진단이며 지원금 수급을 확정하지 않습니다.",
  };
}
