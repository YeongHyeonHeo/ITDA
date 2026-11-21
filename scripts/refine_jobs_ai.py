#!/usr/bin/env python3
"""3단계: 정제 Refine — 신규/본문변경 공고(extraction_status in pending|failed)만 AI 정제.

- 각 공고 raw_text -> JobMatchingJson 추출(기본 LLM, --engine rules 로 규칙 폴백)
  -> 사전 ID/원문 evidence 검증 -> matching_json & job_post_categories 저장, extraction_status='completed'
- 검증/호출 실패 시 extraction_status='failed' 로만 기록(기존 matching_json 보존). job_version 은 건드리지 않음.

사용법:
  python3 scripts/refine_jobs_ai.py --dry-run                 # 후보만 집계(과금/쓰기 없음)
  python3 scripts/refine_jobs_ai.py --engine rules --limit 5  # 규칙 기반(무과금)으로 5건 정제
  python3 scripts/refine_jobs_ai.py --limit 10               # LLM 으로 10건 정제
"""
import argparse
import sys
from collections import Counter

from jobs_pipeline_common import (
    load_env, SupabaseRest, load_taxonomy,
    llm_extract_matching_json, sanitize_matching_json,
    extract_matching_json, validate_matching_json,
)


def main():
    ap = argparse.ArgumentParser(description="pending/failed 공고 AI 정제 (3단계)")
    ap.add_argument("--env", default=".env.local")
    ap.add_argument("--engine", choices=["llm", "rules"], default="llm")
    ap.add_argument("--model", default="gpt-4o-mini")
    ap.add_argument("--limit", type=int, default=None, help="처리 최대 건수")
    ap.add_argument("--only-verified", action="store_true", help="match_status=verified 공고만")
    ap.add_argument("--dry-run", action="store_true", help="후보만 집계(LLM 호출/DB 쓰기 없음)")
    ap.add_argument("--taxonomy", default="src/contracts/taxonomy.ts")
    args = ap.parse_args()

    env = load_env(args.env)
    sb = SupabaseRest(env)
    tax = load_taxonomy(args.taxonomy)

    params = {
        "extraction_status": "in.(pending,failed)",
        "select": "id,source_job_id,title,position_raw,preferred,industry,raw_text,job_version,extraction_status,match_status",
        "order": "created_at.asc",
    }
    if args.only_verified:
        params["match_status"] = "eq.verified"
    candidates = sb.select("jobs", params)
    if args.limit:
        candidates = candidates[: args.limit]

    print(f"정제 후보: {len(candidates)}건 (engine={args.engine}, dry_run={args.dry_run})", file=sys.stderr)
    if args.dry_run:
        for j in candidates:
            print(f"  [대상] {j['source_job_id']} {str(j.get('title'))[:32]:<32} status={j['extraction_status']} v{j['job_version']}")
        print(f"\n[DRY-RUN] 정제 대상 {len(candidates)}건 (실제 호출/쓰기 없음)", file=sys.stderr)
        return

    stats = Counter()
    for j in candidates:
        raw_text = j.get("raw_text") or ""
        try:
            if not raw_text.strip():
                raise ValueError("raw_text 비어 있음")
            if args.engine == "llm":
                mj = llm_extract_matching_json(raw_text, tax, env, args.model)
                cleaned = sanitize_matching_json(mj, raw_text, tax)
            else:
                job_like = {"title": j.get("title"), "position": j.get("position_raw"),
                            "preferred": j.get("preferred"), "industry": j.get("industry")}
                cleaned = extract_matching_json(job_like, raw_text)
                validate_matching_json(cleaned, raw_text)

            sb.update("jobs", {"id": f"eq.{j['id']}"},
                      {"matching_json": cleaned, "extraction_status": "completed"})
            # job_post_categories 동기화
            sb.delete("job_post_categories", {"job_id": f"eq.{j['id']}"})
            cats = [{"job_id": j["id"], "category_slug": c["id"]} for c in cleaned["categories"]]
            if cats:
                sb.insert("job_post_categories", cats)
            stats["completed"] += 1
            print(f"  [OK   ] {j['source_job_id']} {str(j.get('title'))[:28]:<28} "
                  f"cat={len(cleaned['categories'])} req={len(cleaned['required_skills'])} "
                  f"pref={len(cleaned['preferred_skills'])} exp={len(cleaned['experience_requirements'])}")
        except Exception as exc:  # noqa: BLE001
            stats["failed"] += 1
            print(f"  [FAIL ] {j['source_job_id']} {str(j.get('title'))[:28]:<28} {exc}", file=sys.stderr)
            sb.update("jobs", {"id": f"eq.{j['id']}"}, {"extraction_status": "failed"})

    print(f"\n[APPLIED] completed={stats['completed']} failed={stats['failed']}", file=sys.stderr)


if __name__ == "__main__":
    main()
