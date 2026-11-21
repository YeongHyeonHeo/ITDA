/**
 * Job잇다 UI 시연용 가상 데이터입니다.
 * 서울시 실제 기업/채용공고, 정책 심사, AI 판정, 본인 이력서를 의미하지 않습니다.
 * 업무 API는 개발팀이 src/contracts/api.ts 에 정의했으며 아직 연결하지 않았습니다.
 */
export type PolicyStatus = "eligible" | "needs_check" | "ineligible";
export type ExternalSite = "사람인" | "잡코리아" | "외부";
export type DemoJob = {
  id: string; company: string; title: string; category: string; location: string;
  employment: string; deadline: string | null; score: number;
  status: PolicyStatus; participating: boolean; closed: boolean;
  /** D-39: null when no verified external provider or URL exists (no invented links). */
  externalSite: ExternalSite | null; externalUrl: string | null;
  reason: string; skills: string[]; missing: string[];
  duties: string[]; requirements: string[]; preferred: string[];
  industry: string; postedAt: string;
};
export type DemoProfile = {
  name: string; birth: string; province: string; district: string; categories: string[];
  resumeName: string | null; email: string;
};
export type DemoApplicant = {
  id: string; name: string; age: number; district: string; email: string;
  category: string; skills: string[]; missing: string[]; score: number;
  policy: PolicyStatus; appliedAt: string; reason: string;
  school: string; certificate: string; experience: string;
};
export const categories = [
  "경영·기획·인사", "회계·재무", "마케팅·홍보", "영업·고객관리",
  "상품기획·MD", "IT개발·데이터", "디자인", "연구개발·설계",
  "생산·품질", "구매·물류·무역", "건축·토목·환경", "의료·보건",
  "교육", "미디어·콘텐츠", "기타",
] as const;
export const districts = [
  "강남구", "강동구", "강북구", "강서구", "관악구", "광진구", "구로구",
  "금천구", "노원구", "도봉구", "동대문구", "동작구", "마포구", "서대문구",
  "서초구", "성동구", "성북구", "송파구", "양천구", "영등포구",
  "용산구", "은평구", "종로구", "중구", "중랑구",
] as const;
export const defaultProfile: DemoProfile = {
  name: "김민수", birth: "2001-05-12", province: "서울특별시", district: "마포구",
  categories: ["마케팅·홍보", "미디어·콘텐츠"],
  resumeName: "김민수_이력서.pdf", email: "minsu@example.com",
};
const detail = {
  reason: "이력서의 업무 경험과 공고에서 요구하는 역량이 일부 일치합니다. 실제 확인을 위한 시연용 문구입니다.",
  skills: ["콘텐츠 기획", "엑셀"], missing: ["실무 프로젝트 경험"],
  duties: ["공고 관련 업무 지원", "팀 협업 및 결과물 작성"],
  requirements: ["관련 분야 관심", "신입 지원 가능"], preferred: ["관련 프로젝트 경험"],
  industry: "서비스업", postedAt: "2026-11-18",
};
const mock = (fields: Partial<DemoJob> & Pick<DemoJob, "id" | "company" | "title" | "category" | "location" | "score">): DemoJob => ({
  employment: "정규직", deadline: "2026-12-10", status: "eligible", participating: true,
  closed: false, externalSite: null, externalUrl: null, ...detail, ...fields,
});
export const jobs: DemoJob[] = [
  mock({id:"marketing-content",company:"가온마케팅랩",title:"콘텐츠 마케터 (신입)",category:"마케팅·홍보",location:"서울 마포구",score:93,participating:true,deadline:"2026-12-01",
    reason:"인스타그램 계정 운영과 카드뉴스 제작 경험이 담당업무인 SNS 콘텐츠 기획과 직접 관련됨. 엑셀로 게시물 반응을 정리한 경험도 성과 리포트 작성 업무와 맞음.",
    skills:["SNS 운영","콘텐츠 기획","카드뉴스 제작","엑셀","컴퓨터활용능력 2급"], missing:["광고 플랫폼 집행 경험"],
    duties:["자사 브랜드 인스타그램·블로그 콘텐츠 기획 및 제작","카드뉴스·숏폼 영상 기획, 외주 디자이너와 협업","월간 콘텐츠 성과 리포트 작성"],
    requirements:["학력 무관, 신입 지원 가능","SNS 채널 운영 경험이 있는 분","기본 문서 작성 및 엑셀 활용 가능자"],
    preferred:["메타·네이버 등 광고 플랫폼 집행 경험","마케팅·광고홍보 관련 전공자"],industry:"광고·마케팅 대행업"}),
  mock({id:"marketing-performance",company:"누리데이터",title:"마케팅 성과 분석 보조",category:"마케팅·홍보",location:"서울 성동구",score:88,participating:false,externalSite:"사람인",deadline:"2026-11-26",reason:"엑셀·구글 애널리틱스로 캠페인 성과를 정리한 프로젝트가 성과 분석 업무와 맞음.",skills:["엑셀","데이터 분석","SNS 운영"],missing:["GA4 실무"],duties:["마케팅 데이터 정리","성과 리포트 작성"]}),
  mock({id:"online-md",company:"한빛리테일",title:"온라인 MD (신입)",category:"상품기획·MD",location:"서울 구로구",score:82,closed:true,deadline:"2026-11-15",employment:"계약직 후 정규직 전환",status:"needs_check",duties:["상품 등록 및 운영","상세페이지 기획"]}),
  mock({id:"brand-marketing",company:"다온커머스",title:"브랜드 마케팅 담당",category:"마케팅·홍보",location:"서울 강남구",score:74,closed:true,deadline:"2026-11-12"}),
  mock({id:"customer-success",company:"서울솔루션",title:"고객 성공 매니저",category:"영업·고객관리",location:"서울 금천구",score:68,deadline:"2026-12-05"}),
  mock({id:"office-manager",company:"푸른에너지",title:"경영지원 사무원",category:"경영·기획·인사",location:"서울 영등포구",score:42,closed:true,deadline:"2026-11-03"}),
  mock({id:"production",company:"정밀기업",title:"생산관리 엔지니어",category:"생산·품질",location:"서울 구로구",score:34,closed:true,deadline:"2026-11-08"}),
  mock({id:"data-analyst",company:"모아데이터",title:"데이터 분석 어시스턴트",category:"IT개발·데이터",location:"서울 성북구",score:67,deadline:"2026-12-02"}),
  mock({id:"design-assistant",company:"온디자인",title:"브랜드 디자이너",category:"디자인",location:"서울 종로구",score:62,deadline:"2026-12-03"}),
  mock({id:"video-content",company:"브릿지미디어",title:"영상 콘텐츠 기획자",category:"미디어·콘텐츠",location:"서울 용산구",score:61,participating:false,externalSite:"잡코리아",deadline:"2026-11-29"}),
  mock({id:"hr-assistant",company:"이음인사",title:"인사 운영 보조",category:"경영·기획·인사",location:"서울 중구",score:57,deadline:"2026-12-07"}),
  mock({id:"finance",company:"한결재무",title:"회계 보조",category:"회계·재무",location:"서울 강동구",score:54,deadline:"2026-12-08"}),
  mock({id:"quality",company:"스마트제작",title:"품질관리 실무자",category:"생산·품질",location:"서울 구로구",score:51,deadline:"2026-12-09"}),
  mock({id:"research",company:"네오연구소",title:"연구개발 지원",category:"연구개발·설계",location:"서울 강서구",score:49,deadline:"2026-12-11"}),
  mock({id:"logistics",company:"바른물류",title:"물류 운영 담당",category:"구매·물류·무역",location:"서울 송파구",score:47,deadline:"2026-12-13"}),
  mock({id:"medical",company:"바이오케어",title:"의료기기 시험 보조",category:"의료·보건",location:"서울 성동구",score:44,deadline:"2026-12-14"}),
  mock({id:"education",company:"배움플러스",title:"교육 콘텐츠 운영",category:"교육",location:"서울 마포구",score:41,participating:false,deadline:"2026-12-15"}),
  mock({id:"trade",company:"한길무역",title:"무역 사무 지원",category:"구매·물류·무역",location:"서울 양천구",score:38,deadline:"2026-12-16"}),
];
export function getJob(id:string):DemoJob | undefined { return jobs.find(job=>job.id===id); }
export const demoApplicants: DemoApplicant[] = [
  {id:"mins",name:"김민수",age:25,district:"마포구",email:"minsu@example.com",category:"마케팅·홍보",skills:["SNS 운영","콘텐츠 기획","카드뉴스 제작","엑셀"],missing:["광고 플랫폼 집행 경험"],score:93,policy:"eligible",appliedAt:"2026-11-18",reason:"인스타그램 계정 운영과 카드뉴스 제작 경험이 SNS 콘텐츠 기획 업무와 직접 관련됨",school:"OO대학교 경영학 졸업",certificate:"컴퓨터활용능력 2급",experience:"카페 SNS 계정 운영 (프로젝트, 6개월)"},
  {id:"seoyeon",name:"이서연",age:27,district:"관악구",email:"seoyeon@example.com",category:"마케팅·홍보 · 미디어·콘텐츠",skills:["영상 편집","카피라이팅","메타 광고"],missing:[],score:89,policy:"eligible",appliedAt:"2026-11-17",reason:"브랜드 캠페인 기획과 영상 편집 경험이 요구 역량과 일치함",school:"OO대학교 미디어학 졸업",certificate:"영상편집 관련 이수",experience:"콘텐츠 제작 프로젝트"},
  {id:"junho",name:"박준호",age:31,district:"송파구",email:"junho@example.com",category:"영업·고객관리",skills:["고객 응대","엑셀","CRM"],missing:["SNS 제작"],score:72,policy:"eligible",appliedAt:"2026-11-17",reason:"고객 응대 경험과 분석 업무 일부가 연관됨",school:"OO대학교 졸업",certificate:"컴퓨터활용능력",experience:"고객 관리 프로젝트"},
  {id:"yujin",name:"최유진",age:24,district:"성남시",email:"yujin@example.com",category:"마케팅·홍보",skills:["블로그 운영","포토샵"],missing:["광고 플랫폼 집행 경험"],score:62,policy:"ineligible",appliedAt:"2026-11-16",reason:"콘텐츠 역량은 일부 일치하지만 서울 거주 기본요건은 불일치하는 예시",school:"OO대학교 재학",certificate:"없음",experience:"개인 블로그 운영"},
];
export const DEMO_PROFILE_KEY = "jobitda_demo_profile_v2";
export const DEMO_APPLIED_KEY = "jobitda_demo_applied_v2";
export function readDemoProfile(): DemoProfile {
  if (typeof window === "undefined") return defaultProfile;
  try { const raw = sessionStorage.getItem(DEMO_PROFILE_KEY); if (raw) return { ...defaultProfile, ...JSON.parse(raw) as Partial<DemoProfile> }; }
  catch { /* Browsers may block storage. */ }
  return defaultProfile;
}
export function writeDemoProfile(profile:DemoProfile):void {
  if (typeof window === "undefined") return;
  try { sessionStorage.setItem(DEMO_PROFILE_KEY,JSON.stringify(profile)); } catch {}
}
export function readDemoApplied():string[] {
  if (typeof window === "undefined") return [];
  try {const parsed:unknown = JSON.parse(sessionStorage.getItem(DEMO_APPLIED_KEY)||"[]"); return Array.isArray(parsed)?parsed.filter((v):v is string=>typeof v==="string"):[];}catch{return []}
}
export function saveDemoApplied(ids:string[]):void {try{sessionStorage.setItem(DEMO_APPLIED_KEY,JSON.stringify(ids));}catch{}}
export function resetDemoState():void {try{sessionStorage.removeItem(DEMO_PROFILE_KEY);sessionStorage.removeItem(DEMO_APPLIED_KEY);}catch{}}
export function ageAtKst(birth:string,now=new Date()):number|null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const [year,month,day]=birth.split("-").map(Number);
  const formatted=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"numeric",day:"numeric"}).formatToParts(now);
  const get=(type:string)=>Number(formatted.find(p=>p.type===type)?.value);
  return get("year")-year-(get("month")<month||(get("month")===month&&get("day")<day)?1:0);
}
export function jobDeadlineLabel(job:DemoJob):string{
  if(job.closed)return "마감";
  if(!job.deadline)return "상시";
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const n=Math.round((Date.parse(job.deadline+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
  return n<0?"마감":`D-${n}`;
}
export function policyText(status:PolicyStatus):string{
  return status==="eligible"?"기본요건 충족 가능":status==="needs_check"?"추가 확인 필요":"기본요건 불일치";
}

/** UI 시연용 기본요건 판정. 공고/지원금의 실제 요건은 제도별로 별도 검증합니다. */
export function demoBasicPrecheck(profile: DemoProfile): {label: string; tone: string} {
  const age = ageAtKst(profile.birth);
  if (age === null || age < 18 || age > 39) return {label:"연령 요건 불일치",tone:"pill-red"};
  // 서울 거주 조건은 특정 제도에만 적용될 수 있으므로, 타 시·도는 확정 불합격이 아니라 추가 확인 표시.
  if (profile.province !== "서울특별시") return {label:"거주 요건 추가 확인",tone:"pill-warn"};
  return {label:"기본요건 충족 가능",tone:"pill-orange"};
}
