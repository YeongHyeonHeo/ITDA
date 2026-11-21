import "server-only";
import {
  MATCHING_VERSION,
  type CategoryId,
  type JobMatchingJson,
  type ResumeMatchingJson,
  type MatchResult,
  type ScorePart,
} from "../../contracts/matching";
import { SKILL_TAXONOMY, EXPERIENCE_TAXONOMY } from "../../contracts/taxonomy";

const round1 = (val: number) => Math.round(val * 10) / 10;

const skillLabelMap = new Map<string, string>(SKILL_TAXONOMY.map((s) => [s.id, s.label]));
const expLabelMap = new Map<string, string>(EXPERIENCE_TAXONOMY.map((e) => [e.id, e.label]));

export function calculateMatchScore(params: {
  desiredCategories: CategoryId[];
  resume: ResumeMatchingJson | null;
  job: JobMatchingJson | null;
  profileVersion: number;
  jobVersion: number;
  taxonomyVersion: string;
  evaluatedMonth: string;
}): MatchResult {
  const {
    desiredCategories,
    resume,
    job,
    profileVersion,
    jobVersion,
    taxonomyVersion,
    evaluatedMonth,
  } = params;

  if (!resume) {
    return {
      status: "no_resume",
      score: null,
      fit_grade: null,
      breakdown: null,
      recommendable: false,
      reason: null,
      needs_check: [],
      algorithm_version: MATCHING_VERSION,
      profile_version: profileVersion,
      job_version: jobVersion,
      taxonomy_version: taxonomyVersion,
      evaluated_month: evaluatedMonth,
    };
  }

  if (!job) {
    return {
      status: "pending",
      score: null,
      fit_grade: null,
      breakdown: null,
      recommendable: false,
      reason: null,
      needs_check: ["공고 AI 매칭 데이터 대기 중"],
      algorithm_version: MATCHING_VERSION,
      profile_version: profileVersion,
      job_version: jobVersion,
      taxonomy_version: taxonomyVersion,
      evaluated_month: evaluatedMonth,
    };
  }

  const globalNeedsCheck: string[] = [];

  // ==========================================
  // 1. Category Score (20점)
  // ==========================================
  const jobCategoryIds = (job.categories || []).map((c) => c.id);
  const matchedCategories = desiredCategories.filter((c) =>
    jobCategoryIds.includes(c)
  );

  let categoryScore = 0;
  let categoryNeedsCheck = false;

  if (jobCategoryIds.length === 0) {
    categoryNeedsCheck = true;
    globalNeedsCheck.push("공고 직무 카테고리 정보 없음");
  } else if (matchedCategories.length > 0) {
    categoryScore = 20;
  }

  const categoryPart: ScorePart = {
    score: categoryScore,
    max_score: 20,
    matched_ids: matchedCategories,
    missing_ids: desiredCategories.filter((c) => !jobCategoryIds.includes(c)),
    needs_check: categoryNeedsCheck,
  };

  // ==========================================
  // 2. Skills Score (40점: 필수 30점 + 우대 10점)
  // ==========================================
  const youthSkillIds = new Set((resume.skills || []).map((s) => s.id));
  const rawReqSkillIds = (job.required_skills || []).map((s) => s.id);
  const rawPrefSkillIds = (job.preferred_skills || []).map((s) => s.id);

  // If duplicate, only in required
  const reqSkillIds = Array.from(new Set(rawReqSkillIds));
  const prefSkillIds = Array.from(new Set(rawPrefSkillIds.filter((id) => !reqSkillIds.includes(id))));

  let reqScore = 0;
  let reqNeedsCheck = false;
  if (reqSkillIds.length === 0) {
    reqNeedsCheck = true;
  } else {
    const matchedReq = reqSkillIds.filter((id) => youthSkillIds.has(id));
    reqScore = 30 * (matchedReq.length / reqSkillIds.length);
  }

  let prefScore = 0;
  let prefNeedsCheck = false;
  if (prefSkillIds.length === 0) {
    prefNeedsCheck = true;
  } else {
    const matchedPref = prefSkillIds.filter((id) => youthSkillIds.has(id));
    prefScore = 10 * (matchedPref.length / prefSkillIds.length);
  }

  const allJobSkillIds = [...reqSkillIds, ...prefSkillIds];
  const matchedSkillIds = allJobSkillIds.filter((id) => youthSkillIds.has(id));
  const missingSkillIds = reqSkillIds.filter((id) => !youthSkillIds.has(id));

  const totalSkillScore = round1(reqScore + prefScore);
  const skillsPart: ScorePart = {
    score: totalSkillScore,
    max_score: 40,
    matched_ids: matchedSkillIds,
    missing_ids: missingSkillIds,
    needs_check: reqNeedsCheck && prefNeedsCheck,
  };

  // ==========================================
  // 3. Experience Score (25점)
  // ==========================================
  const youthExpCompetencies = new Set<string>();
  for (const exp of resume.experiences || []) {
    for (const cId of exp.competency_ids || []) {
      youthExpCompetencies.add(cId);
    }
  }

  const jobExpReqIds = (job.experience_requirements || []).map((e) => e.id);
  let expScore = 0;
  let expNeedsCheck = false;

  if (jobExpReqIds.length === 0) {
    expNeedsCheck = true;
  } else {
    const matchedExp = jobExpReqIds.filter((id) => youthExpCompetencies.has(id));
    expScore = 25 * (matchedExp.length / jobExpReqIds.length);
  }

  const matchedExpIds = jobExpReqIds.filter((id) => youthExpCompetencies.has(id));
  const missingExpIds = jobExpReqIds.filter((id) => !youthExpCompetencies.has(id));

  const experiencePart: ScorePart = {
    score: round1(expScore),
    max_score: 25,
    matched_ids: matchedExpIds,
    missing_ids: missingExpIds,
    needs_check: expNeedsCheck,
  };

  // ==========================================
  // 4. Career Score (15점)
  // ==========================================
  let M: number | null = null;
  if (typeof resume.career?.declared_total_months === "number") {
    M = resume.career.declared_total_months;
  } else if (resume.career?.explicitly_no_experience === true) {
    M = 0;
  }

  const jobCareer = job.career || {
    accepts_new_graduate: null,
    accepts_experienced: null,
    min_months: null,
    max_months: null,
  };

  let careerScore = 0;
  let careerNeedsCheck = false;

  const isCareerFree =
    jobCareer.accepts_new_graduate === true &&
    jobCareer.accepts_experienced === true &&
    jobCareer.min_months === null &&
    jobCareer.max_months === null;

  if (isCareerFree) {
    careerScore = 15;
  } else if (M === 0) {
    if (jobCareer.accepts_new_graduate === true) {
      careerScore = 15;
    } else if (jobCareer.accepts_new_graduate === false) {
      careerScore = 0;
    } else {
      careerScore = 0;
      careerNeedsCheck = true;
      globalNeedsCheck.push("신입 지원 가능 여부 확인 필요");
    }
  } else if (typeof M === "number" && M > 0) {
    if (jobCareer.accepts_experienced === false) {
      careerScore = 0;
    } else if (jobCareer.accepts_experienced === true) {
      const min = jobCareer.min_months;
      const max = jobCareer.max_months;
      if (min !== null && M < min) {
        careerScore = round1(15 * (M / min));
        globalNeedsCheck.push(`최소 요구 경력(${min}개월) 미달 확인 필요`);
      } else if (max !== null && M > max) {
        careerScore = 0;
      } else {
        careerScore = 15;
      }
    } else {
      careerScore = 0;
      careerNeedsCheck = true;
    }
  } else {
    // M === null
    careerScore = 0;
    careerNeedsCheck = true;
    globalNeedsCheck.push("경력 개월수 확인 필요");
  }

  const careerPart: ScorePart = {
    score: careerScore,
    max_score: 15,
    matched_ids: [],
    missing_ids: [],
    needs_check: careerNeedsCheck,
  };

  // Total
  const totalScore = round1(
    categoryPart.score + skillsPart.score + experiencePart.score + careerPart.score
  );
  const recommendable =
    totalScore >= 60.0 &&
    categoryPart.score === 20 &&
    skillsPart.matched_ids.length + experiencePart.matched_ids.length >= 1;
  const fit_grade = totalScore >= 60.0 ? "high" : totalScore >= 40.0 ? "medium" : "low";

  return {
    status: "ready",
    score: totalScore,
    fit_grade,
    breakdown: {
      category: categoryPart,
      skills: skillsPart,
      experience: experiencePart,
      career: careerPart,
    },
    recommendable,
    // 81개 전체 공고 계산 시에는 reason을 미리 생성하지 않고 null로 둔다 (TOP 3 선정 후 생성)
    reason: null,
    needs_check: Array.from(new Set(globalNeedsCheck)),
    algorithm_version: MATCHING_VERSION,
    profile_version: profileVersion,
    job_version: jobVersion,
    taxonomy_version: taxonomyVersion,
    evaluated_month: evaluatedMonth,
  };
}

function cleanSnippet(text: string, maxLen = 65): string {
  const normalized = text
    .replace(/\s+/g, " ")
    .replace(/(\d)\s+(년|개월|급|건|곳|억|천|만)/g, "$1$2")
    .trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen).trim()}…`;
}

/**
 * 추천 TOP 3 공고에 대해서만 호출하여,
 * 개인 이력서의 경험 제목(title), 원문 근거(evidence), 보유 역량 근거, 자격증 정보를 조합한 구체적 추천 이유를 생성한다.
 */
export function buildPersonalizedReason(params: {
  resume: ResumeMatchingJson;
  breakdown: NonNullable<MatchResult["breakdown"]>;
}): string {
  const { resume, breakdown } = params;
  const clauses: string[] = [];

  // 1. 경험 제목(title) + 이력서 경험 evidence
  const matchedExpSet = new Set(breakdown.experience.matched_ids);
  const matchedExperiences = (resume.experiences || []).filter((exp) =>
    (exp.competency_ids || []).some((id) => matchedExpSet.has(id))
  );
  const targetExp = matchedExperiences[0] || (resume.experiences || [])[0];

  if (targetExp) {
    const title = cleanSnippet(targetExp.title, 45);
    const ev = targetExp.evidence ? cleanSnippet(targetExp.evidence, 60) : "";
    const careerMonths =
      typeof resume.career?.declared_total_months === "number" &&
      resume.career.declared_total_months > 0
        ? `, 총 ${resume.career.declared_total_months}개월`
        : "";
    if (ev && ev !== title) {
      clauses.push(`이력서의 '${title}${careerMonths}' 경험("${ev}")`);
    } else {
      clauses.push(`이력서의 '${title}${careerMonths}' 실무·프로젝트 경험`);
    }
  }

  // 2. 일치한 역량(스킬) + 이력서 스킬 evidence
  const skillEvidenceMap = new Map<string, string>();
  for (const s of resume.skills || []) {
    if (s.id && s.evidence && !skillEvidenceMap.has(s.id)) {
      skillEvidenceMap.set(s.id, cleanSnippet(s.evidence, 50));
    }
  }

  const matchedSkillDetails = breakdown.skills.matched_ids.slice(0, 3).map((id) => {
    const label = skillLabelMap.get(id) || id;
    const ev = skillEvidenceMap.get(id);
    return ev ? `${label}("${ev}")` : label;
  });

  if (matchedSkillDetails.length > 0) {
    clauses.push(`보유 역량 ${matchedSkillDetails.join(", ")}`);
  }

  // 3. 자격증 (certificates) 및 전공 정보
  const certs = (resume.certificates || [])
    .map((c) => cleanSnippet(c, 30))
    .filter(Boolean)
    .slice(0, 2);
  if (certs.length > 0) {
    clauses.push(`자격증(${certs.join(", ")})`);
  } else if (resume.major) {
    clauses.push(`전공(${cleanSnippet(resume.major, 25)})`);
  }

  if (clauses.length === 0) {
    const fallbackLabels = [
      ...breakdown.skills.matched_ids.map((id) => skillLabelMap.get(id) || id),
      ...breakdown.experience.matched_ids.map((id) => expLabelMap.get(id) || id),
    ];
    if (fallbackLabels.length > 0) {
      return `희망 직무와 일치하며 이력서의 ${fallbackLabels.slice(0, 3).join(", ")} 역량이 공고 요건과 부합합니다.`;
    }
    return "희망 직무 및 이력서 보유 역량이 공고 요건과 부합합니다.";
  }

  return `${clauses.join(" 및 ")} 이력서 정보가 본 공고의 요구 요건과 직접 부합합니다.`;
}
