# 채용공고 크롤링·적재·AI 정제 파이프라인 설계

상태: **제안** (로컬 수동 실행으로 DB 적재·검증 후 GitHub Actions 자동화 이관 예정).
공유 매칭 계약은 [matching-spec.md](file:///Users/haing/Development/Seoul_Hackton/docs/matching-spec.md) 및 [matching.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/matching.ts), 스키마 초안은 [001_mvp_draft.sql](file:///Users/haing/Development/Seoul_Hackton/supabase/schema/001_mvp_draft.sql)과 [db-jobs.sql](file:///Users/haing/Development/Seoul_Hackton/gangso-matching-share/db-jobs.sql)을 기준으로 한다.

---

## 1. 대상 사이트 구조 분석 (`job.seoul.go.kr`)

서울시 일자리포털 "서울형 강소기업 채용정보" (`hrmgListPage.do` / `hrmgDetail.do`)의 실제 수집 구조([raw-gangso-jobs-all.json](file:///Users/haing/Development/Seoul_Hackton/gangso-matching-share/raw-gangso-jobs-all.json) 기준)는 다음과 같다.

### 1.1 수집 가능한 필드와 매칭 연계
- **목록 페이지 (`hrmgListPage.do`)**:
  - `post_id` (32자리 16진수 식별자 → `source_job_id`), `list_no`, `list_status` (`진행중`/`종료`), `company`, `title`, `list_salary`, `list_gu`, `list_period` (`YYYY-MM-DD ~ 채용시까지` 등).
- **상세 페이지 (`hrmgDetail.do`)**:
  - **모집·직무 영역**: `position` (모집직종/분야), `career` (신입/경력/무관), `education`, `employment_type`, `preferred` (우대사항), `notes` (유의사항/수습 등), `work_type`, `salary`, `work_hours`, `work_address`, `headcount`, `process`, `documents`, `start`, `end`, `benefit_pay`, `benefit_growth`, `benefit_life`.
  - **기업 영역**: `industry` (업종), `employees`, `company_type`, `company_address`, `homepage`.
  - **수집 제외 항목**: 대표자명, 채용담당자 이름·전화번호·이메일(`recruiter_info` 등)은 서비스에 불필요하고 개인정보 혼입 위험이 있으므로 수집 및 `raw_text` 포함 대상에서 제외한다.

### 1.2 `JobMatchingJson` 추출 관점의 보완 제안
`hrmgDetail.do` 공고는 긴 JD(담당업무·자격요건 문단) 대신 **`title`, `position`, `preferred`, `career`, `industry`, `notes`에 핵심 매칭 정보가 압축**되어 있는 경우가 많다.
1. **`raw_text` 구성**: 페이지 전체 HTML 텍스트를 넣지 않고, 매칭에 필요한 섹션만 라벨링해 조합한다.
   - 예: `[제목] {title}\n[모집분야] {position}\n[경력조건] {career}\n[우대사항] {preferred}\n[업종] {industry}\n[근무·유의사항] {notes}`
   - 실제 데이터에서 `position`에 `"디지털 캠페인 AE (경력 3~6년)"`처럼 경력 연수가 함께 적히고 `career`에는 `"경력"`만 적힌 사례가 있으므로, `position`을 반드시 `raw_text`에 포함해야 AI가 `min_months`/`max_months`(15점)를 근거 기반으로 추출할 수 있다.
2. **빈 필드 허용 원칙 준수**: `hrmgDetail.do` 특성상 필수 스킬(`required_skills`, 30점)이나 수행 경험 요구(`experience_requirements`, 25점)가 원문에 명시되지 않은 공고가 많다. [matching-spec.md](file:///Users/haing/Development/Seoul_Hackton/docs/matching-spec.md) 원칙에 따라 원문 근거(`evidence`)가 없으면 추론하지 않고 `[]`로 두어 규칙 점수에서 `0점 + needs_check`로 처리한다.
3. **카테고리 동기화**: AI가 추출·검증한 `matching_json.categories`는 DB 필터링·정렬을 위해 `job_post_categories` 테이블에도 함께 반영한다.

---

## 2. DB 설계: `seoul_jobs` 신설 대신 기존 `jobs` 확장

현재 서비스 설계는 `companies`와 `jobs`가 **UUID(`id`)**로 연결되어 있고 `applications`, `match_results`, `job_post_categories`가 모두 `jobs.id`를 참조한다. 별도 `seoul_jobs` 테이블과 정수 ID를 신설하지 않고, 기존 `jobs` 테이블의 검색·표시 컬럼을 유지한 채 아래 컬럼을 추가한다.

| 추가/변경 컬럼 | 타입 | 설명 |
|---|---|---|
| `source` | `text not null` | 공고별 상세 페이지 URL (`https://job.seoul.go.kr/hmpg/bcop/hrmg/hrmgDetail.do?hidcmp_recmnt_no={source_job_id}`) |
| `raw_text` | `text` | 매칭 입력용 섹션 조합 본문 텍스트 (개인/담당자 연락처 제외) |
| `content_hash` | `text` | `raw_text` 변경 감지용 해시 (SHA-256) |
| `crawled_at` | `timestamptz` | 마지막 정상 수집 시각 |
| `matching_json` | `jsonb` | AI 정제 + 스키마/사전/evidence 검증 완료된 `JobMatchingJson` |
| `extraction_status` | `text not null default 'pending'` | `'pending' \| 'completed' \| 'failed'` |
| `job_version` | `integer not null default 1` | 본문 변경 시 증가 (매칭 캐시 무효화 키) |

- **원문과 AI 결과의 분리**: `raw_text`와 `matching_json`을 분리 저장해야, 향후 프롬프트나 스킬 사전(`taxonomy_version`)을 개선할 때 재크롤링 없이 DB의 `raw_text`만으로 재정제할 수 있다.

---

## 3. 3단계 파이프라인 분리 (수집 → 적재 → 정제)

크롤링, DB 적재, AI 정제를 한 번에 묶지 않고 독립 단계로 분리한다. AI 호출이 일시 실패하더라도 원문 적재는 완료되어 있어야 하며, 실패 건(`extraction_status = 'failed'` 또는 `'pending'`)만 재실행할 수 있어야 한다.

```text
[1. 수집 Collect]  목록(hrmgListPage.do) → 공고 ID 확보 → 상세(hrmgDetail.do) → 원문 JSON 저장 (개인정보 제외)
        ↓
[2. 적재 Load]     필드 검증·정규화 → companies 연결 → jobs upsert (원문·해시·상태)
        ↓
[3. 정제 Refine]   신규·본문 변경(content_hash 불일치) 공고만 AI 호출
                   → JobMatchingJson 스키마/사전/evidence 검증 → matching_json & job_post_categories 저장
```

### 실행 및 자동화 전략
1. **1단계(현재)**: 로컬에서 수동 실행하는 스크립트로 전체 수집 → DB 적재 → AI 정제 및 갱신 규칙을 검증한다.
2. **2단계(추후)**: 검증된 동일한 실행 코드를 GitHub Actions 스케줄 워크플로에 연결해 주기적으로 실행한다.

### 기존 변환 스크립트([build-gangso-jobs.py](file:///Users/haing/Development/Seoul_Hackton/gangso-matching-share/build-gangso-jobs.py)) 개선 사항
기존 스크립트는 저장된 JSON(`raw-gangso-jobs-all.json`)을 변환·SQL 생성하는 구조이므로, 실제 수집 모듈과 Supabase 적재 모듈을 연결하되 아래 세 가지는 반드시 수정한다.

1. **`duties = position` 제거**: 모집직종(`position`)을 담당업무 본문처럼 중복 저장하지 않고 `position_raw`로 분리한다. `public.jobs`에서 `duties` 컬럼은 제거했으며 매칭 입력은 섹션별 `raw_text`로 통합한다.
2. **`required_skills = []` 덮어쓰기 방지**: `public.jobs`에서 `required_skills` / `preferred_skills` (`text[]`) 컬럼을 제거하고 AI 정제 결과를 `matching_json`으로 단일화한다. 적재 단계의 `upsert` 대상 컬럼에서 `matching_json` 등 AI 정제 결과를 제외해 기존 분석 결과를 보존한다.
3. **기업명 단독 일치(`name_only`)의 `verified` 처리 분리**: 현재는 기업명만 일치해도 `match_status = 'verified'`로 처리하고 있으나, 동명 기업 오연결 위험이 있으므로 `review` 상태로 분리해 관리자 확인 또는 자치구/도로명주소/사업자번호 확인 후 확정한다.

---

## 4. 갱신 및 라이프사이클 규칙 (Safe Upsert)

단순 덮어쓰기 대신 `source_job_id`와 `content_hash`를 기준으로 다음과 같이 갱신한다.

| 상황 | 처리 규칙 |
|---|---|
| **동일 `source_job_id` 재수집** | 기존 `jobs.id`(UUID)를 유지한 채 갱신한다 (`applications`, `match_results` 참조 무결성 유지). |
| **본문 동일 (`content_hash` 일치)** | `crawled_at`, `status`(진행중/종료), `deadline` 등 메타/상태만 갱신한다. `job_version`을 올리지 않으며 AI를 재호출하지 않는다. |
| **본문 변경 (`content_hash` 불일치)** | `raw_text`, `content_hash`를 갱신하고 `job_version = job_version + 1`, `extraction_status = 'pending'`으로 변경한다. 정제 단계에서 AI를 재호출하며, `job_version` 증가로 기존 `match_results` 캐시가 자동 무효화된다. |
| **상세 수집 실패** | 네트워크 오류·파싱 실패·빈 응답 시 기존 `raw_text`, `matching_json`을 빈 값으로 덮어쓰지 않고 오류 로그만 남긴다. |
| **이번 목록에서 미노출** | 목록에서 보이지 않는다는 이유만으로 즉시 삭제(`DELETE`)하거나 `status = 'closed'`로 마감 처리하지 않는다. |
| **전체 목록 수집 완주 시** | **진행중+종료를 포함한 전체 목록 수집을 정상 완주한 실행**에 한해 누락 공고의 상태 갱신(마감 전환 등) 여부를 판단한다. 진행중 공고만 부분 수집한 실행에서 나머지 공고를 일괄 마감 처리해서는 안 된다. |
