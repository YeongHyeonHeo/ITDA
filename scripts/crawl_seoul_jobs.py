#!/usr/bin/env python3
"""서울시 일자리포털 '서울형 강소기업 채용정보' 크롤러 (1단계: 수집 Collect).

사용법:
  python3 scripts/crawl_seoul_jobs.py --limit 3 --out /tmp/crawled-sample.json
  python3 scripts/crawl_seoul_jobs.py --out /tmp/crawled-all.json
"""

import argparse
import hashlib
import html as htmllib
import json
import re
import ssl
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple

LIST_PAGE_URL = "https://job.seoul.go.kr/hmpg/bcop/hrmg/hrmgListPage.do"
LIST_PGNG_URL = "https://job.seoul.go.kr/hmpg/bcop/hrmg/hrmgListPgng.do"
DETAIL_URL = "https://job.seoul.go.kr/hmpg/bcop/hrmg/hrmgDetail.do"

KST = timezone(timedelta(hours=9))

# 개인정보/연락처(수집 제외) — docs/crawling-plan.md
EXCLUDED_LABELS = {"대표", "담당자", "전화번호", "부서", "이메일"}

# 상세 페이지 라벨 -> raw-gangso-jobs-all.json 호환 키 매핑
LABEL_TO_KEY = {
    "회사명": "company",
    "산업(업종)": "industry",
    "사원수": "employees",
    "경력": "career",
    "학력": "education",
    "고용형태": "employment_type",
    "우대사항": "preferred",
    "근무형태": "work_type",
    "급여": "salary",
    "근무시간": "work_hours",
    "근무지역": "work_address",
    "모집분야": "position",
    "모집인원": "headcount",
    "전형절차": "process",
    "유의사항": "notes",
    "시작일": "start",
    "종료일": "end",
    "제출서류": "documents",
    "보상·수당·지원": "benefit_pay",
    "사내제도·성장": "benefit_growth",
    "편의·여가·건강": "benefit_life",
    "기업형태": "company_type",
    "주소": "company_address",
    "홈페이지": "homepage",
}


def clean_text(raw_html: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", raw_html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = htmllib.unescape(text)
    return " ".join(text.split()).strip()


def post_form(url: str, data: dict, timeout: int = 15) -> str:
    encoded = urllib.parse.urlencode(data).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=encoded,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; SeoulItdaCrawler/1.0)",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
            "Referer": LIST_PAGE_URL,
        },
        method="POST",
    )
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, timeout=timeout, context=ctx) as resp:
        return resp.read().decode("utf-8", errors="replace")


def parse_list_page(html_str: str) -> Tuple[Optional[int], List[Dict]]:
    total_m = re.search(r'<div class="all">\s*전체\s*<span>(\d+)</span>\s*건', html_str)
    total_cnt = int(total_m.group(1)) if total_m else None

    tbody_m = re.search(r"<tbody>(.*?)</tbody>", html_str, re.S | re.I)
    if not tbody_m:
        return total_cnt, []

    rows = []
    for tr_m in re.finditer(r"<tr>(.*?)</tr>", tbody_m.group(1), re.S | re.I):
        tr_html = tr_m.group(1)
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr_html, re.S | re.I)
        if len(tds) < 7:
            continue

        post_m = re.search(r"hrmgDetail\(['\"]([0-9A-Za-z]+)['\"]\)", tds[3])
        if not post_m:
            continue

        list_no_str = clean_text(tds[0])
        list_no = int(list_no_str) if list_no_str.isdigit() else None
        list_status = clean_text(tds[1])
        company = clean_text(tds[2])
        title = clean_text(tds[3])
        list_salary = re.sub(r"^급여\s*:\s*", "", clean_text(tds[4]))
        list_gu = re.sub(r"^근무지\s*:\s*", "", clean_text(tds[5]))
        list_period = re.sub(r"^접수기간\s*:\s*", "", clean_text(tds[6]))

        rows.append({
            "post_id": post_m.group(1),
            "list_no": list_no,
            "list_status": list_status,
            "company": company,
            "title": title,
            "list_salary": list_salary,
            "list_gu": list_gu,
            "list_period": list_period,
        })
    return total_cnt, rows


def parse_detail_page(html_str: str) -> dict:
    start = html_str.find("강소기업 채용정보")
    end = html_str.find("<!--내용 끝")
    chunk = html_str[start:end] if start != -1 and end != -1 else html_str

    detail = {}
    title_m = re.search(r'<div class="smallgiants_box_right">\s*<h3>(.*?)</h3>', chunk, re.S | re.I)
    if title_m:
        detail["title"] = clean_text(title_m.group(1))

    for m in re.finditer(r"<(th|dt)[^>]*>(.*?)</\1>\s*<(td|dd)[^>]*>(.*?)</\3>", chunk, re.S | re.I):
        raw_label = clean_text(m.group(2)).rstrip(" :").strip()
        if raw_label in EXCLUDED_LABELS:
            continue
        key = LABEL_TO_KEY.get(raw_label)
        if not key:
            continue
        val = clean_text(m.group(4))
        # 동일 라벨(회사명/업종/사원수)이 상단·하단에 반복될 수 있어 첫 값 우선 또는 빈 값 보완
        if key not in detail or not detail[key]:
            detail[key] = val

    return detail


def build_raw_text(item: dict) -> str:
    sections = [
        ("제목", item.get("title")),
        ("모집분야", item.get("position")),
        ("경력조건", item.get("career")),
        ("학력조건", item.get("education")),
        ("고용형태", item.get("employment_type")),
        ("우대사항", item.get("preferred")),
        ("업종", item.get("industry")),
        ("근무·유의사항", item.get("notes")),
    ]
    lines = [f"[{label}] {val}" for label, val in sections if val]
    return "\n".join(lines)


def compute_content_hash(raw_text: str) -> str:
    return hashlib.sha256(raw_text.encode("utf-8")).hexdigest()


def crawl(limit: Optional[int] = None, page_size: int = 100, delay_sec: float = 0.2) -> dict:
    all_list_rows = []
    seen_ids = set()
    total_cnt = None
    page = 1

    while True:
        list_html = post_form(LIST_PGNG_URL, {
            "miv_pageNo": str(page),
            "miv_pageSize": str(page_size),
            "sidx": "FRST_REG_DT",
            "sord": "DESC",
            "searchWrkType": "N",
        })
        cnt, rows = parse_list_page(list_html)
        if total_cnt is None and cnt is not None:
            total_cnt = cnt
        if not rows:
            break

        for r in rows:
            if r["post_id"] not in seen_ids:
                seen_ids.add(r["post_id"])
                all_list_rows.append(r)
                if limit and len(all_list_rows) >= limit:
                    break

        if limit and len(all_list_rows) >= limit:
            break
        if total_cnt is not None and len(all_list_rows) >= total_cnt:
            break
        page += 1
        time.sleep(delay_sec)

    full_list_completed = (limit is None) and (total_cnt is not None) and (len(all_list_rows) >= total_cnt)

    jobs = []
    failures = []
    for row in all_list_rows:
        try:
            detail_html = post_form(DETAIL_URL, {"hidcmp_recmnt_no": row["post_id"]})
            detail = parse_detail_page(detail_html)
            if not detail.get("position") and not detail.get("title"):
                raise ValueError("상세 본문 파싱 결과 비어 있음")

            merged = {
                "post_id": row["post_id"],
                "list_no": row["list_no"],
                "list_status": row["list_status"],
                "company": detail.get("company") or row["company"],
                "title": detail.get("title") or row["title"],
                "list_salary": row["list_salary"],
                "list_gu": row["list_gu"],
                "list_period": row["list_period"],
                "industry": detail.get("industry", ""),
                "employees": detail.get("employees", ""),
                "career": detail.get("career", ""),
                "education": detail.get("education", ""),
                "employment_type": detail.get("employment_type", ""),
                "preferred": detail.get("preferred", ""),
                "work_type": detail.get("work_type", ""),
                "salary": detail.get("salary", ""),
                "work_hours": detail.get("work_hours", ""),
                "work_address": detail.get("work_address", ""),
                "position": detail.get("position", ""),
                "headcount": detail.get("headcount", ""),
                "process": detail.get("process", ""),
                "notes": detail.get("notes", ""),
                "start": detail.get("start", ""),
                "end": detail.get("end", ""),
                "documents": detail.get("documents", ""),
                "benefit_pay": detail.get("benefit_pay", ""),
                "benefit_growth": detail.get("benefit_growth", ""),
                "benefit_life": detail.get("benefit_life", ""),
                "company_type": detail.get("company_type", ""),
                "company_address": detail.get("company_address", ""),
                "homepage": detail.get("homepage", ""),
            }
            raw_text = build_raw_text(merged)
            merged["_raw_text"] = raw_text
            merged["_content_hash"] = compute_content_hash(raw_text)
            jobs.append(merged)
        except Exception as exc:
            failures.append({"post_id": row["post_id"], "error": str(exc)})
        time.sleep(delay_sec)

    return {
        "source": f"서울시 일자리포털 > 서울형 강소기업 > 채용정보 ({LIST_PAGE_URL})",
        "extracted_at": datetime.now(KST).strftime("%Y-%m-%dT%H:%M:%S%z"),
        "total_cnt": total_cnt,
        "collected_count": len(jobs),
        "failed_count": len(failures),
        "full_list_completed": full_list_completed,
        "failures": failures,
        "jobs": jobs,
    }


def main():
    parser = argparse.ArgumentParser(description="서울시 일자리포털 강소기업 채용정보 크롤러")
    parser.add_argument("--limit", type=int, default=None, help="테스트용 최대 수집 건수")
    parser.add_argument("--page-size", type=int, default=100, help="목록 페이지당 건수")
    parser.add_argument("--out", type=str, default=None, help="결과 JSON 저장 경로")
    args = parser.parse_args()

    result = crawl(limit=args.limit, page_size=args.page_size)
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(payload)
        print(
            f"수집 완료: {result['collected_count']}건 (실패 {result['failed_count']}건, "
            f"전체목록완주={result['full_list_completed']}) -> {args.out}",
            file=sys.stderr,
        )
    else:
        print(payload)


if __name__ == "__main__":
    main()
