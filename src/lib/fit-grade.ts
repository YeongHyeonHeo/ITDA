/** PRD D-05: UI only displays 3-grade fit, never raw 0~100 points. */
export type FitGrade = "high" | "medium" | "low";

export function fitGradeFromScore(score: number | null | undefined): FitGrade | null {
  if (typeof score !== "number" || !Number.isFinite(score)) return null;
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

export function fitGradeLabel(score: number | null | undefined): string {
  const grade = fitGradeFromScore(score);
  return grade === "high" ? "높음" : grade === "medium" ? "보통" : grade === "low" ? "낮음" : "미분석";
}

export function fitGradeClass(score: number | null | undefined): string {
  const grade = fitGradeFromScore(score);
  return grade === "high" ? "pill-indigo" : grade === "medium" ? "pill-green" : "pill-gray";
}
