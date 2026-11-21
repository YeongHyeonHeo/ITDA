import {notFound} from "next/navigation";
import JobDetail from "@/features/jobitda/JobDetail";
export default function PreviewJob(){if(process.env.NODE_ENV!=="development")notFound();return <JobDetail/>;}
