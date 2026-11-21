"use client";
import Link from "next/link";
import {useEffect,useState,type ChangeEvent} from "react";
import {usePathname} from "next/navigation";
import {useRouter} from "next/navigation";
import SiteHeader from "@/components/SiteHeader";
import JobitdaModal from "@/components/JobitdaModal";
import ResumeErrorModal from "@/components/ResumeErrorModal";
import ResumeUploadProgress from "@/components/ResumeUploadProgress";
import {readLocalResumeWithProgress,uploadResumeWithProgress,type ResumeProgress} from "@/lib/resume-upload-progress";
import {JobitdaApiError} from "@/lib/jobitda-api";
import {resumeErrorFromApi} from "@/lib/resume-errors";
import {validateLocalResumePdf, type ResumeErrorCode} from "@/lib/resume-errors";
import DemoNotice from "@/components/DemoNotice";
import {categories,defaultProfile,readDemoProfile,writeDemoProfile,readDemoApplied,resetDemoState,ageAtKst,demoBasicPrecheck,jobs,type DemoProfile} from "@/lib/demo-data";
import {getLocalities,formatRegion} from "@/lib/regions";
import {routes} from "@/lib/jobitda-routes";
import {fitGradeLabel,fitGradeClass} from "@/lib/fit-grade";

type ModalName="delete"|"deleted"|"resume"|"invalid"|"resume-error"|null;
export default function MyPage(){
  const router=useRouter();const pathname=usePathname();
  const isPreview=pathname?.startsWith("/preview/")??false;
  const [uploadBusy,setUploadBusy]=useState(false);
  const [uploadProgress,setUploadProgress]=useState<ResumeProgress|null>(null);
  const [profile,setProfile]=useState<DemoProfile>(defaultProfile);
  const [draft,setDraft]=useState<DemoProfile>(defaultProfile);const [editing,setEditing]=useState(false);
  const [appliedIds,setAppliedIds]=useState<string[]>([]);const [modal,setModal]=useState<ModalName>(null);
  const [saved,setSaved]=useState(false);const [fileError,setFileError]=useState("");
  const [resumeIssue,setResumeIssue]=useState<ResumeErrorCode|null>(null);
  useEffect(()=>{queueMicrotask(()=>{const item=readDemoProfile();setProfile(item);setDraft(item);setAppliedIds(readDemoApplied());});},[]);
  const age=ageAtKst(profile.birth);
  const precheck=demoBasicPrecheck(profile);
  function updateDraft(key:keyof DemoProfile,value:string){setDraft(p=>({...p,[key]:value}));}
  function toggleCategory(value:string){setDraft(prev=>({...prev,categories:prev.categories.includes(value)?prev.categories.filter(c=>c!==value):prev.categories.length<3?[...prev.categories,value]:prev.categories}));}
  function save(){if(!draft.name.trim()||!draft.birth||!draft.province||!draft.district||!draft.categories.length){setModal("invalid");return;}setProfile(draft);writeDemoProfile(draft);setEditing(false);setSaved(true);}
  async function pickResume(event:ChangeEvent<HTMLInputElement>){
    if(uploadBusy)return;
    const file=event.currentTarget.files?.[0];if(!file)return;
    event.currentTarget.value="";
    setUploadBusy(true);
    setFileError("");
    setResumeIssue(null);
    setUploadProgress({stage:"validating",percent:null});
    try {
      const issue=await validateLocalResumePdf(file);
      if(issue){setUploadProgress(null);setResumeIssue(issue);setModal("resume-error");return;}
      if(isPreview){
        // Demo: progress reflects local bytes read. It is NOT a network upload.
        await readLocalResumeWithProgress(file,setUploadProgress);
        const next={...profile,resumeName:file.name};
        setProfile(next);setDraft(next);writeDemoProfile(next);
        setUploadProgress({stage:"demo",percent:100});
        setModal("resume");
        return;
      }
      // Authenticated /youth/mypage: progress reflects real bytes sent to Y04.
      const result=await uploadResumeWithProgress(file,setUploadProgress);
      const next={...profile,resumeName:result.filename||file.name};
      setProfile(next);setDraft(next);
      // HTTP 200 with extraction_status='failed' means storage succeeded.
      if(result.extraction_status==="failed"){
        setResumeIssue("EXTRACTION_FAILED");setModal("resume-error");
      }else{
        setModal("resume");
      }
    }catch(error){
      setUploadProgress({stage:"failed",percent:null});
      const mapped=error instanceof JobitdaApiError?resumeErrorFromApi({code:error.code}):null;
      if(mapped){setResumeIssue(mapped);setModal("resume-error");}
      else setFileError(error instanceof Error?error.message:"이력서를 업로드하지 못했어요. 다시 시도해주세요.");
    }finally{
      setUploadBusy(false);
    }
  }
  return <><SiteHeader role="youth" name={profile.name}/><main className="page-shell mypage-shell"><h1 className="page-title">마이페이지</h1>
    <div className="mypage-stack"><section className="panel mypage-card"><div className="section-card-heading"><h2>내 정보</h2>{editing?<div className="action-pair"><button className="btn btn-ghost" type="button" onClick={()=>{setDraft(profile);setEditing(false);}}>취소</button><button className="btn btn-orange" type="button" onClick={save}>저장</button></div>:<button className="btn btn-orange" type="button" onClick={()=>{setDraft({...profile,province:"서울특별시",district:profile.province==="서울특별시"?profile.district:""});setEditing(true);setSaved(false);}}>정보 수정</button>}</div>
      {editing?<div className="mypage-edit"><label className="field-group"><span className="form-label">이름</span><input className="field" value={draft.name} onChange={e=>updateDraft("name",e.target.value)}/></label><label className="field-group"><span className="form-label">생년월일</span><input className="field" type="date" value={draft.birth} onChange={e=>updateDraft("birth",e.target.value)}/></label><div className="field-group"><span className="form-label">실거주지 주소 (서울특별시 / 자치구)</span><div className="input-row"><select className="field" aria-label="서울특별시 고정" value="서울특별시" disabled><option value="서울특별시">서울특별시</option></select><select className="field" aria-label="서울특별시 자치구 선택" value={draft.district} onChange={e=>updateDraft("district",e.target.value)} disabled={!draft.province}><option value="">자치구 선택</option>{getLocalities("서울특별시").map(d=><option value={d} key={d}>{d}</option>)}</select></div></div><div className="field-group"><p className="form-label">희망직무 최대 3개</p><div className="chip-row">{categories.map(c=><button key={c} type="button" className={`chip ${draft.categories.includes(c)?"is-selected":""}`} onClick={()=>toggleCategory(c)}>{c}</button>)}</div></div><p className="form-hint">이메일은 이 화면에서 변경할 수 없어요.</p></div>:
      <dl className="profile-dl"><dt>이름</dt><dd>{profile.name}</dd><dt>생년월일</dt><dd>{profile.birth} (만 {age??"?"}세)</dd><dt>실거주지 주소</dt><dd>{formatRegion(profile.province,profile.district)}</dd><dt>희망직무</dt><dd>{profile.categories.join(", ")}</dd><dt>이메일</dt><dd>{profile.email} (변경 불가)</dd><dt>기본요건</dt><dd><span className={`pill ${precheck.tone}`}>{precheck.label}</span> <span className="small-text">일부 정책의 연령·거주 조건을 가정한 시연용 예비진단</span></dd></dl>}
      {saved&&<p className="alert alert-success">가상 프로필이 현재 브라우저 세션에 저장됐어요.</p>}
    </section>
    <section className="panel mypage-card mypage-resume-card"><div className="section-card-heading"><h2>이력서</h2><label htmlFor="resume-reupload" className={`btn ${uploadBusy?"btn-disabled":"btn-orange"}`}>{uploadBusy?"파일 처리 중...":profile.resumeName?"이력서 다시 올리기":"이력서 올리기"}</label><input id="resume-reupload" className="visually-hidden" type="file" accept=".pdf,application/pdf" onChange={pickResume} disabled={uploadBusy}/></div>
      <div className="file-summary">📄　<strong>{profile.resumeName??"등록된 이력서가 없습니다"}</strong><span className="small-text">{profile.resumeName?(isPreview?"시연용 파일명":"최근 선택된 PDF"):"파일 업로드 전"}</span></div>
      <ResumeUploadProgress progress={uploadProgress}/>
      {fileError&&<p className="inline-error" role="alert">{fileError}</p>}
      <h3 className="profile-subheading">AI 분석 결과 <span className="pill pill-gray">읽기 전용</span></h3>
      {profile.resumeName?<><dl className="profile-dl"><dt>관심직무</dt><dd>콘텐츠 마케팅 (가상 결과)</dd><dt>학력·전공</dt><dd>OO대학교 경영학 졸업 (가상 결과)</dd><dt>자격증</dt><dd>컴퓨터활용능력 2급 (가상 결과)</dd><dt>보유 기술</dt><dd><div className="tags">{["SNS 운영","콘텐츠 기획","카드뉴스 제작","엑셀"].map(t=><span className="pill pill-gray" key={t}>{t}</span>)}</div></dd><dt>경험</dt><dd>카페 SNS 계정 운영 · 프로젝트 · 2025.03~2025.08<br/><span className="small-text">인스타그램 게시물 기획·제작</span></dd></dl><p className="alert alert-amber">분석 결과는 직접 고칠 수 없어요. 바꾸려면 이력서를 다시 올리면 됩니다. 현재는 실제 분석이 아닌 시연 예시입니다.</p></>:
      <p className="subtle">이력서를 등록하면 이 영역에 분석 결과가 표시돼요. 실제 AI 추출은 백엔드 연동 이후 제공됩니다.</p>}
    </section>
    <section className="panel mypage-card"><h2>지원 내역 {appliedIds.length}건</h2>
      {appliedIds.length?appliedIds.map(id=>{const job=jobs.find(j=>j.id===id);return job?<Link className="application-row" key={id} href={routes.job(id)}><div><span className="small-text">{job.company}</span><strong>{job.title}</strong><span className="small-text">이 브라우저 세션에서 지원</span></div><div className="tags"><span className={`pill ${fitGradeClass(job.score)}`}>지원 시점 적합도 {fitGradeLabel(job.score)}</span><span className="pill pill-purple">지원 완료</span> ❯</div></Link>:null;}):<p className="subtle">아직 시연용 지원 기록이 없어요. <Link href={routes.youth} className="back-link">공고 보러 가기</Link></p>}
    </section></div>
    <p className="footnote">이 UI 시연에서 지원 취소 기능은 없어요. 정보를 바꿔도 지원 내역은 시연 당시 기준으로 유지됩니다.</p>
    <button className="btn btn-orange delete-account" onClick={()=>setModal("delete")}>계정 삭제하기</button>
    <DemoNotice/>
    {modal==="resume-error"&&resumeIssue&&<ResumeErrorModal error={resumeIssue} onClose={()=>setModal(null)}/>}
    {modal==="delete"&&<JobitdaModal title="계정을 삭제하시겠습니까?" message={"계정을 삭제하면 회원정보 및 관련 데이터는 모두 삭제됩니다.\n삭제된 정보는 복구할 수 없습니다. 계속하시겠습니까?\n\n※ 시연에서는 이 브라우저 세션에 저장된 가상 데이터만 초기화됩니다."} primaryLabel="네" secondaryLabel="아니요" onClose={()=>setModal(null)} onPrimary={()=>{resetDemoState();setModal("deleted");}}/>}
    {modal==="deleted"&&<JobitdaModal title="시연 데이터가 초기화되었어요" message="이 브라우저 세션의 가상 프로필과 지원 기록만 초기화했습니다. 실제 계정 삭제 API는 호출하지 않았습니다." onClose={()=>{setModal(null);router.push("/");}}/>}
    {modal==="resume"&&<JobitdaModal
      title={isPreview?"파일 확인이 완료됐어요":"이력서 업로드가 완료됐어요"}
      message={isPreview?"시연용 로컬 파일 읽기를 마쳤습니다. 실제 서버 업로드와 AI 분석은 수행되지 않았어요.":"서버 응답으로 이력서 처리 결과를 받았습니다. 분석 결과는 마이페이지에서 확인해주세요."}
      onClose={()=>setModal(null)}/> }
    {modal==="invalid"&&<JobitdaModal title="입력 정보를 확인해주세요" message="이름·생년월일·서울 실거주지 자치구·희망직무를 확인해주세요." onClose={()=>setModal(null)}/>}
  </main></>;
}
