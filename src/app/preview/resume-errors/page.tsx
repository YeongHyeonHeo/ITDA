import {notFound} from "next/navigation";
import ResumeErrorPreview from "@/components/ResumeErrorPreview";
/** Development-only QA page. Never expose this route in production. */
export default function ResumeErrorsPreviewPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <ResumeErrorPreview/>;
}
