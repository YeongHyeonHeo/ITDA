import {notFound} from "next/navigation";
import MyPage from "@/features/jobitda/MyPage";
export default function PreviewMyPage(){if(process.env.NODE_ENV!=="development")notFound();return <MyPage/>;}
