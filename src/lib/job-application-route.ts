/**
 * PRD v1.5 D-39: A job's application method is not its subsidy eligibility.
 * Verified real external job links must come from the backend. Do not generate links.
 */
import type { DemoJob, ExternalSite } from "@/lib/demo-data";

export type JobApplicationRoute =
  | { kind: "internal"; label: "JOB잇다 지원" }
  | { kind: "external"; provider: ExternalSite; url: string; label: string }
  | { kind: "unavailable"; provider: ExternalSite | null; label: string };

/** Reject non-HTTPS / javascript: links, credentials, and mismatched named providers. */
export function verifiedExternalApplyUrl(url: string | null, provider: ExternalSite): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    const host = parsed.hostname.toLowerCase();
    if (host === "localhost" || host.endsWith(".localhost") || /^(127|10|192\.168)\./.test(host)) return null;
    if (provider === "사람인" && !(host === "saramin.co.kr" || host.endsWith(".saramin.co.kr"))) return null;
    if (provider === "잡코리아" && !(host === "jobkorea.co.kr" || host.endsWith(".jobkorea.co.kr"))) return null;
    return parsed.href;
  } catch { return null; }
}

export function getJobApplicationRoute(job: DemoJob): JobApplicationRoute {
  if (job.participating) return { kind: "internal", label: "JOB잇다 지원" };
  const provider = job.externalSite;
  if (provider) {
    const url = verifiedExternalApplyUrl(job.externalUrl, provider);
    if (url) return { kind: "external", provider, url, label: `${provider} 지원` };
    return { kind: "unavailable", provider, label: `${provider} 지원 · 링크 확인 필요` };
  }
  return { kind: "unavailable", provider: null, label: "지원 경로 확인 필요" };
}
