import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/require-user";
import { createAdminClient, jsonError } from "@/lib/supabase/admin";
import { getDecryptedYouthProfile } from "@/server/auth/youth-profile";
import {
  calculateMatchScore,
  fromCachedMatchRow,
  isMatchCacheValid,
  toMatchResultRow,
  type CachedMatchResultRow,
} from "@/server/matching/score";
import { generateLlmReason } from "@/server/matching/reason";
import { evaluateJobPolicy } from "@/server/policy/evaluate";
import { getEvaluatedMonthKST, getTodayKST } from "@/server/auth/crypto";
import { TAXONOMY_VERSION } from "@/contracts/taxonomy";
import type { CategoryId, JobMatchingJson } from "@/contracts/matching";
import type { CompanySummary, JobCard, MainResponse } from "@/contracts/api";

export async function GET(request: Request) {
  const session = await requireUser();
  if (!session) {
    return jsonError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
  }

  const userId = session.user.id;
  const admin = createAdminClient();

  const profile = await getDecryptedYouthProfile(admin, userId, session.user.email);
  if (!profile) {
    return jsonError(409, "ONBOARDING_REQUIRED", "온보딩을 먼저 완료해주세요.");
  }

  const { searchParams } = new URL(request.url);
  const categoryFilter = searchParams.get("category") as CategoryId | null;
  const searchQuery = searchParams.get("q")?.trim() || "";

  // 1. Fetch user's existing applications
  const { data: userApplications } = await admin
    .from("applications")
    .select("job_id")
    .eq("youth_user_id", userId);
  const appliedJobIds = new Set((userApplications || []).map((a) => a.job_id));

  // 2. Fetch jobs, companies, and their categories
  const { data: jobsData, error: jobsErr } = await admin
    .from("jobs")
    .select(`
      id,
      title,
      employment_kind,
      work_address,
      work_gu,
      deadline,
      posted_at,
      status,
      source,
      industry,
      raw_text,
      matching_json,
      job_version,
      crawled_at,
      companies (
        id,
        name,
        business_desc,
        gu,
        is_demo
      ),
      job_post_categories (
        category_slug
      )
    `)
    .eq("match_status", "verified")
    .order("posted_at", { ascending: false, nullsFirst: false });

  if (jobsErr) {
    console.error("Failed to query jobs:", jobsErr);
    return jsonError(500, "DB_ERROR", "공고 목록을 불러오는데 실패했습니다.");
  }

  const evaluatedMonth = getEvaluatedMonthKST();
  const todayKST = getTodayKST();
  const resumeJson = profile.resume?.matching_json || null;
  const hasResume = resumeJson != null;

  // 2-1. Fetch existing match_results cache rows for this youth user
  const cacheMap = new Map<string, CachedMatchResultRow>();
  const toUpsertMap = new Map<string, CachedMatchResultRow>();

  if (hasResume) {
    const { data: cachedRows } = await admin
      .from("match_results")
      .select("*")
      .eq("youth_user_id", userId);
    for (const r of (cachedRows || []) as CachedMatchResultRow[]) {
      cacheMap.set(r.job_id, r);
    }
  }

  // 3. Transform to JobCards with cache hit check or dynamic score calculation
  const allCards: JobCard[] = [];
  const rawTextByJobId = new Map<string, string | null>();

  for (const row of jobsData || []) {
    rawTextByJobId.set(row.id, (row.raw_text as string | null) ?? null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const companyRow = (row.companies as any) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categoryRows = (row.job_post_categories as any[]) || [];
    const jobCategories = categoryRows.map((c) => c.category_slug as CategoryId);

    // Apply category filter if provided
    if (categoryFilter && !jobCategories.includes(categoryFilter)) {
      continue;
    }

    // Apply search query filter if provided
    if (searchQuery) {
      const qLower = searchQuery.toLowerCase();
      const titleMatch = row.title?.toLowerCase().includes(qLower);
      const companyMatch = companyRow.name?.toLowerCase().includes(qLower);
      if (!titleMatch && !companyMatch) {
        continue;
      }
    }

    const isParticipating = Boolean(companyRow.is_demo);
    const company: CompanySummary = {
      id: companyRow.id || "",
      name: companyRow.name || "강소기업",
      industry: row.industry || companyRow.business_desc || null,
      gu: companyRow.gu || null,
      is_demo: isParticipating,
      participation: isParticipating ? "participating" : "non_participating",
    };

    const isApplied = appliedJobIds.has(row.id);
    const deadlineStr = row.deadline ? String(row.deadline) : null;
    const isClosed = row.status === "closed" || (deadlineStr != null && deadlineStr < todayKST);

    let canApply = true;
    let applyBlockReason:
      | "already_applied"
      | "closed"
      | "company_not_participating"
      | "resume_required"
      | null = null;

    if (isApplied) {
      canApply = false;
      applyBlockReason = "already_applied";
    } else if (isClosed) {
      canApply = false;
      applyBlockReason = "closed";
    } else if (!isParticipating) {
      canApply = false;
      applyBlockReason = "company_not_participating";
    } else if (!hasResume) {
      canApply = false;
      applyBlockReason = "resume_required";
    }

    const jobVersion = row.job_version || 1;
    const cachedRow = cacheMap.get(row.id);
    let match;

    if (
      hasResume &&
      isMatchCacheValid(cachedRow, {
        profileVersion: profile.profile_version,
        jobVersion,
        taxonomyVersion: TAXONOMY_VERSION,
        evaluatedMonth,
      })
    ) {
      // Cache hit: restore score/breakdown, attach reason only after TOP 3 selection
      match = { ...fromCachedMatchRow(cachedRow), reason: null };
    } else {
      match = calculateMatchScore({
        desiredCategories: profile.desired_categories,
        resume: resumeJson,
        job: row.matching_json as JobMatchingJson | null,
        profileVersion: profile.profile_version,
        jobVersion,
        taxonomyVersion: TAXONOMY_VERSION,
        evaluatedMonth,
      });
      const rowToSave = toMatchResultRow({ youthUserId: userId, jobId: row.id, match });
      if (rowToSave) {
        toUpsertMap.set(row.id, rowToSave);
      }
    }

    const policy = evaluateJobPolicy({
      age: profile.age,
      birthDate: profile.birth_date,
      sido: profile.address.sido,
      employment_kind: row.employment_kind,
    });

    allCards.push({
      job_id: row.id,
      company,
      title: row.title,
      categories: jobCategories,
      employment_kind: row.employment_kind || "unknown",
      location: row.work_address || (row.work_gu ? `서울시 ${row.work_gu}` : null),
      deadline: deadlineStr,
      is_closed: isClosed,
      applied: isApplied,
      can_apply: canApply,
      apply_block_reason: applyBlockReason,
      external_url: row.source || null,
      match,
      policy,
    });
  }

  // 4. Sort allCards
  // - 이력서 있음: score DESC → 진행중 먼저 → 마감일 빠른 순(null 마지막) → 공고 ID ASC
  // - 이력서 없음: 진행중 먼저 → 마감일 빠른 순(null 마지막) → 공고 ID ASC
  allCards.sort((a, b) => {
    if (hasResume) {
      const scoreA = a.match.score ?? -1;
      const scoreB = b.match.score ?? -1;
      if (scoreB !== scoreA) return scoreB - scoreA;
    }

    if (a.is_closed !== b.is_closed) return a.is_closed ? 1 : -1;

    if (a.deadline && b.deadline) {
      if (a.deadline !== b.deadline) return a.deadline.localeCompare(b.deadline);
    } else if (a.deadline && !b.deadline) {
      return -1;
    } else if (!a.deadline && b.deadline) {
      return 1;
    }

    return a.job_id.localeCompare(b.job_id);
  });

  // 5. Select recommended TOP 3 (PRD v1.4 D-19) & generate personalized reason ONLY for TOP 3
  const reasonByJobId = new Map<string, string>();
  let recommended: JobCard[] = [];

  if (hasResume && resumeJson) {
    const top3Candidates = allCards
      .filter((card) => !card.is_closed && card.match.recommendable)
      .slice(0, 3);

    recommended = await Promise.all(
      top3Candidates.map(async (card) => {
        const cachedRow = cacheMap.get(card.job_id);
        const cachedReason =
          isMatchCacheValid(cachedRow, {
            profileVersion: profile.profile_version,
            jobVersion: card.match.job_version,
            taxonomyVersion: TAXONOMY_VERSION,
            evaluatedMonth,
          }) && cachedRow.reason
            ? cachedRow.reason
            : null;

        const reason =
          cachedReason ||
          (card.match.breakdown
            ? await generateLlmReason({
                companyName: card.company.name,
                jobTitle: card.title,
                jobRawText: rawTextByJobId.get(card.job_id),
                resume: resumeJson,
                breakdown: card.match.breakdown,
              })
            : null);

        const updatedMatch = {
          ...card.match,
          reason,
        };

        if (reason) {
          reasonByJobId.set(card.job_id, reason);
          if (!cachedReason) {
            const rowWithReason = toMatchResultRow({
              youthUserId: userId,
              jobId: card.job_id,
              match: updatedMatch,
            });
            if (rowWithReason) {
              toUpsertMap.set(card.job_id, rowWithReason);
            }
          }
        }

        return {
          ...card,
          match: updatedMatch,
        };
      })
    );

    if (toUpsertMap.size > 0) {
      const { error: cacheUpsertErr } = await admin
        .from("match_results")
        .upsert(Array.from(toUpsertMap.values()), { onConflict: "youth_user_id,job_id" });
      if (cacheUpsertErr) {
        console.error("Failed to upsert match_results cache:", cacheUpsertErr);
      }
    }
  }

  // 6. All postings: only TOP 3 recommended jobs carry match.reason; all others have reason = null
  const postings = allCards.map((card) => {
    const reason = reasonByJobId.get(card.job_id) ?? null;
    if (card.match.reason === reason) return card;
    return {
      ...card,
      match: {
        ...card.match,
        reason,
      },
    };
  });

  const response: MainResponse = {
    youth_summary: {
      name: profile.name,
      age: profile.age,
      address: profile.address,
      youth_policy: profile.youth_policy,
    },
    has_resume: hasResume,
    recommended,
    postings,
    fallback_used: false,
  };

  return NextResponse.json(response);
}
