/**
 * 개발팀 업무 API v1 연결용 타입 안전 클라이언트 (현재 화면에서는 호출하지 않음).
 * src/contracts/api.ts 와 docs/api-spec.md 를 따릅니다.
 * 서버 구현·Supabase 세션 설정이 끝나면 feature 컴포넌트에서 가상 데이터 대신 호출하세요.
 */
import type {
  ApiError, MeResponse, ProfileResponse, CreateProfileRequest, UpdateProfileRequest,
  ResumeResponse, MainResponse, JobDetailResponse, ApplyRequest, ApplyResponse,
  ApplicationsResponse, CompanyOverviewResponse, ApplicantsResponse,
} from "@/contracts/api";

export class JobitdaApiError extends Error {
  constructor(public readonly code:string, message:string,public readonly status:number){super(message);this.name="JobitdaApiError";}
}
async function request<T>(path:string,options?:RequestInit):Promise<T>{
  const response=await fetch(path,{...options,credentials:"same-origin",cache:"no-store",headers:{...((options?.body instanceof FormData)?{}:{"Content-Type":"application/json"}),...options?.headers}});
  if(!response.ok){
    let error:ApiError|undefined;
    try{error=await response.json() as ApiError;}catch{/* Unexpected response */}
    throw new JobitdaApiError(error?.error?.code??"UNKNOWN_ERROR",error?.error?.message??"요청을 처리하지 못했어요.",response.status);
  }
  return response.json() as Promise<T>;
}
const json=(method:string,body:unknown):RequestInit=>({method,body:JSON.stringify(body)});
export const jobitdaApi={
  me:()=>request<MeResponse>("/api/me"),
  createProfile:(body:CreateProfileRequest)=>request<ProfileResponse>("/api/youth/profile",json("POST",body)),
  getProfile:()=>request<ProfileResponse>("/api/youth/profile"),
  updateProfile:(body:UpdateProfileRequest)=>request<ProfileResponse>("/api/youth/profile",json("PATCH",body)),
  uploadResume:(file:File)=>{const form=new FormData();form.set("file",file);return request<ResumeResponse>("/api/youth/resume",{method:"PUT",body:form});},
  youthMain:()=>request<MainResponse>("/api/youth/main"),
  jobDetail:(jobId:string)=>request<JobDetailResponse>(`/api/youth/jobs/${encodeURIComponent(jobId)}`),
  apply:(body:ApplyRequest)=>request<ApplyResponse>("/api/applications",json("POST",body)),
  applications:()=>request<ApplicationsResponse>("/api/youth/applications"),
  companyOverview:()=>request<CompanyOverviewResponse>("/api/company/overview"),
  applicants:(jobId:string,policy?:string)=>request<ApplicantsResponse>(`/api/company/jobs/${encodeURIComponent(jobId)}/applicants${policy?`?policy=${encodeURIComponent(policy)}`:""}`),
};
/** F01 이력서 PDF는 허가된 기업에만 제공. 직접 링크하기 전에 서버의 권한 응답을 확인하세요. */
export const resumePdfPath=(applicationId:string)=>`/api/applications/${encodeURIComponent(applicationId)}/resume`;
