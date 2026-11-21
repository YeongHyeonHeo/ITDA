#!/usr/bin/env python3
"""2단계: 적재 Load — 크롤 JSON을 Supabase public.jobs 에 Safe Upsert.

규칙(docs/crawling-plan.md §4):
  - 신규 source_job_id       -> INSERT (extraction_status='pending', job_version=1, matching_json 미설정)
  - 기존 + content_hash 동일 -> 메타/상태(status·deadline·posted_at·crawled_at)만 갱신, job_version 유지, AI 재호출 안 함
  - 기존 + content_hash 변경 -> 본문·표시필드 갱신 + job_version++ + extraction_status='pending' (matching_json 은 보존, 정제 단계에서 재계산)
  - match_status 는 INSERT 시에만 설정(기존 admin 확정값 보존). matching_json 은 Load 가 절대 덮어쓰지 않는다.
  - 목록 미노출만으로 마감 처리 금지. 전체목록 완주(full_list_completed) + --close-missing 일 때만 누락 공고 closed 전환.

사용법:
  python3 scripts/load_jobs_to_supabase.py --in /tmp/crawled-all.json --dry-run
  python3 scripts/load_jobs_to_supabase.py --in /tmp/crawled-all.json
  python3 scripts/load_jobs_to_supabase.py --in /tmp/crawled-all.json --close-missing
"""
import argparse
import json
import re
import sys
from collections import Counter

from jobs_pipeline_common import (
    load_env, SupabaseRest, derive_status_deadline, build_company_index,
    resolve_company, work_gu_of, employment_kind, fix_url, DETAIL_URL,
)


def job_to_common_row(job: dict) -> dict:
    """INSERT/변경 UPDATE 공통 표시·원문 필드 (matching_json 제외)."""
    hc_digits = re.sub(r"\D", "", job.get("headcount") or "")
    headcount = int(hc_digits) if hc_digits and hc_digits != "0" else None
    benefits = " / ".join(x for x in (job.get("benefit_pay"), job.get("benefit_growth"), job.get("benefit_life")) if x)
    return {
        "company_name": job.get("company"),
        "title": job.get("title"),
        "position_raw": job.get("position") or None,
        "preferred": job.get("preferred") or None,
        "employment_type_raw": job.get("employment_type") or None,
        "employment_kind": employment_kind(job.get("employment_type")),
        "career_req": job.get("career") or None,
        "education_req": job.get("education") or None,
        "salary": job.get("salary") or None,
        "work_address": job.get("work_address") or None,
        "work_gu": work_gu_of(job),
        "holiday_type": job.get("work_type") or None,
        "headcount": headcount,
        "work_hours": job.get("work_hours") or None,
        "selection_process": job.get("process") or None,
        "documents": job.get("documents") or None,
        "notes": job.get("notes") or None,
        "benefits": benefits or None,
        "industry": job.get("industry") or None,
        "company_homepage": fix_url(job.get("homepage")),
        "raw_text": job.get("_raw_text") or "",
        "content_hash": job.get("_content_hash") or "",
    }


def main():
    ap = argparse.ArgumentParser(description="크롤 JSON -> Supabase jobs Safe Upsert (2단계 적재)")
    ap.add_argument("--in", dest="infile", required=True, help="crawl_seoul_jobs.py 결과 JSON")
    ap.add_argument("--env", default=".env.local")
    ap.add_argument("--dry-run", action="store_true", help="DB 쓰기 없이 계획만 출력")
    ap.add_argument("--close-missing", action="store_true",
                    help="전체목록 완주 시 목록에서 사라진 open 공고를 closed 로 전환")
    args = ap.parse_args()

    with open(args.infile, encoding="utf-8") as f:
        payload = json.load(f)
    jobs = payload.get("jobs", [])
    crawled_at = payload.get("extracted_at")
    full_list_completed = bool(payload.get("full_list_completed"))

    env = load_env(args.env)
    sb = SupabaseRest(env)
    by_name, by_road = build_company_index(sb)

    stats = Counter()
    seen_ids = set()

    for job in jobs:
        sid = job["post_id"]
        seen_ids.add(sid)
        status, posted_at, deadline = derive_status_deadline(job)
        common = job_to_common_row(job)

        existing = sb.select("jobs", {
            "source_job_id": f"eq.{sid}",
            "select": "id,content_hash,job_version,status,deadline,extraction_status",
        })

        if not existing:
            company_id, match_status, method = resolve_company(job, by_name, by_road)
            row = {
                **common,
                "source_job_id": sid,
                "source": f"{DETAIL_URL}?hidcmp_recmnt_no={sid}",
                "company_id": company_id,
                "match_status": match_status,
                "match_method": method,
                "posted_at": posted_at,
                "deadline": deadline,
                "status": status,
                "crawled_at": crawled_at,
                "extraction_status": "pending",
                "job_version": 1,
            }
            stats["insert"] += 1
            print(f"  [INSERT] {sid} {str(job.get('title'))[:28]:<28} match={match_status}/{method} status={status} deadline={deadline}")
            if not args.dry_run:
                sb.insert("jobs", row)
            continue

        cur = existing[0]
        meta = {"status": status, "deadline": deadline, "posted_at": posted_at, "crawled_at": crawled_at}
        if cur["content_hash"] == common["content_hash"]:
            stats["unchanged"] += 1
            print(f"  [META  ] {sid} {str(job.get('title'))[:28]:<28} hash=동일 status={status} deadline={deadline}")
            if not args.dry_run:
                sb.update("jobs", {"source_job_id": f"eq.{sid}"}, meta)
        else:
            patch = {**common, **meta,
                     "job_version": int(cur["job_version"]) + 1,
                     "extraction_status": "pending"}
            # match_status / matching_json 은 의도적으로 제외(기존값 보존)
            stats["changed"] += 1
            print(f"  [CHANGE] {sid} {str(job.get('title'))[:28]:<28} v{cur['job_version']}→{int(cur['job_version'])+1} → pending(재정제 대상)")
            if not args.dry_run:
                sb.update("jobs", {"source_job_id": f"eq.{sid}"}, patch)

    # 누락 공고 마감 전환 (안전장치: 전체목록 완주 + 명시 플래그)
    if args.close_missing:
        if not full_list_completed:
            print("  [CLOSE ] 건너뜀 — full_list_completed=False (부분 수집이라 마감 전환 금지)", file=sys.stderr)
        else:
            open_rows = sb.select("jobs", {"status": "eq.open", "select": "source_job_id"})
            to_close = [r["source_job_id"] for r in open_rows if r["source_job_id"] not in seen_ids]
            stats["closed_missing"] = len(to_close)
            for sid in to_close:
                print(f"  [CLOSE ] {sid} 목록 미노출 → closed")
                if not args.dry_run:
                    sb.update("jobs", {"source_job_id": f"eq.{sid}"}, {"status": "closed"})

    mode = "DRY-RUN" if args.dry_run else "APPLIED"
    print(f"\n[{mode}] insert={stats['insert']} changed={stats['changed']} unchanged={stats['unchanged']} "
          f"closed_missing={stats.get('closed_missing', 0)} (full_list_completed={full_list_completed})", file=sys.stderr)


if __name__ == "__main__":
    main()
