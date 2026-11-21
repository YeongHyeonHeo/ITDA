/** 공고 AI와 이력서 AI가 공유하는 닫힌 스킬·경험 사전 (taxonomy_version = "v1"). */
export const TAXONOMY_VERSION = "v1" as const;

export type TaxonomyItem<TId extends string = string> = {
  id: TId;
  label: string;
  aliases: readonly string[];
};

export const SKILL_TAXONOMY = [
  // IT·개발·데이터 (11)
  { id: "python", label: "Python", aliases: ["Python", "파이썬", "VBA"] },
  { id: "javascript_ts", label: "JavaScript / TypeScript", aliases: ["JavaScript", "TypeScript", "React", "Node.js", "HTML5", "CSS", "WebGL", "Cesium.js"] },
  { id: "java_spring", label: "Java / Spring", aliases: ["Java", "Spring", "Spring Boot"] },
  { id: "csharp_dotnet", label: "C# / .NET", aliases: ["C#", ".NET", "DevExpress"] },
  { id: "sql_db", label: "SQL / 데이터베이스", aliases: ["SQL", "Oracle", "MySQL", "PostgreSQL", "DB", "데이터베이스"] },
  { id: "ai_ml", label: "AI / 머신러닝·딥러닝", aliases: ["AI", "ML", "DL", "LLM", "PyTorch", "TensorFlow", "머신러닝", "딥러닝"] },
  { id: "data_analysis", label: "데이터 분석·통계", aliases: ["데이터 분석", "통계", "대용량 데이터 처리", "시각화", "대시보드"] },
  { id: "cloud_infra", label: "클라우드·서버 인프라", aliases: ["AWS", "GCP", "Azure", "VMware", "가상화", "네트워크", "서버 인프라"] },
  { id: "linux_os", label: "Linux / 서버 OS", aliases: ["Linux", "RHEL", "CentOS", "Ubuntu", "Windows Server"] },
  { id: "git_collab", label: "Git / 협업 도구", aliases: ["Git", "GitHub", "SVN", "Jira", "Notion"] },
  { id: "it_cert_security", label: "정보처리·보안", aliases: ["정보처리기사", "정보보안", "DLP", "DRM", "EDMS", "웹 접근성"] },

  // 디자인·미디어·기획·마케팅 (7)
  { id: "figma_uiux", label: "Figma / UI·UX", aliases: ["Figma", "피그마", "UI", "UX", "프로토타이핑"] },
  { id: "adobe_design", label: "포토샵·일러스트·편집", aliases: ["포토샵", "일러스트", "Photoshop", "Illustrator", "인디자인", "편집디자인"] },
  { id: "video_content", label: "영상·콘텐츠 제작", aliases: ["프리미어", "애프터이펙트", "영상편집", "촬영", "콘텐츠 제작"] },
  { id: "ai_creative_tools", label: "AI 크리에이티브 툴", aliases: ["미드저니", "Midjourney", "AI 툴", "생성형 AI"] },
  { id: "digital_marketing", label: "디지털·퍼포먼스 마케팅", aliases: ["디지털광고", "퍼포먼스 마케팅", "SNS 마케팅", "인플루언서 마케팅", "캠페인"] },
  { id: "service_planning", label: "서비스·API 기획", aliases: ["서비스 기획", "PM", "PO", "API 기획", "시스템 연동 기획"] },
  { id: "proposal_docs", label: "제안서·문서 기획", aliases: ["제안서 작성", "보고서", "발표자료", "기획서"] },

  // 경영·재무·영업·무역·품질·전문 (8)
  { id: "finance_quant", label: "채권·금융공학·투자", aliases: ["채권", "파생상품", "금융공학", "금융상품", "자산평가", "주식", "RCPS", "BW", "CB"] },
  { id: "finance_cert", label: "회계·금융 자격", aliases: ["CFA", "CPA", "FRM", "투자자산운용사", "회계관련 자격증", "전산회계", "금융자격증"] },
  { id: "accounting_tax", label: "회계·재무·자금", aliases: ["회계", "재무", "세무", "자금", "결산"] },
  { id: "b2b_sales", label: "B2B·솔루션 영업", aliases: ["B2B", "솔루션 영업", "해외영업", "영업지원", "바이어"] },
  { id: "trade_logistics", label: "무역·물류·유통", aliases: ["수출입", "통관", "수입신고", "글로벌 유통", "물류", "SCM", "유통"] },
  { id: "quality_qa_qc", label: "품질관리(QA/QC)·8D", aliases: ["QA", "QC", "8D", "정밀검사", "품질검사", "품질관리", "ISO"] },
  { id: "cad_engineering", label: "CAD·설계·기구", aliases: ["CAD", "AutoCAD", "SolidWorks", "3D 설계", "기구설계"] },
  { id: "medical_bio", label: "의료·보건·바이오", aliases: ["간호", "의공학", "임상", "바이오", "의료기기", "의료"] },

  // 공통 실무·어학·기타 (6)
  { id: "office_excel", label: "MS Office / 엑셀", aliases: ["MS Office", "Excel", "엑셀", "컴퓨터활용능력", "컴퓨터 사용능력"] },
  { id: "english", label: "영어", aliases: ["영어", "비즈니스 영어", "TOEIC", "OPIc"] },
  { id: "chinese", label: "중국어", aliases: ["중국어", "HSK"] },
  { id: "foreign_lang_other", label: "기타 외국어", aliases: ["외국어 능통", "일본어"] },
  { id: "communication", label: "커뮤니케이션·협업", aliases: ["커뮤니케이션", "고객 응대", "협업"] },
  { id: "driver_license", label: "운전면허", aliases: ["운전면허", "1종 보통", "2종 보통"] },
] as const satisfies readonly TaxonomyItem[];

export const EXPERIENCE_TAXONOMY = [
  { id: "product_development", label: "제품·서비스 개발/구축", aliases: ["웹/앱 개발", "AI/ML 개발", "3D GIS 개발", "주방가전 개발", "시스템 개발", "제품 개발"] },
  { id: "data_reporting", label: "데이터 분석·대시보드·리포팅", aliases: ["대시보드 제작", "데이터 처리 솔루션", "금융상품 평가모형", "통계 리포트", "데이터 분석"] },
  { id: "service_planning_exp", label: "서비스·시스템 기획", aliases: ["API 기반 서비스 기획", "외부 시스템 연동 기획", "서비스기획부터 개발 운영"] },
  { id: "design_portfolio", label: "디자인·콘텐츠 포트폴리오", aliases: ["편집디자인", "디자인 포트폴리오", "브랜드 디자인", "콘텐츠 제작"] },
  { id: "marketing_campaign", label: "마케팅·광고 캠페인 운영", aliases: ["디지털광고 실무경험", "인플루언서 캠페인 운영", "마케팅 에이전시", "광고대행사"] },
  { id: "market_customer_research", label: "시장·고객 리서치", aliases: ["고객 리서치", "고객 인터뷰", "설문조사", "시장조사"] },
  { id: "sales_client_ops", label: "영업·고객·콜 업무 수행", aliases: ["솔루션 영업 경험", "해외영업", "영업 경력", "콜 업무", "바이어 응대"] },
  { id: "finance_valuation_exp", label: "금융·회계·자금 실무", aliases: ["금융기관 경력", "채권평가사", "증권사", "운용사", "회계·자금 실무"] },
  { id: "infra_system_ops", label: "시스템·인프라·보안 운영", aliases: ["네트워크 모니터링 시스템 구축", "서버 인프라", "가상화 환경", "인프라 운영"] },
  { id: "quality_inspection_exp", label: "품질검사·공정 개선", aliases: ["정밀검사 경험", "8D 작성 경험", "수입신고", "QA/QC"] },
  { id: "trade_logistics_exp", label: "유통·물류·글로벌 인허가", aliases: ["글로벌 이커머스", "글로벌 인허가", "유통, 물류", "수출입"] },
  { id: "rnd_project_lead", label: "R&D·정부과제·프로젝트 리딩", aliases: ["정부 과제 수행", "기업부설연구소", "프로젝트 PL", "조직 리딩"] },
] as const satisfies readonly TaxonomyItem[];

export type SkillId = (typeof SKILL_TAXONOMY)[number]["id"];
export type ExperienceId = (typeof EXPERIENCE_TAXONOMY)[number]["id"];

export const SKILL_ID_SET: ReadonlySet<string> = new Set(SKILL_TAXONOMY.map((s) => s.id));
export const EXPERIENCE_ID_SET: ReadonlySet<string> = new Set(EXPERIENCE_TAXONOMY.map((e) => e.id));
