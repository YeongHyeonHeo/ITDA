# 매칭 계약 v1 — AI 정규화 + 100점 규칙 점수 엔진

> **확정:** 공고와 이력서 각각에서 매칭 필드를 추출해 동일한 닫힌 사전 ID(`taxonomy_version = "v1"`)로 정규화한 뒤, **서버 규칙 엔진**으로 100점 척도(직무 20 + 기술·역량 40 + 경험·프로젝트 25 + 경력조건 15)를 계산한다. **AI는 점수를 직접 생성하지 않는다.**
> - **타입·사전 정본:** [matching.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/matching.ts), [taxonomy.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/taxonomy.ts)
> - **가상 예시:** [fixtures.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/fixtures.ts) (`77.5점` 예시)
> - **상태:** 점수 엔진과 이력서 AI 호출 모듈은 아직 미구현이다. 변경 시 `algorithm_version` 또는 `taxonomy_version`을 올린다.

---

## 1. 전체 매칭 구조: 왜 표현이 달라도 교집합이 성립하는가

공고 원문과 청년 이력서는 문장 표현이 제각각이므로, 문자열 직접 비교 대신 **양쪽을 동일한 닫힌 사전 ID로 먼저 매핑**한다.

```text
[공고 원문 (jobs.raw_text)]
   └─► AI + 사전(v1) + 스키마/원문 evidence 검증 ─► jobs.matching_json (JobMatchingJson) + job_post_categories

[청년 이력서 PDF]
   └─► 텍스트 추출(PII 마스킹) ─► AI + 사전(v1, id+aliases) + 스키마/원문 evidence 검증 ─► resume_versions.matching_json (ResumeMatchingJson)
   └─► 프로필 희망 직무(15개 중 선택) ─► youth_categories (정본)

[서버 규칙 엔진 (100점 계산)]
   └─► 동일 id 집합 교집합 + 경력개월(M) 수치 비교 ─► match_results 캐시 & 개인별 evidence 기반 추천 이유 생성
```

### 1.1 공고·이력서 공통 사전 (`taxonomy_version = "v1"`)
- **직무 카테고리 (15개)**: [matching.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/matching.ts)의 `CATEGORY_IDS` (`management_hr`, `accounting_finance`, `marketing_pr`, `sales_customer`, `product_md`, `it_data`, `design`, `rnd_engineering`, `production_quality`, `procurement_logistics_trade`, `construction_civil_env`, `medical_health`, `education`, `media_content`, `other`).
  - 청년의 희망 직무(관심직무)는 회원가입/프로필(`youth_categories`, **1~3개 선택**)이 정본이며 이력서 AI가 추론하거나 덮어쓰지 않는다.
- **스킬·역량 (32개) / 경험·프로젝트 유형 (12개)**: [taxonomy.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/taxonomy.ts)의 `SKILL_TAXONOMY`, `EXPERIENCE_TAXONOMY`.
  - 각 항목은 표준 `id`, 화면 표시 `label`, 동의어·표현 예시 `aliases`를 가진다.
  - 이력서/공고 AI에게 `id + label + aliases`를 함께 제공해, 예를 들어 `"MS Office 능숙"`과 `"엑셀·컴활 1급"`이 모두 `office_excel`이라는 같은 `id`로 매핑되도록 한다.
  - 이력서 AI(`ResumeMatchingJson`)는 점수 계산용 `skills`, `experiences`(프로젝트·인턴·직장 경험), `career` 외에 마이페이지(`S6`) 및 기업 지원자 상세(`S5`) 표시용으로 **`education`(학력), `major`(전공), `certificates`(자격증 배열)**를 함께 추출한다.
  - v1 점수 계산에서는 문자열 유사도·fuzzy 매칭·임베딩을 사용하지 않는다.

### 1.2 `id`와 `evidence`의 역할 분리 및 서버 검증
- **`id` (점수 계산용)**: 양쪽이 공유하는 닫힌 사전 ID. 중복 ID는 집합(`Set`)으로 처리해 중복 가산하지 않는다.
- **`evidence` (근거 검증 + 개인화 추천 이유용)**: 공고 또는 지원자 이력서 원문에서 발췌한 실제 근거 문장.
  - 모든 인정 항목(`categories`, `required_skills`, `preferred_skills`, `experience_requirements`, 이력서 `skills`, `experiences`)은 `evidence`가 필수다.
  - 서버는 `evidence` 문자열이 공백 정규화 후 실제 원문에 포함되는지 검증하며, 사전에 없는 ID는 `unmapped`로 보내고 점수·추천 근거에서 제외한다.
  - 없는 정보는 `null` 또는 `[]`로 둔다. 경력란이 없다는 이유로 신입(`0개월`)으로 채우지 않으며, 나이·생년월일·주소·이름은 AI 매칭 입력에 보내지 않는다.
  - Zod 스키마·사전 ID·`evidence`·경력 최소/최대 관계 검증에 실패한 결과는 `completed`로 저장하지 않는다.

---

## 2. 100점 배점 산식 (`rules-v1-20-40-25-15`)

각 항목 점수는 소수 첫째 자리까지 반올림(`Math.round(x * 10) / 10`)한 뒤 합산한다. 총점 범위는 `0 ~ 100`이다.

### 2.1 희망 직무 — 20점
- **계산**: 청년 `desired_categories` ∩ 공고 `matching_json.categories[].id`
  - 1개 이상 일치하면 **`20점`**, 일치하지 않으면 **`0점`** (다중 선택으로 20점 초과 불가).
- **예외**: 공고 카테고리가 비어 있으면 `0점` + `needs_check: true`.

### 2.2 기술 및 역량 — 40점 (필수 30점 + 우대 10점)
- **계산**:
  $$\text{skills} = 30 \times \frac{|\text{공고 필수} \cap \text{청년 스킬}|}{|\text{공고 필수}|} + 10 \times \frac{|\text{공고 우대} \cap \text{청년 스킬}|}{|\text{공고 우대}|}$$
- **규칙**:
  - 청년 스킬 집합 = `ResumeMatchingJson.skills`의 검증된 `id` 집합.
  - 공고의 `required_skills`와 `preferred_skills`에 같은 ID가 동시에 있으면 **필수에만 포함**한다.
  - 공고의 필수 또는 우대 목록이 비어 있으면 해당 하위 항목은 `0점` + `needs_check: true`로 처리한다. 빈 항목 배점을 다른 항목에 재분배하지 않으며, 이를 미보유·탈락 확정으로 표현하지 않는다.

### 2.3 경험 및 프로젝트 — 25점
- **계산**:
  $$\text{experience} = 25 \times \frac{|\text{공고 경험요구} \cap \text{청년 경험유형 합집합}|}{|\text{공고 경험요구}|}$$
- **규칙**:
  - 공고 집합 = `matching_json.experience_requirements[].id`.
  - 청년 집합 = `ResumeMatchingJson.experiences[].competency_ids` 전체 합집합. 같은 경험 유형을 여러 프로젝트에서 수행해도 집합이므로 **1번만 인정**한다.
  - 학교·개인 프로젝트, 인턴, 직장 경험 모두 원문에 명시적 수행 근거(`evidence`)가 있으면 인정한다. 단순 기술 나열은 경험으로 변환하지 않는다.
  - 공고 `experience_requirements`가 비어 있으면 `0점` + `needs_check: true`. 이력서 경험이 비어 있으면 `0점`.

### 2.4 경력조건 — 15점
먼저 서버가 이력서에서 **검증된 경력개월 $M$**을 결정한다.
1. `career.declared_total_months`가 명시되어 있으면 그 값을 $M$으로 사용한다.
2. 없으면 `experiences` 중 `kind === "employment"` 항목들의 명시적 월 기간(`start_month ~ end_month`, 종료월 미포함, `is_current === true`면 평가월 KST 기준)의 **합집합**으로 계산한다(겹친 기간은 1회만 계산).
3. `internship` / `project` / `other`는 총 정규 경력 $M$에 합산하지 않는다.
4. 날짜 누락·상충·미래 날짜가 있으면 `M = null`(확인 필요). 명시적 무경력(`explicitly_no_experience === true`)만 `M = 0`으로 인정한다.

그다음 공고 `career` 조건과 비교한다:

| 공고 조건 / 지원자 경력 $M$ | 점수 및 처리 |
|---|---|
| 공고 **경력무관** (`accepts_new_graduate = true` & `accepts_experienced = true` & `min/max = null`) | **`15점`** (무경력/미기재 여부와 무관하게 제한 없음) |
| $M = 0$ (명시적 신입) | `accepts_new_graduate = true` → **`15점`** / `false` → **`0점`** / `null` → **`0점 + needs_check`** |
| $M > 0$, `accepts_experienced = false` | **`0점`** |
| $M > 0$, `accepts_experienced = true`, `min <= M <= max` (또는 상·하한 null) | **`15점`** |
| $M > 0$, `accepts_experienced = true`, 최소 경력 $L > 0$ 미달 ($M < L$) | **`15 × (M / L)`점** (소수 첫째 자리 반올림) |
| $M > 0$, `accepts_experienced = true`, 최대 경력 초과 ($M > \text{max}$) | **`0점`** (단, 지원 자체를 막지는 않음) |
| $M = \text{null}$ 또는 공고 경력 허용 여부 불명 | **`0점 + needs_check`** |

- 신입·경력을 모두 허용하는 공고는 $M=0$일 때 신입 경로, $M>0$일 때 경력 경로(`min/max` 적용)로 계산한다. 경력 수치는 추천 문장에 임의 추측해 넣지 않는다.

---

## 3. 결과 상태 · 정렬 · 추천 이유 · 캐시 및 스냅샷

### 3.1 결과 상태 (`MatchResult.status`)
- `completed` 상태의 공고 JSON과 이력서 JSON이 모두 있을 때만 `status = "ready"`와 숫자 `score`를 반환한다(개별 누락 필드가 있어 `0점 + needs_check`여도 `ready` 가능).
- 이력서 미등록은 `no_resume`, 처리 중은 `pending`, 추출 실패는 `failed`이며 이때 `score = null`, `breakdown = null`, `recommendable = false`, `reason = null`이다. **숫자 `0점`과 미계산 `null`을 반드시 구별한다.**

### 3.2 정렬 및 추천 기준
- **목록 정렬 (PRD v1.4 D-06, D-20)**:
  - **이력서 정제 완료 시 (`ready`)**: `score DESC` → **진행중 공고 먼저 (`is_closed ASC`)** → `deadline ASC (NULL 마지막)` → `job_id ASC`.
  - **이력서 미등록 시 (`no_resume`)**: **최신 등록일 순 (`crawled_at / posted_at DESC NULLS LAST, job_id ASC`)**.
- **화면 표시 등급 (`fit_grade`, PRD v1.4 D-05)**:
  - 화면에는 0~100점 점수 숫자를 노출하지 않고 3단계 등급으로 표시:
    - **`high` (높음)**: 60점 이상
    - **`medium` (보통)**: 40 ~ 59점
    - **`low` (낮음)**: 39점 이하
  - 점수(0~100)는 백엔드 내부 정렬 및 추천 판정(`recommendable`)에만 활용.
- **`recommendable` 조건**:
  `status === "ready"` ∧ `score >= 60` ∧ `category.score === 20` ∧ (스킬 교집합 + 경험 교집합 $\ge 1$) ∧ 진행중 검증 공고(`match_status = 'verified'`, `!is_closed`)
- **`recommended` 배열 & 추천 이유 / 일치 역량 제공**:
  - `recommendable === true`인 공고 중 상위 최대 3건만 `recommended`에 담고, **`reason` 문장은 이 TOP 3에만 생성**한다(4위 이하 및 비추천은 LLM을 호출하지 않고 `reason = null`).
  - `reason`은 서버 템플릿에 **일치한 사전 ID의 한글 라벨**과 **지원자 이력서/공고의 실제 `evidence` 문장**을 결합해 생성한다(선택적으로 LLM 문장 다듬기 가능, 근거 없는 수치/경력 추측 금지).
  - **TOP 3가 아닌 일반 공고**도 상세 화면(`S4-1`) 및 지원자 상세(`S5`)에서 LLM 호출 없이 규칙 교집합으로 계산된 `breakdown.{skills,experience}.matched_ids`(**일치 역량**)와 `missing_ids`(**추가 확인 항목**)를 그대로 제공한다.

### 3.3 캐시 및 지원 스냅샷
- **`match_results` 캐시 키**: `(youth_user_id, job_id)` 행에 `profile_version`, `job_version`, `algorithm_version`, `taxonomy_version`, `evaluated_month`(KST `YYYY-MM-01`)를 저장하고, 모두 일치할 때만 재사용한다. (마감·지원 여부는 매 요청 시 최신 상태로 재평가)
- **`applications` 스냅샷**: 지원 시점의 `applicant_snapshot`(`age`, `address`, `email`, `resume_summary`), `fit_snapshot`, `desired_categories_snapshot`, `resume_version_id`, `policy_snapshot`(`policy_rule_version`, `policy_evaluated_on`)을 `applications` 행에 고정한다. 이후 프로필·이력서·공고가 수정되어도 기존 지원 내역은 바뀌지 않는다.

---

## 4. 수용 예시 (Acceptance Cases)

1. **77.5점 예시 ([fixtures.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/fixtures.ts))**:
   - 희망 직무 일치(`it_data`) = **20점**
   - 필수 스킬(`sql_db`, `data_analysis` 2/2) + 우대 스킬(`python` 0/1) = **30 + 0 = 30점**
   - 경험 요구(`data_reporting` 1/2, `market_customer_research` 미충족) = **12.5점**
   - 명시적 신입(`M = 0`)에 신입 공고 = **15점**
   - 합계: **20 + 30 + 12.5 + 15 = 77.5점**
2. **경력 부분점수**: 최소 24개월 공고에 검증된 12개월 → `15 × (12 / 24) = 7.5점`. 최대 36개월 공고에 48개월 → `0점`.
3. **결측 처리**: 경력란 없음은 `M = null`로 `0점 + needs_check` (신입 공고에 임의 15점 부여 금지). 공고의 스킬/경험 미기재는 해당 항목 `0점 + needs_check` (재배점 금지).
4. **이력서 미등록 / AI 실패**: 점수를 `0`으로 위장하지 않고 `null`을 반환하며, 기존 저장된 PDF와 과거 지원 스냅샷을 보존한다.

> 이 점수는 채용 합격 가능성이나 정책 수급 확률이 아니며, 공고·이력서에 명시된 근거의 일치도를 보여주는 MVP 규칙이다.
