/**
 * 기업 회원가입 UI 테스트용 가상 데이터.
 * 실재 서울형 강소기업 명단이나 회사 인증 API가 아닙니다.
 * 실서비스 연결 시: 개발팀의 기업 인증 API 결과로 교체하세요.
 */
export type CompanyVerificationCandidate = {
  id: string;
  name: string;
  district: string;
  alreadyRegistered: boolean;
};

export const DEMO_COMPANY_CANDIDATES: readonly CompanyVerificationCandidate[] = [
  { id: "blendex-demo", name: "주식회사 블렌드엑스", district: "강남구", alreadyRegistered: false },
  { id: "multi-demo-gangnam", name: "시연기업 중복", district: "강남구", alreadyRegistered: false },
  { id: "multi-demo-mapo", name: "시연기업 중복", district: "마포구", alreadyRegistered: false },
  { id: "registered-demo", name: "시연기업 기가입", district: "서초구", alreadyRegistered: true },
];

export function findDemoCompanyCandidates(name: string): CompanyVerificationCandidate[] {
  const normalized = name.trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
  if (!normalized) return [];
  return DEMO_COMPANY_CANDIDATES.filter(
    (candidate) => candidate.name.toLocaleLowerCase("ko-KR") === normalized,
  );
}
