#!/usr/bin/env python3
"""초기 DB 적재용 SQL 생성기 (companies 256건 + jobs 81건 + A안 JobMatchingJson + job_post_categories).

사용법:
  python3 scripts/build_initial_seed_sql.py \
    --companies gangso-matching-share/data-companies.json \
    --jobs /tmp/crawled-all.json \
    --out-dir supabase/seed
"""

import argparse
import hashlib
import json
import os
import re
from collections import Counter
from typing import Dict, List, Optional, Tuple

SUFFIX = re.compile(r"\(주\)|（주）|㈜|주식회사|\(유\)|유한회사|\(사\)|사단법인")
NON_SEOUL = re.compile(
    r"인천|경기|하남|성남|수원|부천|고양|용인|김포|부산|대구|대전|광주광역|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주"
)
DETAIL_URL = "https://job.seoul.go.kr/hmpg/bcop/hrmg/hrmgDetail.do"
TAXONOMY_VERSION = "v1"

# 15개 확정 직무 카테고리 (src/contracts/matching.ts 와 동일)
CATEGORY_RULES: List[Tuple[str, List[str]]] = [
    ("it_data", [r"(?:웹|앱|서버|백엔드|프론트엔드|소프트웨어|SW|플랫폼|임베디드|AI|풀스택)\s*개발", r"개발자", r"데이터", r"인공지능", r"\bIT\b", r"인프라", r"네트워크", r"보안", r"클라우드", r"Python", r"Java", r"SQL", r"Linux", r"정보통신"]),
    ("design", [r"디자인", r"디자이너", r"UI", r"UX", r"피그마", r"포토샵", r"일러스트", r"영상편집", r"그래픽", r"콘텐츠\s*디자인"]),
    ("marketing_pr", [r"마케팅", r"마케터", r"홍보", r"PR", r"캠페인", r"AE", r"광고", r"퍼포먼스", r"브랜드", r"SNS", r"인플루언서"]),
    ("sales_customer", [r"영업", r"세일즈", r"해외영업", r"B2B", r"B2C", r"고객", r"CS", r"상담", r"매장", r"판매", r"리테일"]),
    ("accounting_finance", [r"회계", r"재무", r"세무", r"자금", r"경리", r"자산평가", r"채권", r"주식", r"파생", r"금융", r"투자", r"CFA", r"CPA"]),
    ("management_hr", [r"경영", r"기획", r"인사", r"HR", r"총무", r"관리", r"PM", r"PO", r"서비스\s*기획", r"사업\s*기획", r"사무", r"행정", r"전략"]),
    ("product_md", [r"MD", r"상품기획", r"소싱", r"바이어", r"이커머스", r"머천다이징", r"전자상거래"]),
    ("rnd_engineering", [r"연구", r"R&D", r"설계", r"기구", r"전자(?!상거래)", r"회로", r"하드웨어", r"제품개발", r"펌웨어", r"바이오", r"화학"]),
    ("production_quality", [r"생산", r"품질", r"QA", r"QC", r"제조", r"공정", r"검사", r"8D", r"ISO"]),
    ("procurement_logistics_trade", [r"구매", r"물류", r"무역", r"수출", r"수입", r"통관", r"자재", r"SCM", r"유통"]),
    ("construction_civil_env", [r"건축", r"토목", r"환경", r"시공", r"현장", r"안전", r"설비", r"CAD"]),
    ("medical_health", [r"의료", r"보건", r"간호", r"임상", r"제약", r"병원", r"헬스케어"]),
    ("education", [r"교육", r"강사", r"교수", r"교재", r"튜터", r"커리큘럼"]),
    ("media_content", [r"미디어", r"콘텐츠", r"PD", r"작가", r"편집", r"촬영", r"유튜브", r"출판", r"기자"]),
]

# 닫힌 스킬 사전 (src/contracts/taxonomy.ts v1 — 32개)
SKILL_RULES: List[Tuple[str, List[str]]] = [
    ("python", [r"\bPython\b", r"파이썬", r"\bVBA\b"]),
    ("javascript_ts", [r"\bJavaScript\b", r"\bTypeScript\b", r"\bReact\b", r"\bNode\.?js\b", r"\bHTML5?\b", r"\bCSS\b", r"\bWebGL\b", r"Cesium\.js"]),
    ("java_spring", [r"\bJava\b", r"\bSpring\b"]),
    ("csharp_dotnet", [r"C#", r"\.NET", r"DevExpress"]),
    ("sql_db", [r"\bSQL\b", r"Oracle", r"MySQL", r"PostgreSQL", r"데이터베이스"]),
    ("ai_ml", [r"\bML\b", r"\bDL\b", r"\bLLM\b", r"PyTorch", r"TensorFlow", r"머신러닝", r"딥러닝"]),
    ("data_analysis", [r"데이터\s*분석", r"통계", r"대용량\s*데이터", r"시각화", r"대시보드"]),
    ("cloud_infra", [r"\bAWS\b", r"\bGCP\b", r"\bAzure\b", r"VMware", r"가상화", r"네트워크", r"서버\s*인프라"]),
    ("linux_os", [r"\bLinux\b", r"RHEL", r"CentOS", r"Ubuntu", r"Windows\s*Server"]),
    ("git_collab", [r"\bGit\b", r"GitHub", r"\bSVN\b", r"\bJira\b", r"\bNotion\b"]),
    ("it_cert_security", [r"정보처리기사", r"정보보안", r"\bDLP\b", r"\bDRM\b", r"\bEDMS\b", r"웹\s*접근성"]),
    ("figma_uiux", [r"\bFigma\b", r"피그마", r"\bUI\b", r"\bUX\b", r"프로토타이핑"]),
    ("adobe_design", [r"포토샵", r"일러스트", r"Photoshop", r"Illustrator", r"인디자인", r"편집디자인"]),
    ("video_content", [r"프리미어", r"애프터이펙트", r"영상편집", r"촬영", r"콘텐츠\s*제작"]),
    ("ai_creative_tools", [r"미드저니", r"Midjourney", r"AI\s*툴", r"생성형\s*AI"]),
    ("digital_marketing", [r"디지털\s*광고", r"퍼포먼스\s*마케팅", r"SNS\s*마케팅", r"인플루언서\s*마케팅", r"캠페인"]),
    ("service_planning", [r"서비스\s*기획", r"\bPM\b", r"\bPO\b", r"\bAPI\b", r"시스템\s*연동\s*기획"]),
    ("proposal_docs", [r"제안서\s*작성", r"보고서", r"발표자료", r"기획서"]),
    ("finance_quant", [r"채권", r"파생상품", r"금융공학", r"금융상품", r"자산평가", r"RCPS", r"BW", r"CB"]),
    ("finance_cert", [r"\bCFA\b", r"\bCPA\b", r"\bFRM\b", r"투자자산운용사", r"회계\s*관련\s*자격증", r"전산회계", r"금융자격증"]),
    ("accounting_tax", [r"회계", r"재무", r"세무", r"자금", r"결산"]),
    ("b2b_sales", [r"\bB2B\b", r"솔루션\s*영업", r"해외영업", r"영업지원", r"바이어"]),
    ("trade_logistics", [r"수출입", r"통관", r"수입신고", r"글로벌\s*유통", r"물류", r"\bSCM\b"]),
    ("quality_qa_qc", [r"\bQA\b", r"\bQC\b", r"\b8D\b", r"정밀검사", r"품질검사", r"품질관리", r"\bISO\b"]),
    ("cad_engineering", [r"\bCAD\b", r"AutoCAD", r"SolidWorks", r"3D\s*설계", r"기구설계"]),
    ("medical_bio", [r"간호", r"의공학", r"임상", r"바이오", r"의료기기"]),
    ("office_excel", [r"MS\s*Office", r"Excel", r"엑셀", r"컴퓨터활용능력", r"컴퓨터\s*사용능력"]),
    ("english", [r"영어", r"TOEIC", r"OPIc"]),
    ("chinese", [r"중국어", r"\bHSK\b"]),
    ("foreign_lang_other", [r"외국어\s*능통", r"일본어"]),
    ("communication", [r"커뮤니케이션", r"고객\s*응대", r"협업"]),
    ("driver_license", [r"운전면허", r"1종\s*보통", r"2종\s*보통"]),
]

# 닫힌 경험 유형 사전 (src/contracts/taxonomy.ts v1 — 12개)
EXPERIENCE_RULES: List[Tuple[str, List[str]]] = [
    ("product_development", [r"개발\s*경험", r"개발\s*및\s*배포", r"가시화\s*개발", r"시스템\s*개발", r"제품\s*개발"]),
    ("data_reporting", [r"대시보드", r"데이터\s*처리\s*솔루션", r"평가모형", r"통계\s*리포트", r"데이터\s*분석"]),
    ("service_planning_exp", [r"API\s*기반\s*서비스\s*기획", r"연동\s*기획\s*경험", r"서비스기획부터"]),
    ("design_portfolio", [r"편집디자인", r"디자인\s*포트폴리오", r"브랜드\s*디자인", r"콘텐츠\s*제작"]),
    ("marketing_campaign", [r"디지털광고\s*실무경험", r"캠페인\s*운영", r"마케팅\s*에이전시", r"광고대행사\s*경력"]),
    ("market_customer_research", [r"고객\s*리서치", r"고객\s*인터뷰", r"설문조사", r"시장조사"]),
    ("sales_client_ops", [r"영업\s*경험", r"영업\s*경력", r"해외영업", r"콜\s*업무"]),
    ("finance_valuation_exp", [r"금융기관\s*경력", r"금융기관\s*근무", r"채권평가사", r"증권사", r"운용사"]),
    ("infra_system_ops", [r"모니터링\s*시스템\s*구축", r"인프라.*운영\s*경험", r"가상화\s*환경"]),
    ("quality_inspection_exp", [r"정밀검사\s*경험", r"8D\s*작성\s*경험", r"수입신고"]),
    ("trade_logistics_exp", [r"글로벌\s*이커머스", r"글로벌\s*인허가", r"유통,?\s*물류"]),
    ("rnd_project_lead", [r"정부\s*과제\s*수행", r"기업부설연구소", r"프로젝트\s*PL", r"조직\s*리딩"]),
]


def norm_name(n: Optional[str]) -> str:
    return re.sub(r"[^0-9a-zA-Z가-힣]", "", SUFFIX.sub("", n or "")).lower()


def extract_gu(addr: Optional[str]) -> Optional[str]:
    m = re.search(r"(?:서울특별시|서울시|서울)\s*([가-힣]+구)", addr or "")
    return m.group(1) if m else None


def road_key(addr: Optional[str]) -> Optional[Tuple[str, str, str]]:
    m = re.search(
        r"([가-힣]+구)\s*([가-힣A-Za-z0-9]+(?:로|길))\s*(\d+(?:-\d+)?)",
        (addr or "").replace(" 번길", "번길"),
    )
    return (m.group(1), m.group(2), m.group(3)) if m else None


def work_in_seoul(addr: Optional[str]) -> Optional[bool]:
    if not addr or not addr.strip(" .") or re.fullmatch(r"[\d~\-호층, ]+", addr.strip()):
        return None
    if extract_gu(addr):
        return True
    return False if NON_SEOUL.search(addr) else None


def employment_kind(raw: Optional[str]) -> str:
    s = re.sub(r"\s", "", raw or "")
    if not s:
        return "unknown"
    if re.search(r"전환|인턴후정규|계약후정규", s):
        return "conversion"
    if "/" in s and re.search(r"정규", s) and re.search(r"계약|인턴|무관|파견|기간제", s):
        return "unknown"
    if re.search(r"수습", s) and re.search(r"정규|정함이없", s):
        return "probation"
    if "비정규" in s:
        return "non_regular"
    if re.search(r"정함이없|정규직|^정규", s):
        return "regular"
    if re.search(r"계약|정함이있|기간제|인턴|파견|일용|시간제|아르바이트|프리랜서|위촉|촉탁", s):
        return "non_regular"
    return "unknown"


def fix_url(u: Optional[str]) -> Optional[str]:
    u = (u or "").strip()
    if not u or u in {"-", "."}:
        return None
    u = re.sub(r"^(https?)//", r"\1://", u, flags=re.I)
    return u if re.match(r"^https?://", u, re.I) else "https://" + u


def sql_val(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, list):
        return "array[" + ", ".join(sql_val(x) for x in v) + "]::text[]" if v else "'{}'::text[]"
    if isinstance(v, dict):
        return "'" + json.dumps(v, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    return "'" + str(v).replace("'", "''") + "'"


def find_evidence_snippet(text: str, pattern: str) -> Optional[str]:
    m = re.search(pattern, text, re.I)
    if not m:
        return None
    # 매칭된 줄 전체(최대 120자)를 evidence로 반환해 원문 포함 검증 보장
    start = text.rfind("\n", 0, m.start()) + 1
    end = text.find("\n", m.end())
    if end == -1:
        end = len(text)
    line = text[start:end].strip()
    if len(line) <= 120:
        return line
    s = max(start, m.start() - 30)
    e = min(end, m.end() + 50)
    return text[s:e].strip()


def extract_career(raw_text: str, career_raw: str) -> dict:
    c = (career_raw or "").strip()
    accepts_new = None
    accepts_exp = None
    if c == "무관":
        accepts_new, accepts_exp = True, True
    elif c == "신입":
        accepts_new, accepts_exp = True, False
    elif c == "경력":
        accepts_new, accepts_exp = False, True
    elif c == "신입 및 경력":
        accepts_new, accepts_exp = True, True

    min_months, max_months = None, None
    ev_parts = []
    if c:
        ev = find_evidence_snippet(raw_text, re.escape(c))
        if ev:
            ev_parts.append(ev)

    # 예: "경력 3~6년", "경력 5년 이상", "3년~5년"
    m_range = re.search(r"(\d+)\s*[~\-]\s*(\d+)\s*년", raw_text)
    m_min = re.search(r"(\d+)\s*년\s*이상", raw_text)
    if m_range:
        y1, y2 = int(m_range.group(1)), int(m_range.group(2))
        if y1 <= y2:
            min_months, max_months = y1 * 12, y2 * 12
        ev = find_evidence_snippet(raw_text, re.escape(m_range.group(0)))
        if ev and ev not in ev_parts:
            ev_parts.append(ev)
    elif m_min:
        min_months = int(m_min.group(1)) * 12
        ev = find_evidence_snippet(raw_text, re.escape(m_min.group(0)))
        if ev and ev not in ev_parts:
            ev_parts.append(ev)

    return {
        "accepts_new_graduate": accepts_new,
        "accepts_experienced": accepts_exp,
        "min_months": min_months,
        "max_months": max_months,
        "evidence": ev_parts[0] if ev_parts else None,
    }


def extract_matching_json(job: dict, raw_text: str) -> dict:
    # 1. 직무 카테고리 (15개 중 원문 근거 기반 매칭, 없으면 other)
    categories = []
    search_text = "\n".join(filter(None, [
        job.get("title"),
        job.get("position"),
        job.get("preferred"),
        job.get("industry"),
    ]))
    for cat_id, patterns in CATEGORY_RULES:
        for pat in patterns:
            ev = find_evidence_snippet(raw_text, pat)
            if ev and re.search(pat, search_text, re.I):
                categories.append({"id": cat_id, "evidence": ev})
                break
    if not categories:
        fallback_ev = find_evidence_snippet(raw_text, re.escape(job.get("title") or job.get("position") or "")) or raw_text[:80]
        categories.append({"id": "other", "evidence": fallback_ev})

    # 2. 기술·역량 (preferred 텍스트에서 추출되는 항목은 preferred_skills, 제목/모집분야에 명시된 필수 기술은 required_skills)
    req_source = "\n".join(filter(None, [job.get("title"), job.get("position")]))
    pref_source = job.get("preferred") or ""

    required_skills = []
    preferred_skills = []
    seen_skills = set()

    for skill_id, patterns in SKILL_RULES:
        for pat in patterns:
            if re.search(pat, req_source, re.I):
                ev = find_evidence_snippet(raw_text, pat)
                if ev:
                    required_skills.append({"id": skill_id, "evidence": ev})
                    seen_skills.add(skill_id)
                    break
        if skill_id in seen_skills:
            continue
        for pat in patterns:
            if re.search(pat, pref_source, re.I):
                ev = find_evidence_snippet(raw_text, pat)
                if ev:
                    preferred_skills.append({"id": skill_id, "evidence": ev})
                    seen_skills.add(skill_id)
                    break

    # 3. 경험 요구 유형
    experience_requirements = []
    for exp_id, patterns in EXPERIENCE_RULES:
        for pat in patterns:
            ev = find_evidence_snippet(raw_text, pat)
            if ev:
                experience_requirements.append({"id": exp_id, "evidence": ev})
                break

    # 4. 경력 조건
    career = extract_career(raw_text, job.get("career") or "")

    return {
        "schema_version": "matching-v1",
        "taxonomy_version": TAXONOMY_VERSION,
        "categories": categories,
        "required_skills": required_skills,
        "preferred_skills": preferred_skills,
        "experience_requirements": experience_requirements,
        "career": career,
        "unmapped": [],
    }


def validate_matching_json(mj: dict, raw_text: str) -> None:
    norm_raw = " ".join(raw_text.split())
    for item in mj["categories"] + mj["required_skills"] + mj["preferred_skills"] + mj["experience_requirements"]:
        ev = " ".join(item["evidence"].split())
        assert ev in norm_raw, f"evidence not in raw_text: {ev}"
    c = mj["career"]
    if c["min_months"] is not None and c["max_months"] is not None:
        assert c["min_months"] <= c["max_months"], "min_months > max_months"


def main():
    parser = argparse.ArgumentParser(description="초기 DB 적재용 SQL 생성")
    parser.add_argument("--companies", required=True)
    parser.add_argument("--jobs", required=True)
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    companies = json.load(open(args.companies, encoding="utf-8"))
    raw_jobs = json.load(open(args.jobs, encoding="utf-8"))

    # 1) 01_seed_companies.sql
    comp_path = os.path.join(args.out_dir, "01_seed_companies.sql")
    comp_cols = [
        "name", "name_norm", "former_name", "former_name_norm",
        "biz_type_code", "business_desc", "homepage",
        "zip_code", "road_address", "address_detail", "gu",
        "source", "source_downloaded_at", "is_demo",
    ]
    with open(comp_path, "w", encoding="utf-8") as f:
        f.write(f"-- 서울형 강소기업 {len(companies)}개사 초기 적재\nbegin;\n\n")
        for c in companies:
            vals = [
                sql_val(c.get("name")),
                sql_val(c.get("name_norm")),
                sql_val(c.get("former_name")),
                sql_val(c.get("former_name_norm")),
                sql_val(c.get("biz_type_code")),
                sql_val(c.get("business_desc")),
                sql_val(c.get("homepage")),
                sql_val(c.get("zip_code")),
                sql_val(c.get("road_address")),
                sql_val(c.get("address_detail")),
                sql_val(c.get("gu")),
                sql_val(c.get("source") or "data.seoul.go.kr/OA-23042"),
                (sql_val(c.get("source_downloaded_at")) + "::date") if c.get("source_downloaded_at") else "null",
                sql_val(bool(c.get("is_demo", False))),
            ]
            updates = ", ".join(f"{col} = excluded.{col}" for col in comp_cols if col not in ("name_norm", "gu"))
            f.write(
                f"insert into public.companies ({', '.join(comp_cols)})\n"
                f"values ({', '.join(vals)})\n"
                f"on conflict (name_norm, coalesce(gu, '')) do update set {updates}, updated_at = now();\n\n"
            )
        f.write("commit;\n")

    # 기업 매칭 인덱스 구성
    by_road: Dict[Tuple[str, str, str], List[dict]] = {}
    by_name: Dict[str, List[dict]] = {}
    for c in companies:
        rk = road_key(c.get("road_address"))
        if rk:
            by_road.setdefault(rk, []).append(c)
        for nk in (c.get("name_norm"), c.get("former_name_norm")):
            if nk:
                by_name.setdefault(nk, []).append(c)

    # 2) 02_seed_jobs_and_matching.sql
    jobs_path = os.path.join(args.out_dir, "02_seed_jobs_and_matching.sql")
    job_cols = [
        "company_id", "match_status", "match_method", "source", "source_job_id",
        "company_name", "title", "position_raw", "preferred",
        "employment_type_raw", "employment_kind",
        "career_req", "education_req", "salary", "work_address", "work_gu",
        "holiday_type", "posted_at", "deadline", "status",
        "headcount", "work_hours", "selection_process", "documents", "notes", "benefits",
        "industry", "company_homepage",
        "raw_text", "content_hash", "crawled_at",
        "matching_json", "extraction_status", "job_version",
    ]

    status_counter = Counter()
    cat_counter = Counter()
    crawled_at = raw_jobs.get("extracted_at")

    with open(jobs_path, "w", encoding="utf-8") as f:
        f.write(f"-- 서울형 강소기업 채용공고 {len(raw_jobs['jobs'])}건 + A안 JobMatchingJson 초기 적재\nbegin;\n\n")
        for r in raw_jobs["jobs"]:
            work_gu = extract_gu(r.get("work_address")) or (r.get("list_gu") or None)
            in_seoul = work_in_seoul(r.get("work_address"))
            if in_seoul is None and NON_SEOUL.search(r.get("position") or ""):
                in_seoul = False
            if in_seoul is False:
                work_gu = None

            match_gu = extract_gu(r.get("company_address")) or extract_gu(r.get("work_address")) or (r.get("list_gu") or None)
            cands = by_name.get(norm_name(r.get("company")), [])
            hit = next((c for c in cands if c.get("gu") == match_gu), None)
            method = "name_gu" if hit else None
            if not hit:
                by_addr = by_road.get(road_key(r.get("company_address")) or ("", "", ""), [])
                if len(by_addr) == 1:
                    hit, method = by_addr[0], "address"
            if not hit and len(cands) == 1:
                hit, method = cands[0], "name_only"

            if method in ("name_gu", "address"):
                match_status = "verified"
            elif method == "name_only" or cands:
                match_status = "review"
            else:
                match_status = "none"

            company = hit or (cands[0] if cands else None)
            status_counter[match_status] += 1

            raw_text = r.get("_raw_text") or "\n".join(
                f"[{lbl}] {val}"
                for lbl, val in [
                    ("제목", r.get("title")),
                    ("모집분야", r.get("position")),
                    ("경력조건", r.get("career")),
                    ("학력조건", r.get("education")),
                    ("고용형태", r.get("employment_type")),
                    ("우대사항", r.get("preferred")),
                    ("업종", r.get("industry")),
                    ("근무·유의사항", r.get("notes")),
                ]
                if val
            )
            content_hash = r.get("_content_hash") or hashlib.sha256(raw_text.encode("utf-8")).hexdigest()
            matching_json = extract_matching_json(r, raw_text)
            validate_matching_json(matching_json, raw_text)

            for c_item in matching_json["categories"]:
                cat_counter[c_item["id"]] += 1

            headcount_digits = re.sub(r"\D", "", r.get("headcount") or "")
            headcount = int(headcount_digits) if headcount_digits and headcount_digits != "0" else None
            benefits = " / ".join(x for x in (r.get("benefit_pay"), r.get("benefit_growth"), r.get("benefit_life")) if x)

            company_subquery = (
                f"(select id from public.companies where name_norm = {sql_val(company['name_norm'])} "
                f"and coalesce(gu, '') = {sql_val(company.get('gu') or '')} limit 1)"
                if company else "null"
            )

            vals = [
                company_subquery,
                sql_val(match_status),
                sql_val(method),
                sql_val(f"{DETAIL_URL}?hidcmp_recmnt_no={r['post_id']}"),
                sql_val(r["post_id"]),
                sql_val(r["company"]),
                sql_val(r["title"]),
                sql_val(r.get("position")),
                sql_val(r.get("preferred")),
                sql_val(r.get("employment_type")),
                sql_val(employment_kind(r.get("employment_type"))),
                sql_val(r.get("career")),
                sql_val(r.get("education")),
                sql_val(r.get("salary")),
                sql_val(r.get("work_address")),
                sql_val(work_gu),
                sql_val(r.get("work_type")),
                (sql_val(r.get("start")) + "::date") if r.get("start") else "null",
                (sql_val(r.get("end")) + "::date") if r.get("end") else "null",
                sql_val("open" if r.get("list_status") == "진행중" else "closed"),
                sql_val(headcount),
                sql_val(r.get("work_hours")),
                sql_val(r.get("process")),
                sql_val(r.get("documents")),
                sql_val(r.get("notes")),
                sql_val(benefits),
                sql_val(r.get("industry")),
                sql_val(fix_url(r.get("homepage"))),
                sql_val(raw_text),
                sql_val(content_hash),
                (sql_val(crawled_at) + "::timestamptz") if crawled_at else "now()",
                sql_val(matching_json),
                sql_val("completed"),
                sql_val(1),
            ]
            assert len(job_cols) == len(vals), f"Column/value mismatch: {len(job_cols)} != {len(vals)}"
            # ON CONFLICT 재실행 시 AI 정제 결과·버전 라이프사이클을 보존한다 (docs/crawling-plan.md §3-2, §4).
            # 최초 INSERT 는 values 로 matching_json/extraction_status/job_version 을 그대로 세팅하고,
            # 재적재(conflict)에서는 아래 컬럼을 덮어쓰지 않아 정제 단계 결과와 job_version 증가분을 지킨다.
            preserve_on_conflict = ("source_job_id", "matching_json", "extraction_status", "job_version")
            updates = ", ".join(
                f"{col} = excluded.{col}"
                for col in job_cols
                if col not in preserve_on_conflict
            )
            f.write(
                f"insert into public.jobs ({', '.join(job_cols)})\n"
                f"values ({', '.join(vals)})\n"
                f"on conflict (source_job_id) do update set {updates}, updated_at = now();\n\n"
            )

            # job_post_categories 동기화
            f.write(
                f"delete from public.job_post_categories where job_id = "
                f"(select id from public.jobs where source_job_id = {sql_val(r['post_id'])});\n"
            )
            for c_item in matching_json["categories"]:
                f.write(
                    f"insert into public.job_post_categories (job_id, category_slug)\n"
                    f"select id, {sql_val(c_item['id'])} from public.jobs "
                    f"where source_job_id = {sql_val(r['post_id'])}\n"
                    f"on conflict do nothing;\n"
                )
            f.write("\n")
        f.write("commit;\n")

    print(f"생성 완료: {comp_path} ({len(companies)}개사)")
    print(f"생성 완료: {jobs_path} ({len(raw_jobs['jobs'])}건, match_status={dict(status_counter)})")
    print(f"카테고리 분포: {dict(cat_counter)}")


if __name__ == "__main__":
    main()
