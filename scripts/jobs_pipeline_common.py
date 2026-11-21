#!/usr/bin/env python3
"""채용공고 파이프라인 공용 모듈 (적재 Load · 정제 Refine 공통).

- Supabase PostgREST REST 접근 (stdlib urllib, 무의존성)
- .env.local 로더, 날짜/상태 파생, 회사 매칭, taxonomy 로더, LLM 정제 호출
- 규칙 기반 추출/검증(extract_matching_json / validate_matching_json)은
  build_initial_seed_sql.py 를 단일 출처로 재사용한다.
"""
import json
import os
import re
import urllib.parse
import urllib.request
from typing import Dict, List, Optional, Tuple

# 규칙 로직은 초기 seed 생성기와 동일한 것을 재사용 (단일 출처)
from build_initial_seed_sql import (  # noqa: E402
    norm_name, extract_gu, road_key, work_in_seoul, employment_kind, fix_url,
    extract_matching_json, validate_matching_json, NON_SEOUL, DETAIL_URL,
)

TAXONOMY_VERSION = "v1"
CATEGORY_IDS = [
    "management_hr", "accounting_finance", "marketing_pr", "sales_customer", "product_md",
    "it_data", "design", "rnd_engineering", "production_quality", "procurement_logistics_trade",
    "construction_civil_env", "medical_health", "education", "media_content", "other",
]


# ---------------------------------------------------------------------------
# 환경 / REST
# ---------------------------------------------------------------------------
def load_env(path: str = ".env.local") -> Dict[str, str]:
    env = dict(os.environ)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                env.setdefault(k.strip(), v.strip())  # 실제 환경변수 우선(CI secrets)
    return env


class SupabaseRest:
    """PostgREST 최소 클라이언트 (service_role 키 사용)."""

    def __init__(self, env: Dict[str, str]):
        self.base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/") + "/rest/v1/"
        key = env.get("SUPABASE_SECRET_KEY")
        if not key:
            raise RuntimeError("SUPABASE_SECRET_KEY 가 없습니다 (.env.local 확인)")
        self.headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def _req(self, method: str, path: str, params=None, body=None, prefer=None, timeout=30):
        url = self.base + path
        if params:
            url += "?" + urllib.parse.urlencode(params)
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw.strip() else None

    def select(self, table: str, params: dict) -> List[dict]:
        return self._req("GET", table, params=params) or []

    def insert(self, table: str, row: dict) -> List[dict]:
        return self._req("POST", table, body=row, prefer="return=representation")

    def update(self, table: str, params: dict, patch: dict) -> List[dict]:
        return self._req("PATCH", table, params=params, body=patch, prefer="return=representation")

    def delete(self, table: str, params: dict) -> None:
        self._req("DELETE", table, params=params, prefer="return=minimal")


# ---------------------------------------------------------------------------
# 날짜 / 상태 파생
# ---------------------------------------------------------------------------
_DATE_RE = re.compile(r"(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})")


def parse_date(s: Optional[str]) -> Optional[str]:
    """느슨한 YYYY-MM-DD 파싱. '채용시까지'/상시/빈값 -> None."""
    if not s:
        return None
    m = _DATE_RE.search(s)
    if not m:
        return None
    y, mo, d = m.group(1), int(m.group(2)), int(m.group(3))
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return None
    return f"{y}-{mo:02d}-{d:02d}"


def derive_status_deadline(job: dict) -> Tuple[str, Optional[str], Optional[str]]:
    """크롤 1건 -> (status, posted_at, deadline).

    - status: 목록 list_status '진행중' -> open, 그 외(종료) -> closed
    - posted_at: 상세 start 또는 list_period 앞 날짜
    - deadline: 상세 end 또는 list_period 뒤 날짜('채용시까지'면 None=상시)
    """
    status = "open" if (job.get("list_status") or "").strip() == "진행중" else "closed"
    posted_at = parse_date(job.get("start"))
    deadline = parse_date(job.get("end"))
    period = job.get("list_period") or ""
    if not posted_at or deadline is None:
        parts = re.split(r"~", period)
        if not posted_at and parts:
            posted_at = parse_date(parts[0])
        if deadline is None and len(parts) > 1:
            deadline = parse_date(parts[1])  # '채용시까지' 등은 None 유지(상시)
    return status, posted_at, deadline


# ---------------------------------------------------------------------------
# 회사 매칭 (build_initial_seed_sql.main 과 동일 규칙)
# ---------------------------------------------------------------------------
def build_company_index(sb: SupabaseRest) -> Tuple[dict, dict]:
    companies, by_name, by_road = [], {}, {}
    # 페이지네이션 (PostgREST 기본 1000건 제한 대비)
    offset, page = 0, 1000
    while True:
        rows = sb.select("companies", {
            "select": "id,name_norm,former_name_norm,gu,road_address",
            "order": "id",
            "limit": str(page), "offset": str(offset),
        })
        companies.extend(rows)
        if len(rows) < page:
            break
        offset += page
    for c in companies:
        rk = road_key(c.get("road_address"))
        if rk:
            by_road.setdefault(rk, []).append(c)
        for nk in (c.get("name_norm"), c.get("former_name_norm")):
            if nk:
                by_name.setdefault(nk, []).append(c)
    return by_name, by_road


def resolve_company(job: dict, by_name: dict, by_road: dict) -> Tuple[Optional[str], str, Optional[str]]:
    """(company_id, match_status, method) 반환. name_only 는 verified 가 아닌 review."""
    match_gu = extract_gu(job.get("company_address")) or extract_gu(job.get("work_address")) or (job.get("list_gu") or None)
    cands = by_name.get(norm_name(job.get("company")), [])
    hit = next((c for c in cands if c.get("gu") == match_gu), None)
    method = "name_gu" if hit else None
    if not hit:
        by_addr = by_road.get(road_key(job.get("company_address")) or ("", "", ""), [])
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
    return (company["id"] if company else None), match_status, method


def work_gu_of(job: dict) -> Optional[str]:
    work_gu = extract_gu(job.get("work_address")) or (job.get("list_gu") or None)
    in_seoul = work_in_seoul(job.get("work_address"))
    if in_seoul is None and NON_SEOUL.search(job.get("position") or ""):
        in_seoul = False
    return None if in_seoul is False else work_gu


# ---------------------------------------------------------------------------
# taxonomy 로더 (src/contracts/taxonomy.ts 단일 출처 파싱)
# ---------------------------------------------------------------------------
_TAX_ITEM_RE = re.compile(
    r'\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*aliases:\s*\[([^\]]*)\]\s*\}'
)


def _parse_block(ts: str, const_name: str) -> List[dict]:
    start = ts.find(f"export const {const_name}")
    if start == -1:
        return []
    end = ts.find("] as const", start)
    block = ts[start:end if end != -1 else len(ts)]
    items = []
    for m in _TAX_ITEM_RE.finditer(block):
        aliases = re.findall(r'"([^"]*)"', m.group(3))
        items.append({"id": m.group(1), "label": m.group(2), "aliases": aliases})
    return items


def load_taxonomy(ts_path: str = "src/contracts/taxonomy.ts") -> dict:
    with open(ts_path, encoding="utf-8") as f:
        ts = f.read()
    skills = _parse_block(ts, "SKILL_TAXONOMY")
    exps = _parse_block(ts, "EXPERIENCE_TAXONOMY")
    if not skills or not exps:
        raise RuntimeError("taxonomy.ts 파싱 실패 (구조 변경 확인)")
    return {
        "skills": skills, "experiences": exps, "categories": CATEGORY_IDS,
        "skill_ids": {s["id"] for s in skills}, "experience_ids": {e["id"] for e in exps},
    }


# ---------------------------------------------------------------------------
# LLM 정제 (OpenAI Chat Completions, stdlib urllib)
# ---------------------------------------------------------------------------
def _openai_chat(env: Dict[str, str], model: str, system: str, user: str, timeout=90) -> str:
    key = env.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY 가 없습니다 (--engine rules 로 실행 가능)")
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0,
        "response_format": {"type": "json_object"},
    }
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload["choices"][0]["message"]["content"]


def _taxonomy_prompt_block(tax: dict) -> str:
    def fmt(items):
        return "\n".join(f'- {it["id"]}: {it["label"]} (예: {", ".join(it["aliases"][:6])})' for it in items)
    return (
        "직무 카테고리 ID (categories 에 사용):\n" + ", ".join(tax["categories"]) + "\n\n"
        "스킬 ID (required_skills/preferred_skills 에 사용):\n" + fmt(tax["skills"]) + "\n\n"
        "경험유형 ID (experience_requirements 에 사용):\n" + fmt(tax["experiences"])
    )


def llm_extract_matching_json(raw_text: str, tax: dict, env: Dict[str, str], model: str) -> dict:
    system = (
        "너는 채용공고 원문에서 매칭 필드를 추출해 고정 사전 ID로 정규화하는 도구다. "
        "점수를 매기지 말고, 아래 닫힌 사전의 id 만 사용한다. "
        "모든 인정 항목에는 반드시 원문(raw_text)에서 '그대로 발췌'한 evidence 문장을 넣는다. "
        "원문에 근거가 없으면 추론하지 말고 빈 배열로 둔다. 나이/생년월일/주소/이름은 추출하지 않는다."
    )
    schema = (
        '{"schema_version":"matching-v1","taxonomy_version":"v1",'
        '"categories":[{"id":"<categoryId>","evidence":"<원문발췌>"}],'
        '"required_skills":[{"id":"<skillId>","evidence":"<원문발췌>"}],'
        '"preferred_skills":[{"id":"<skillId>","evidence":"<원문발췌>"}],'
        '"experience_requirements":[{"id":"<experienceId>","evidence":"<원문발췌>"}],'
        '"career":{"accepts_new_graduate":<bool|null>,"accepts_experienced":<bool|null>,'
        '"min_months":<int|null>,"max_months":<int|null>,"evidence":"<원문발췌|null>"},'
        '"unmapped":[]}'
    )
    user = (
        f"{_taxonomy_prompt_block(tax)}\n\n"
        f"[출력 JSON 스키마]\n{schema}\n\n"
        f"[공고 원문 raw_text]\n{raw_text}"
    )
    content = _openai_chat(env, model, system, user)
    return json.loads(content)


# ---------------------------------------------------------------------------
# 정제 결과 정규화·검증 (사전 밖 id/근거 없는 evidence 제거)
# ---------------------------------------------------------------------------
def sanitize_matching_json(mj: dict, raw_text: str, tax: dict) -> dict:
    norm_raw = " ".join(raw_text.split())
    unmapped = list(mj.get("unmapped") or [])

    def keep(items, id_set):
        out = []
        for it in items or []:
            _id, ev = it.get("id"), (it.get("evidence") or "")
            ev_norm = " ".join(ev.split())
            if _id in id_set and ev_norm and ev_norm in norm_raw:
                out.append({"id": _id, "evidence": ev})
            elif _id or ev:
                unmapped.append({"raw": str(_id or ""), "evidence": ev})
        return out

    skill_ids, exp_ids = tax["skill_ids"], tax["experience_ids"]
    cat_ids = set(tax["categories"])

    categories = keep(mj.get("categories"), cat_ids)
    required = keep(mj.get("required_skills"), skill_ids)
    preferred_raw = keep(mj.get("preferred_skills"), skill_ids)
    # 동일 id 가 필수·우대 중복이면 필수 우선 (matching-spec 2.2)
    req_set = {x["id"] for x in required}
    preferred = [x for x in preferred_raw if x["id"] not in req_set]
    experiences = keep(mj.get("experience_requirements"), exp_ids)

    career = mj.get("career") or {}
    mn, mx = career.get("min_months"), career.get("max_months")
    if isinstance(mn, int) and isinstance(mx, int) and mn > mx:
        mn = mx = None
    cev = career.get("evidence")
    if cev and " ".join(str(cev).split()) not in norm_raw:
        cev = None

    cleaned = {
        "schema_version": "matching-v1", "taxonomy_version": TAXONOMY_VERSION,
        "categories": categories, "required_skills": required, "preferred_skills": preferred,
        "experience_requirements": experiences,
        "career": {
            "accepts_new_graduate": career.get("accepts_new_graduate"),
            "accepts_experienced": career.get("accepts_experienced"),
            "min_months": mn, "max_months": mx, "evidence": cev,
        },
        "unmapped": unmapped,
    }
    validate_matching_json(cleaned, raw_text)  # evidence 원문 포함 최종 확인
    return cleaned
