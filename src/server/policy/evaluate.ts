import "server-only";
import type { PolicyResult, YouthPolicyResult } from "../../contracts/api";
import { calcKoreanAge } from "../auth/crypto";

export const POLICY_RULE_VERSION = "2026.1";

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
