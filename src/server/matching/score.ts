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
  const recommendable = totalScore >= 60.0 && categoryPart.score > 0;
  const fit_grade = totalScore >= 60.0 ? "high" : totalScore >= 40.0 ? "medium" : "low";

  // Generate natural Korean reason grounded strictly on evidence
  const matchedSkillNames = matchedSkillIds.map((id) => skillLabelMap.get(id) || id);
  const matchedExpNames = matchedExpIds.map((id) => expLabelMap.get(id) || id);

  let reason = "";
  if (categoryPart.score > 0) {
    reason += `희망 직무 분야와 일치하며, `;
  }
  if (matchedSkillNames.length > 0) {
    reason += `보유 역량(${matchedSkillNames.slice(0, 3).join(", ")})이 공고 요건과 부합합니다. `;
  }
  if (matchedExpNames.length > 0) {
    reason += `관련 프로젝트 및 실무 경험(${matchedExpNames.slice(0, 2).join(", ")})을 보유하고 있습니다.`;
  }
  if (!reason) {
    reason = "직무 적합도 및 기본 요건을 검토 중인 공고입니다.";
  }

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
    reason: reason.trim(),
    needs_check: Array.from(new Set(globalNeedsCheck)),
    algorithm_version: MATCHING_VERSION,
    profile_version: profileVersion,
    job_version: jobVersion,
    taxonomy_version: taxonomyVersion,
    evaluated_month: evaluatedMonth,
  };
}
