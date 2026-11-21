import {notFound} from "next/navigation";
import CompanyHome from "@/features/jobitda/CompanyHome";
export default function PreviewCompany(){if(process.env.NODE_ENV!=="development")notFound();return <CompanyHome/>;}
