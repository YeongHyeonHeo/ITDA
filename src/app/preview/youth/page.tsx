import {notFound} from "next/navigation";
import YouthHome from "@/features/jobitda/YouthHome";
/** 로컬 시연 전용. 실제 청년·기업 인증/권한 경로는 기존 proxy.ts 그대로 사용. */
export default function PreviewYouth(){if(process.env.NODE_ENV!=="development")notFound();return <YouthHome/>;}
