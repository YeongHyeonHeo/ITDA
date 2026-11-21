// scripts/extract_jobs_llm.js
// 채용공고 원문(jobs.raw_text)을 OpenAI(gpt-4o-mini)로 정제하여
// JobMatchingJson 검증 후 jobs.matching_json 및 job_post_categories를 갱신하는 배치 스크립트.
//
// 사용법:
//   node scripts/extract_jobs_llm.js              # 진행중 검증 공고(status='open')만 정제 & DB 반영
//   node scripts/extract_jobs_llm.js --dry-run    # DB 반영 없이 추출 결과만 미리보기
//   node scripts/extract_jobs_llm.js --all        # 전체 81건 정제 & DB 반영

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

// 1. Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0 && !line.trim().startsWith("#")) {
      process.env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY?.trim();

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_KEY) {
  console.error("❌ .env.local에 Supabase 및 OPENAI_API_KEY가 모두 필요합니다.");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const ALL_JOBS = args.has("--all");

const admin = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// src/contracts/matching.ts & taxonomy.ts v1 정본과 동일
const CATEGORY_LIST = [
  ["management_hr", "경영·기획·인사"],
  ["accounting_finance", "회계·재무"],
  ["marketing_pr", "마케팅·홍보"],
  ["sales_customer", "영업·고객관리"],
  ["product_md", "상품기획·MD"],
  ["it_data", "IT개발·데이터"],
  ["design", "디자인"],
  ["rnd_engineering", "연구개발·설계"],
  ["production_quality", "생산·품질"],
  ["procurement_logistics_trade", "구매·물류·무역"],
  ["construction_civil_env", "건축·토목·환경"],
  ["medical_health", "의료·보건"],
  ["education", "교육"],
  ["media_content", "미디어·콘텐츠"],
  ["other", "기타"],
];

const SKILL_LIST = [
  ["python", "Python", "Python, 파이썬, VBA"],
  ["javascript_ts", "JavaScript / TypeScript", "JavaScript, TypeScript, React, Node.js, HTML5, CSS, WebGL, Cesium.js"],
  ["java_spring", "Java / Spring", "Java, Spring, Spring Boot"],
  ["csharp_dotnet", "C# / .NET", "C#, .NET, DevExpress"],
  ["sql_db", "SQL / 데이터베이스", "SQL, Oracle, MySQL, PostgreSQL, DB, 데이터베이스"],
  ["ai_ml", "AI / 머신러닝·딥러닝", "AI, ML, DL, LLM, PyTorch, TensorFlow, 머신러닝, 딥러닝"],
  ["data_analysis", "데이터 분석·통계", "데이터 분석, 통계, 대용량 데이터 처리, 시각화, 대시보드"],
  ["cloud_infra", "클라우드·서버 인프라", "AWS, GCP, Azure, VMware, 가상화, 네트워크, 서버 인프라"],
  ["linux_os", "Linux / 서버 OS", "Linux, RHEL, CentOS, Ubuntu, Windows Server"],
  ["git_collab", "Git / 협업 도구", "Git, GitHub, SVN, Jira, Notion"],
  ["it_cert_security", "정보처리·보안", "정보처리기사, 정보보안, DLP, DRM, EDMS, 웹 접근성"],
  ["figma_uiux", "Figma / UI·UX", "Figma, 피그마, UI, UX, 프로토타이핑"],
  ["adobe_design", "포토샵·일러스트·편집", "포토샵, 일러스트, Photoshop, Illustrator, 인디자인, 편집디자인"],
  ["video_content", "영상·콘텐츠 제작", "프리미어, 애프터이펙트, 영상편집, 촬영, 콘텐츠 제작"],
  ["ai_creative_tools", "AI 크리에이티브 툴", "미드저니, Midjourney, AI 툴, 생성형 AI"],
  ["digital_marketing", "디지털·퍼포먼스 마케팅", "디지털광고, 퍼포먼스 마케팅, SNS 마케팅, 인플루언서 마케팅, 캠페인"],
  ["service_planning", "서비스·API 기획", "서비스 기획, PM, PO, API 기획, 시스템 연동 기획"],
  ["proposal_docs", "제안서·문서 기획", "제안서 작성, 보고서, 발표자료, 기획서"],
  ["finance_quant", "채권·금융공학·투자", "채권, 파생상품, 금융공학, 금융상품, 자산평가, 주식, RCPS, BW, CB"],
  ["finance_cert", "회계·금융 자격", "CFA, CPA, FRM, 투자자산운용사, 회계관련 자격증, 전산회계, 금융자격증"],
  ["accounting_tax", "회계·재무·자금", "회계, 재무, 세무, 자금, 결산"],
  ["b2b_sales", "B2B·솔루션 영업", "B2B, 솔루션 영업, 해외영업, 영업지원, 바이어"],
  ["trade_logistics", "무역·물류·유통", "수출입, 통관, 수입신고, 글로벌 유통, 물류, SCM, 유통"],
  ["quality_qa_qc", "품질관리(QA/QC)·8D", "QA, QC, 8D, 정밀검사, 품질검사, 품질관리, ISO"],
  ["cad_engineering", "CAD·설계·기구", "CAD, AutoCAD, SolidWorks, 3D 설계, 기구설계"],
  ["medical_bio", "의료·보건·바이오", "간호, 의공학, 임상, 바이오, 의료기기, 의료"],
  ["office_excel", "MS Office / 엑셀", "MS Office, Excel, 엑셀, 컴퓨터활용능력, 컴퓨터 사용능력"],
  ["english", "영어", "영어, 비즈니스 영어, TOEIC, OPIc"],
  ["chinese", "중국어", "중국어, HSK"],
  ["foreign_lang_other", "기타 외국어", "외국어 능통, 일본어"],
  ["communication", "커뮤니케이션·협업", "커뮤니케이션, 고객 응대, 협업"],
  ["driver_license", "운전면허", "운전면허, 1종 보통, 2종 보통"],
];

const EXP_LIST = [
  ["product_development", "제품·서비스 개발/구축", "웹/앱 개발, AI/ML 개발, 3D GIS 개발, 주방가전 개발, 시스템 개발, 제품 개발"],
  ["data_reporting", "데이터 분석·대시보드·리포팅", "대시보드 제작, 데이터 처리 솔루션, 금융상품 평가모형, 통계 리포트, 데이터 분석"],
  ["service_planning_exp", "서비스·시스템 기획", "API 기반 서비스 기획, 외부 시스템 연동 기획, 서비스기획부터 개발 운영"],
  ["design_portfolio", "디자인·콘텐츠 포트폴리오", "편집디자인, 디자인 포트폴리오, 브랜드 디자인, 콘텐츠 제작"],
  ["marketing_campaign", "마케팅·광고 캠페인 운영", "디지털광고 실무경험, 인플루언서 캠페인 운영, 마케팅 에이전시, 광고대행사"],
  ["market_customer_research", "시장·고객 리서치", "고객 리서치, 고객 인터뷰, 설문조사, 시장조사"],
  ["sales_client_ops", "영업·고객·콜 업무 수행", "솔루션 영업 경험, 해외영업, 영업 경력, 콜 업무, 바이어 응대"],
  ["finance_valuation_exp", "금융·회계·자금 실무", "금융기관 경력, 채권평가사, 증권사, 운용사, 회계·자금 실무"],
  ["infra_system_ops", "시스템·인프라·보안 운영", "네트워크 모니터링 시스템 구축, 서버 인프라, 가상화 환경, 인프라 운영"],
  ["quality_inspection_exp", "품질검사·공정 개선", "정밀검사 경험, 8D 작성 경험, 수입신고, QA/QC"],
  ["trade_logistics_exp", "유통·물류·글로벌 인허가", "글로벌 이커머스, 글로벌 인허가, 유통, 물류, 수출입"],
  ["rnd_project_lead", "R&D·정부과제·프로젝트 리딩", "정부 과제 수행, 기업부설연구소, 프로젝트 PL, 조직 리딩"],
];

const CATEGORY_SET = new Set(CATEGORY_LIST.map(([id]) => id));
const SKILL_SET = new Set(SKILL_LIST.map(([id]) => id));
const EXP_SET = new Set(EXP_LIST.map(([id]) => id));

const norm = (s) => String(s || "").replace(/\s+/g, "").toLowerCase();

const SYSTEM_PROMPT = `You are a strict job posting normalizer for the Seoul Youth Employment Platform ("JOB잇다").
Normalize the job posting text strictly against our closed taxonomy v1.
DO NOT infer or hallucinate categories, skills, experience requirements, or career months not explicitly supported by the job text.
Every category, skill, and experience requirement MUST include a verbatim 'evidence' substring from the job text.

[ALLOWED CATEGORIES (max 3)]:
${CATEGORY_LIST.map(([id, label]) => `- ${id}: ${label}`).join("\n")}

[ALLOWED SKILLS]:
${SKILL_LIST.map(([id, label, aliases]) => `- ${id}: ${label} (${aliases})`).join("\n")}

[ALLOWED EXPERIENCE REQUIREMENTS]:
${EXP_LIST.map(([id, label, aliases]) => `- ${id}: ${label} (${aliases})`).join("\n")}

Return JSON strictly in this schema:
{
  "schema_version": "matching-v1",
  "taxonomy_version": "v1",
  "categories": [{ "id": "valid_category_id", "evidence": "verbatim substring" }],
  "required_skills": [{ "id": "valid_skill_id", "evidence": "verbatim substring" }],
  "preferred_skills": [{ "id": "valid_skill_id", "evidence": "verbatim substring" }],
  "experience_requirements": [{ "id": "valid_exp_id", "evidence": "verbatim substring" }],
  "career": {
    "accepts_new_graduate": boolean | null,
    "accepts_experienced": boolean | null,
    "min_months": number | null,
    "max_months": number | null,
    "evidence": string | null
  },
  "unmapped": [{ "raw": "string", "evidence": "string" }]
}`;

function groundJobJson(rawJson, rawText) {
  const haystack = norm(rawText);
  const grounded = (ev) => {
    const n = norm(ev);
    return n.length > 0 && haystack.includes(n);
  };

  const unmapped = Array.isArray(rawJson.unmapped) ? [...rawJson.unmapped] : [];

  const filterList = (arr, validSet) => {
    const out = [];
    const seen = new Set();
    for (const item of Array.isArray(arr) ? arr : []) {
      if (!item || typeof item.id !== "string" || typeof item.evidence !== "string") continue;
      if (!validSet.has(item.id) || !grounded(item.evidence)) {
        unmapped.push({ raw: item.id, evidence: item.evidence });
        continue;
      }
      if (!seen.has(item.id)) {
        seen.add(item.id);
        out.push({ id: item.id, evidence: item.evidence.trim() });
      }
    }
    return out;
  };

  const categories = filterList(rawJson.categories, CATEGORY_SET).slice(0, 3);
  const required_skills = filterList(rawJson.required_skills, SKILL_SET);
  const reqIds = new Set(required_skills.map((s) => s.id));
  // 필수·우대에 같은 ID가 있으면 필수에만 유지
  const preferred_skills = filterList(rawJson.preferred_skills, SKILL_SET).filter(
    (s) => !reqIds.has(s.id)
  );
  const experience_requirements = filterList(rawJson.experience_requirements, EXP_SET);

  const c = rawJson.career || {};
  let min_months = typeof c.min_months === "number" && c.min_months >= 0 ? c.min_months : null;
  let max_months = typeof c.max_months === "number" && c.max_months >= 0 ? c.max_months : null;
  if (min_months !== null && max_months !== null && min_months > max_months) {
    min_months = null;
    max_months = null;
  }

  return {
    schema_version: "matching-v1",
    taxonomy_version: "v1",
    categories,
    required_skills,
    preferred_skills,
    experience_requirements,
    career: {
      accepts_new_graduate:
        typeof c.accepts_new_graduate === "boolean" ? c.accepts_new_graduate : null,
      accepts_experienced:
        typeof c.accepts_experienced === "boolean" ? c.accepts_experienced : null,
      min_months,
      max_months,
      evidence: typeof c.evidence === "string" && grounded(c.evidence) ? c.evidence.trim() : null,
    },
    unmapped,
  };
}

async function callOpenAI(rawText) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0,
      seed: 42,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Job Posting Text:\n---\n${rawText.slice(0, 6000)}\n---` },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function main() {
  let query = admin
    .from("jobs")
    .select("id, company_name, title, status, raw_text, job_version")
    .eq("match_status", "verified")
    .order("status", { ascending: false });

  if (!ALL_JOBS) {
    query = query.eq("status", "open");
  }

  const { data: jobs, error } = await query;
  if (error) throw error;

  console.log(
    `🚀 공고 LLM 정제 시작: 대상 ${jobs.length}건 (${ALL_JOBS ? "전체" : "진행중(open)만"}, dry_run=${DRY_RUN})\n`
  );

  for (const job of jobs) {
    if (!job.raw_text) {
      console.log(`⚠️ [SKIP] ${job.company_name} - ${job.title} (raw_text 없음)`);
      continue;
    }
    try {
      const rawJson = await callOpenAI(job.raw_text);
      const matchingJson = groundJobJson(rawJson, job.raw_text);

      console.log(`✅ [${job.company_name}] ${job.title}`);
      console.log("   categories:", matchingJson.categories.map((c) => c.id));
      console.log("   required_skills:", matchingJson.required_skills.map((s) => s.id));
      console.log("   preferred_skills:", matchingJson.preferred_skills.map((s) => s.id));
      console.log("   experience_req:", matchingJson.experience_requirements.map((e) => e.id));
      console.log("   career:", matchingJson.career);

      if (!DRY_RUN) {
        const nextVersion = (job.job_version || 1) + 1;
        const { error: updErr } = await admin
          .from("jobs")
          .update({
            matching_json: matchingJson,
            extraction_status: "completed",
            job_version: nextVersion,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
        if (updErr) throw updErr;

        // job_post_categories 동기화
        await admin.from("job_post_categories").delete().eq("job_id", job.id);
        if (matchingJson.categories.length > 0) {
          await admin.from("job_post_categories").insert(
            matchingJson.categories.map((c) => ({
              job_id: job.id,
              category_slug: c.id,
            }))
          );
        }
        console.log(`   💾 DB 저장 완료 (job_version=${nextVersion})`);
      }
    } catch (err) {
      console.error(`❌ [FAIL] ${job.company_name} - ${job.title}:`, err.message);
      if (!DRY_RUN) {
        await admin
          .from("jobs")
          .update({ extraction_status: "failed", updated_at: new Date().toISOString() })
          .eq("id", job.id);
      }
    }
  }
  console.log("\n🎉 공고 LLM 정제 배치 완료!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
