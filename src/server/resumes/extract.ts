import "server-only";
import { extractText } from "unpdf";
import { z } from "zod";
import {
  SKILL_TAXONOMY,
  EXPERIENCE_TAXONOMY,
  SKILL_ID_SET,
  EXPERIENCE_ID_SET,
  TAXONOMY_VERSION,
} from "@/contracts/taxonomy";
import type { ResumeMatchingJson } from "@/contracts/matching";

const ResumeMatchingZod = z.object({
  education: z.string().nullable(),
  major: z.string().nullable(),
  certificates: z.array(z.string()).default([]),
  schema_version: z.literal("matching-v1").default("matching-v1"),
  taxonomy_version: z.string().default(TAXONOMY_VERSION),
  skills: z
    .array(
      z.object({
        id: z.string(),
        evidence: z.string(),
      })
    )
    .default([]),
  experiences: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["employment", "internship", "project", "other"]).default("project"),
        title: z.string(),
        evidence: z.string(),
        competency_ids: z.array(z.string()).default([]),
        start_month: z.string().nullable().default(null),
        end_month: z.string().nullable().default(null),
        is_current: z.boolean().nullable().default(null),
      })
    )
    .default([]),
  career: z
    .object({
      declared_total_months: z.number().nullable().default(null),
      explicitly_no_experience: z.boolean().nullable().default(null),
      evidence: z.string().nullable().default(null),
    })
    .default({
      declared_total_months: null,
      explicitly_no_experience: null,
      evidence: null,
    }),
  unmapped: z
    .array(
      z.object({
        raw: z.string(),
        evidence: z.string(),
      })
    )
    .default([]),
});

/**
 * Extract plain text from PDF buffer using unpdf
 */
export async function extractTextFromPdf(buffer: Buffer | Uint8Array): Promise<string> {
  // PDF.js transfers and detaches the underlying ArrayBuffer, so pass a fresh copy.
  const uint8 = new Uint8Array(buffer);
  const { text } = await extractText(uint8);
  const fullText = Array.isArray(text) ? text.join("\n") : (text || "");
  return fullText.trim();
}

/**
 * Heuristic fallback parser when LLM is unavailable or for local testing
 */
function heuristicExtract(rawText: string): ResumeMatchingJson {
  const lower = rawText.toLowerCase();

  // 1. Match skills from aliases
  const matchedSkills: { id: string; evidence: string }[] = [];
  for (const s of SKILL_TAXONOMY) {
    for (const alias of s.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        matchedSkills.push({ id: s.id, evidence: alias });
        break;
      }
    }
  }

  // 2. Match experiences from aliases
  const matchedExperiences: ResumeMatchingJson["experiences"] = [];
  for (const exp of EXPERIENCE_TAXONOMY) {
    for (const alias of exp.aliases) {
      if (lower.includes(alias.toLowerCase())) {
        matchedExperiences.push({
          id: exp.id,
          kind: "project",
          title: exp.label,
          evidence: alias,
          competency_ids: [exp.id],
          start_month: null,
          end_month: null,
          is_current: false,
        });
        break;
      }
    }
  }

  // 3. Simple certificate scan
  const certificates: string[] = [];
  const certKeywords = ["정보처리기사", "SQLD", "ADsP", "컴퓨터활용능력", "토익", "TOEIC", "OPIc"];
  for (const cert of certKeywords) {
    if (rawText.includes(cert)) {
      certificates.push(cert);
    }
  }

  return {
    education: null,
    major: null,
    certificates,
    schema_version: "matching-v1",
    taxonomy_version: TAXONOMY_VERSION,
    skills: matchedSkills,
    experiences: matchedExperiences,
    career: {
      declared_total_months: null,
      explicitly_no_experience: null,
      evidence: null,
    },
    unmapped: [],
  };
}

/**
 * Call OpenAI to structure raw resume text into ResumeMatchingJson
 */
export async function extractResumeMatchingJson(rawText: string): Promise<ResumeMatchingJson> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return heuristicExtract(rawText);
  }

  const systemPrompt = `You are a strict resume parser for the Seoul Youth Employment Platform ("ITDA").
Normalize the candidate's resume strictly against our closed taxonomy v1.
DO NOT hallucinate or infer skills, education, or experience not mentioned in the resume text.
Extract EVERY matching skill and experience competency explicitly supported by the text (do not omit explicitly stated skills or experiences).
Every skill and experience item MUST have an 'evidence' string taken verbatim from the text.

[ALLOWED SKILLS (ID: Label)]:
${SKILL_TAXONOMY.map((s) => `- ${s.id}: ${s.label} (${s.aliases.join(", ")})`).join("\n")}

[ALLOWED EXPERIENCES (ID: Label)]:
${EXPERIENCE_TAXONOMY.map((e) => `- ${e.id}: ${e.label}`).join("\n")}

Return JSON in this exact structure:
{
  "education": string or null,
  "major": string or null,
  "certificates": [string],
  "schema_version": "matching-v1",
  "taxonomy_version": "v1",
  "skills": [{ "id": "valid_skill_id", "evidence": "verbatim text excerpt" }],
  "experiences": [{
    "id": "valid_experience_id",
    "kind": "employment" | "internship" | "project" | "other",
    "title": "string",
    "evidence": "verbatim text excerpt",
    "competency_ids": ["valid_experience_id"],
    "start_month": "YYYY-MM" or null,
    "end_month": "YYYY-MM" or null,
    "is_current": boolean or null
  }],
  "career": {
    "declared_total_months": number or null,
    "explicitly_no_experience": boolean or null,
    "evidence": string or null
  },
  "unmapped": [{ "raw": "string", "evidence": "string" }]
}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      seed: 42,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Candidate Resume Text:\n---\n${rawText.slice(0, 8000)}\n---`,
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty content");

  const validated = ResumeMatchingZod.parse(JSON.parse(content));
  return groundResult(validated, rawText);
}

const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** 사전 밖 id와 원문에 없는 evidence는 unmapped로 보내 점수에서 제외한다. */
function groundResult(
  v: z.infer<typeof ResumeMatchingZod>,
  rawText: string
): ResumeMatchingJson {
  const haystack = norm(rawText);
  const grounded = (evidence: string) => {
    const e = norm(evidence);
    return e.length > 0 && haystack.includes(e);
  };
  const unmapped = [...v.unmapped];

  const seenSkillIds = new Set<string>();
  const skills = v.skills.filter((s) => {
    const ok = SKILL_ID_SET.has(s.id) && grounded(s.evidence);
    if (!ok) {
      unmapped.push({ raw: s.id, evidence: s.evidence });
      return false;
    }
    if (seenSkillIds.has(s.id)) return false;
    seenSkillIds.add(s.id);
    return true;
  });

  const experiences = v.experiences
    .filter((exp) => {
      const ok = grounded(exp.evidence);
      if (!ok) unmapped.push({ raw: exp.title, evidence: exp.evidence });
      return ok;
    })
    .map((exp) => ({
      ...exp,
      competency_ids: exp.competency_ids.filter((c) => EXPERIENCE_ID_SET.has(c)),
    }));

  return {
    ...v,
    skills,
    experiences,
    unmapped,
    schema_version: "matching-v1",
    taxonomy_version: TAXONOMY_VERSION,
  };
}

