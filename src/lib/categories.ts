/** 직무 카테고리 15종의 slug(CategoryId) ↔ 화면 표시 라벨 매핑 (api-spec §3.1 / job_categories 테이블 기준). */
import { CATEGORY_IDS, type CategoryId } from "@/contracts/matching";

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  management_hr: "경영·기획·인사",
  accounting_finance: "회계·재무",
  marketing_pr: "마케팅·홍보",
  sales_customer: "영업·고객관리",
  product_md: "상품기획·MD",
  it_data: "IT개발·데이터",
  design: "디자인",
  rnd_engineering: "연구개발·설계",
  production_quality: "생산·품질",
  procurement_logistics_trade: "구매·물류·무역",
  construction_civil_env: "건축·토목·환경",
  medical_health: "의료·보건",
  education: "교육",
  media_content: "미디어·콘텐츠",
  other: "기타",
};

/** 라벨 → slug 역매핑 (회원가입 칩 선택값을 API desired_categories 로 변환). */
export const CATEGORY_SLUG_BY_LABEL: Record<string, CategoryId> = Object.fromEntries(
  CATEGORY_IDS.map((id) => [CATEGORY_LABELS[id], id])
) as Record<string, CategoryId>;

/** 칩/셀렉트 렌더용 (slug + 라벨) 목록. */
export const CATEGORY_OPTIONS: readonly { id: CategoryId; label: string }[] =
  CATEGORY_IDS.map((id) => ({ id, label: CATEGORY_LABELS[id] }));

export function categoryLabel(id: string): string {
  return CATEGORY_LABELS[id as CategoryId] ?? id;
}
