import "server-only";
import { z } from "zod";
import type { MatchResult, ResumeMatchingJson } from "@/contracts/matching";
import { EXPERIENCE_TAXONOMY, SKILL_TAXONOMY } from "@/contracts/taxonomy";
import { buildPersonalizedReason } from "./score";

const skillLabelMap = new Map<string, string>(SKILL_TAXONOMY.map((s) => [s.id, s.label]));
const expLabelMap = new Map<string, string>(EXPERIENCE_TAXONOMY.map((e) => [e.id, e.label]));

const ReasonResponseZod = z.object({
  reason: z.string().trim().min(10).max(400),
});

/**
 * 추천 TOP 3 공고에 대해서만 호출한다.
 * 개인 이력서(경험 제목·evidence·보유 역량·자격증)와 공고 원문(jobs.raw_text)을
 * 함께 OpenAI에 전달해 근거 기반 한국어 2문장 추천 이유를 생성한다.
 * OpenAI 키가 없거나 호출/검증이 실패하면 buildPersonalizedReason 템플릿으로 안전하게 폴백한다.
 */
export async function generateLlmReason(params: {
  companyName: string;
  jobTitle: string;
  jobRawText: string | null | undefined;
  resume: ResumeMatchingJson;
  breakdown: NonNullable<MatchResult["breakdown"]>;
}): Promise<string> {
  const { companyName, jobTitle, jobRawText, resume, breakdown } = params;
  const fallback = () => buildPersonalizedReason({ resume, breakdown });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || !jobRawText || jobRawText.trim().length === 0) {
    return fallback();
  }

  const matchedSkills = breakdown.skills.matched_ids.map((id) => ({
    label: skillLabelMap.get(id) || id,
    evidence: resume.skills.find((s) => s.id === id)?.evidence || null,
  }));

  const matchedExps = breakdown.experience.matched_ids.map((id) => expLabelMap.get(id) || id);
  const candidateExps = (resume.experiences || []).slice(0, 4).map((e) => ({
    title: e.title,
    kind: e.kind,
    evidence: e.evidence,
  }));

  const systemPrompt = `너는 서울시 청년 고용 매칭 플랫폼 'JOB잇다'의 추천 이유 작성기다.
청년 이력서 근거와 채용공고 원문을 대조해, 이 공고를 추천하는 이유를 자연스러운 한국어 2문장(공백 포함 150자 내외)으로 작성하라.

[엄격 규칙]
1. 반드시 [청년 이력서]에 있는 실제 경험 제목·원문 근거(evidence)·보유 역량·자격증과 [채용공고]에 있는 실제 담당업무·우대사항을 직접 연결해 서술하라.
2. 이력서나 공고에 없는 경력·수치·기술을 지어내지 마라.
3. 적합도 점수 숫자(예: "100점", "85점")와 정책 지원금 수급 여부("지원금 대상" 등)는 절대 언급하지 마라.
4. 존댓말 대신 깔끔한 서술형/개조식 종결어미("~와 직접 관련됨.", "~업무에 부합함.", "~경험을 활용할 수 있음.")로 끝내라.
5. 반드시 JSON 객체 {"reason": "..."} 형식으로만 응답하라.`;

  const userPayload = {
    채용공고: {
      기업명: companyName,
      공고제목: jobTitle,
      일치_역량_라벨: matchedSkills.map((s) => s.label),
      일치_경험_유형: matchedExps,
      공고_원문: jobRawText.slice(0, 2500),
    },
    청년_이력서: {
      학력: resume.education,
      전공: resume.major,
      자격증: resume.certificates,
      총_경력_개월: resume.career?.declared_total_months ?? null,
      매칭된_보유기술_근거: matchedSkills,
      경험_목록: candidateExps,
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        temperature: 0.2,
        seed: 42,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });
    clearTimeout(timer);

    if (!res.ok) {
      return fallback();
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return fallback();

    const parsed = ReasonResponseZod.safeParse(JSON.parse(content));
    if (!parsed.success) return fallback();

    // 점수 숫자나 지원금 확정 표현이 섞였을 경우 방어적으로 폴백
    if (/\d+\s*점|지원금\s*(확정|수급)/.test(parsed.data.reason)) {
      return fallback();
    }

    return parsed.data.reason;
  } catch {
    return fallback();
  }
}
