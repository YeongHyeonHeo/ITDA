/** Actual file-byte progress is distinct from server AI processing progress. */
import type {ResumeResponse} from "@/contracts/api";
import {JobitdaApiError} from "@/lib/jobitda-api";

export type ResumeProgress = {
  stage: "validating" | "reading" | "uploading" | "processing" | "completed" | "demo" | "failed";
  percent: number | null;
};

/** Preview only: track bytes read locally, NOT bytes sent to the server. */
export async function readLocalResumeWithProgress(file:File,onProgress:(progress:ResumeProgress)=>void):Promise<void>{
  const reader=file.stream().getReader();
  let loaded=0;
  try {
    onProgress({stage:"reading",percent:0});
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      loaded+=value.byteLength;
      onProgress({stage:"reading",percent:Math.min(100,Math.floor(loaded*100/Math.max(1,file.size)))});
    }
    onProgress({stage:"reading",percent:100});
  } finally {
    reader.releaseLock();
  }
}

/**
 * Real PUT /api/youth/resume upload progress, derived from browser network bytes.
 * Once the upload reaches 100%, the backend may still be extracting/analyzing.
 * The current API returns one final response and DOES NOT expose AI-stage progress.
 */
export function uploadResumeWithProgress(file:File,onProgress:(progress:ResumeProgress)=>void):Promise<ResumeResponse>{
  return new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest();
    xhr.open("PUT","/api/youth/resume",true);
    xhr.withCredentials=true;
    xhr.timeout=120000;
    xhr.setRequestHeader("Accept","application/json");
    xhr.upload.addEventListener("progress",event=>{
      const percent=event.lengthComputable&&event.total>0
        ?Math.min(100,Math.floor(event.loaded/event.total*100)):null;
      onProgress({stage:"uploading",percent});
    });
    xhr.upload.addEventListener("load",()=>onProgress({stage:"processing",percent:100}));
    xhr.onload=()=>{
      let parsed:unknown;
      try{parsed=JSON.parse(xhr.responseText);}catch{reject(new JobitdaApiError("INVALID_RESPONSE","서버 응답을 확인할 수 없어요.",xhr.status));return;}
      if(xhr.status>=200&&xhr.status<300){
        onProgress({stage:"completed",percent:100});
        resolve(parsed as ResumeResponse);
      }else{
        const error=(parsed as {error?:{code?:string;message?:string}} | null)?.error;
        reject(new JobitdaApiError(error?.code??"UPLOAD_FAILED",error?.message??"이력서를 업로드하지 못했어요.",xhr.status));
      }
    };
    xhr.onerror=()=>reject(new JobitdaApiError("NETWORK_ERROR","네트워크 연결을 확인한 뒤 다시 시도해주세요.",0));
    xhr.ontimeout=()=>reject(new JobitdaApiError("UPLOAD_TIMEOUT","서버 응답이 지연되고 있어요. 잠시 후 다시 시도해주세요.",0));
    xhr.onabort=()=>reject(new JobitdaApiError("UPLOAD_ABORTED","업로드가 취소됐어요.",0));
    const form=new FormData();form.set("file",file);
    onProgress({stage:"uploading",percent:0});
    xhr.send(form);
  });
}
