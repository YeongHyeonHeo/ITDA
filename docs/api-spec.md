# 서울잇다 프론트·백엔드 공유 API 명세 v1

> **현재 구현 상태 (Track 1):** `H01`, `Y01`~`Y06`은 코드 구현 및 실 Supabase + OpenAI + 시연 이력서 PDF 기준 로컬 E2E 검증 완료(16/16 통과). `A01`, `Y07`, `Y08`, `C01`, `C02`, `F01`(Track 2)은 **미구현(계약 정본)**입니다.
> - **TypeScript 타입 정본:** [api.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/api.ts), [matching.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/matching.ts), [taxonomy.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/taxonomy.ts)
> - **가상 응답(Mock):** [fixtures.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/fixtures.ts) (`mainFixture` 등 — 프론트 단독 개발 시 import 가능)
> - **매칭·배점 규칙:** [matching-spec.md](file:///Users/haing/Development/Seoul_Hackton/docs/matching-spec.md)
> - **DB 스키마:** [companies_jobs_final.sql](file:///Users/haing/Development/Seoul_Hackton/supabase/schema/companies_jobs_final.sql) (공고·기업 확정), [001_mvp_draft.sql](file:///Users/haing/Development/Seoul_Hackton/supabase/schema/001_mvp_draft.sql) (회원·이력서·지원 초안)

---

## 1. 엔드포인트 한눈에 보기

인증/로그인/회원가입/로그아웃은 브라우저 **Supabase Auth SDK**를 직접 사용합니다. 모든 앱 API는 동일 origin `/api` 아래 Next.js Route Handler로 제공합니다.

| ID | 기능 | Method | 경로 | 인증 / 역할 | 요청 | 성공 응답 |
|---|---|---|---|---|---|---|
| H01 | 헬스체크 | `GET` | `/api/health` | 공개 | 없음 | `200` 앱 상태 JSON *(구현됨)* |
| A01 | 내 역할·온보딩 상태 | `GET` | `/api/me` | 로그인 | 없음 | `200` `MeResponse` |
| Y01 | 청년 프로필 최초 등록 | `POST` | `/api/youth/profile` | 로그인·온보딩 전 | `CreateProfileRequest` | `201` `ProfileResponse` |
| Y02 | 내 프로필 조회 | `GET` | `/api/youth/profile` | 청년 | 없음 | `200` `ProfileResponse` |
| Y03 | 내 프로필 수정 | `PATCH` | `/api/youth/profile` | 청년 | `UpdateProfileRequest` | `200` `ProfileResponse` |
| Y04 | 이력서 업로드·재업로드 | `PUT` | `/api/youth/resume` | 청년 | `multipart/form-data` (`file`) | `200` `ResumeResponse` |
| Y05 | 공고 목록·추천 조회 | `GET` | `/api/youth/main` | 청년 | 없음 | `200` `MainResponse` |
| Y06 | 공고 상세 조회 | `GET` | `/api/youth/jobs/{jobId}` | 청년 | Path `jobId` | `200` `JobDetailResponse` |
| Y07 | 공고 지원 | `POST` | `/api/applications` | 청년 | `ApplyRequest` | `201`(최초) / `200`(중복) `ApplyResponse` |
| Y08 | 내 지원 내역 조회 | `GET` | `/api/youth/applications` | 청년 | 없음 | `200` `ApplicationsResponse` |
| C01 | 자사 공고·지원자 수 요약 | `GET` | `/api/company/overview` | 기업 | 없음 | `200` `CompanyOverviewResponse` |
| C02 | 자사 공고 지원자 목록 | `GET` | `/api/company/jobs/{jobId}/applicants` | 기업·공고 소유 | Path `jobId`, Query `policy` | `200` `ApplicantsResponse` |
| F01 | 지원 당시 PDF 열람 | `GET` | `/api/applications/{applicationId}/resume` | 지원 본인 또는 해당 기업 | Path `applicationId` | `200` `application/pdf` 스트림 |

---

## 2. 공통 규칙 및 에러 규약

### 2.1 인증·보안·포맷
- **인증 방식**: `@supabase/ssr` 서버 클라이언트가 쿠키 세션(`auth.getUser()`)을 검증합니다. 클라이언트가 보낸 `user_id`, `role`, `company_id`, `score`는 신뢰하지 않습니다.
- **온보딩 가드**: `role === null`인 사용자가 `POST /api/youth/profile` 외의 업무 API를 호출하면 `409 ONBOARDING_REQUIRED`를 반환합니다.
- **CSRF / 캐시**: 쿠키 인증을 쓰는 상태 변경 요청(`POST`/`PATCH`/`PUT`)은 서버가 `Origin` 헤더를 앱 origin과 대조(불일치 시 `403`)합니다. 개인화 응답과 PDF 스트림은 `Cache-Control: private, no-store`를 설정합니다.
- **날짜·시간**: 날짜 `YYYY-MM-DD`, 시각은 UTC ISO 8601. 마감 판정 및 만 나이 계산은 **KST(`Asia/Seoul`)** 기준이며 마감 당일 KST `23:59:59`까지 지원 가능합니다.
- **응답 래퍼 없음**: 성공 응답은 별도 `{ data: ... }` 래퍼 없이 계약 타입 그대로 반환합니다. `null`(값 없음)과 `[]`(빈 배열), 숫자 `0`을 명확히 구분합니다.

### 2.2 공통 에러 형식 & HTTP 상태 코드
프론트엔드 분기는 `message`가 아니라 **`error.code`**로 처리합니다.

```json
{
  "error": {
    "code": "RESUME_REQUIRED",
    "message": "이력서를 먼저 등록해주세요."
  }
}
```

| HTTP | 주요 코드 | 의미 및 처리 |
|---|---|---|
| `400` | `VALIDATION_ERROR`, `CONSENT_REQUIRED`, `PDF_TEXT_EMPTY`, `RESUME_REQUIRED` | 요청 스키마 오류, 동의 누락, 텍스트 없는 PDF, 이력서 미등록 |
| `401` | `UNAUTHORIZED` | 미로그인 또는 세션 만료 |
| `403` | `ROLE_FORBIDDEN`, `ORIGIN_FORBIDDEN`, `COMPANY_ACCESS_DENIED`, `APPLICATION_ACCESS_DENIED` | 역할 불일치, Origin 불일치(CSRF), 타 기업 공고 접근, 타인 이력서 PDF 접근 |
| `404` | `JOB_NOT_FOUND`, `APPLICATION_NOT_FOUND`, `RESUME_NOT_FOUND` | 존재하지 않거나 비공개/미검증 공고, 없는 지원/파일 |
| `409` | `PROFILE_ALREADY_EXISTS`, `ONBOARDING_REQUIRED`, `POSTING_CLOSED` | 중복 온보딩, 온보딩 미완료, 마감된 공고 지원 |
| `413` / `415` | `FILE_TOO_LARGE` / `UNSUPPORTED_FILE_TYPE` | PDF 5MiB 초과 / PDF 시그니처 불일치 |
| `500` / `503` | `INTERNAL_ERROR` / `RESUME_SAVE_FAILED` | 서버 오류 또는 파일/DB 저장 실패 |

---

## 3. 공통 코드·카테고리·데이터 구조

### 3.1 직무 카테고리 15종 (`CategoryId`)
DB `public.job_categories` 테이블과 [matching.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/matching.ts)의 `CATEGORY_IDS`를 정본으로 사용합니다.

| slug | 화면 표시 | slug | 화면 표시 |
|---|---|---|---|
| `management_hr` | 경영·기획·인사 | `production_quality` | 생산·품질 |
| `accounting_finance` | 회계·재무 | `procurement_logistics_trade` | 구매·물류·무역 |
| `marketing_pr` | 마케팅·홍보 | `construction_civil_env` | 건축·토목·환경 |
| `sales_customer` | 영업·고객관리 | `medical_health` | 의료·보건 |
| `product_md` | 상품기획·MD | `education` | 교육 |
| `it_data` | IT개발·데이터 | `media_content` | 미디어·콘텐츠 |
| `design` | 디자인 | `other` | 기타 |
| `rnd_engineering` | 연구개발·설계 | | |

### 3.2 공통 스킬·경험 사전 (`TAXONOMY_VERSION = "v1"`)
- 정본: [taxonomy.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/taxonomy.ts) (`SKILL_TAXONOMY` 32개 + `EXPERIENCE_TAXONOMY` 12개).
- 공고 AI와 이력서 AI가 동일한 `id` 체계를 사용하여 100점 규칙 점수 교집합을 계산합니다.

---

## 4. 엔드포인트 상세 명세

### H01. `GET /api/health` — 공개 *(구현됨)*
- **200 OK**: `{ "status": "ok", "service": "seoul-itda", "database": "not_checked" }`

---

### A01. `GET /api/me` — 로그인 필요
현재 로그인 사용자의 역할과 온보딩 완료 여부를 조회합니다.
- **200 OK (`MeResponse`)**:
```json
{
  "user_id": "00000000-0000-4000-8000-000000000003",
  "role": "youth",
  "onboarding_complete": true,
  "company_ids": []
}
```
- 온보딩 전: `role: null`, `onboarding_complete: false`, `company_ids: []`.

---

### Y01. `POST /api/youth/profile` — 로그인 · 온보딩 전
청년 최초 프로필·개인정보 동의·희망 직무를 등록합니다. 기업 계정/연결은 이 API로 생성할 수 없습니다.
- **프론트 회원가입(`S2`) 연속 호출 플로우**:
  - 화면에서 `[가입 완료]` 클릭 시 `1) Supabase Auth signUp(email, password)` → `2) POST /api/youth/profile` → `3) (이력서 PDF 파일을 선택한 경우) PUT /api/youth/resume` 순서로 연속 호출합니다.
- **요청 (`CreateProfileRequest`)**:
  - `name`: string (1~100자)
  - `birth_date`: `YYYY-MM-DD` (KST 기준 만 나이 계산용; 서버에서 `birth_date_cipher`로 암호화 저장)
  - `address`: `{ sido: string, sigungu: string }` (암호화 저장)
  - `desired_categories`: `CategoryId[]` (**중복 없는 1~3개**)
  - `privacy_consent`: `true` (필수)
```json
{
  "name": "가상 청년",
  "birth_date": "2001-05-14",
  "address": { "sido": "서울특별시", "sigungu": "마포구" },
  "desired_categories": ["it_data"],
  "privacy_consent": true
}
```
- **201 Created (`ProfileResponse`)**:
```json
{
  "user_id": "00000000-0000-4000-8000-000000000003",
  "email": "minsu@example.com",
  "name": "가상 청년",
  "birth_date": "2001-05-14",
  "age": 25,
  "address": { "sido": "서울특별시", "sigungu": "마포구" },
  "desired_categories": ["it_data"],
  "youth_policy": {
    "status": "eligible",
    "items": { "age": "pass", "residence": "pass" },
    "disclaimer": "입력정보 기반 예비진단이며 지원금 수급을 확정하지 않습니다."
  },
  "profile_version": 1,
  "privacy_consent_at": "2026-11-20T03:00:00.000Z",
  "resume": null
}
```
- **오류**: `400 CONSENT_REQUIRED`, `400 VALIDATION_ERROR`, `403 ROLE_FORBIDDEN`, `409 PROFILE_ALREADY_EXISTS`.

---

### Y02. `GET /api/youth/profile` — 청년
- **200 OK (`ProfileResponse`)**: 복호화된 본인 프로필 + `email`(변경 불가) + 서버 계산 만 나이(`age`) + `youth_policy`(연령·서울 거주 예비진단) + 현재 연결된 이력서(`resume`, 없으면 `null`). Storage 경로와 이력서 원문 텍스트(`resume_text`)는 반환하지 않습니다.
- **마이페이지(`S6`) 표시 규칙**:
  - `관심직무`: 회원가입/프로필에서 선택한 `desired_categories`를 그대로 표시합니다.
  - `AI 분석 결과`: `resume.matching_json`의 `education`(학력), `major`(전공), `certificates`(자격증), `skills`(보유 기술), `experiences`(경험·프로젝트)를 노출하며, **화면에서 직접 수정할 수 없고 이력서 PDF 재업로드로만 갱신**됩니다.

---

### Y03. `PATCH /api/youth/profile` — 청년
- **요청 (`UpdateProfileRequest`)**: `name`, `birth_date`, `address`, `desired_categories`(1~3개) 중 최소 1개 필드 포함 (`address`는 `sido`/`sigungu` 함께 전송, `desired_categories`는 전체 교체).
- **200 OK (`ProfileResponse`)**: DB 트랜잭션으로 수정 + `profile_version++` + `match_results` 캐시 무효화. (기존 `applications` 스냅샷은 불변)

---

### Y04. `PUT /api/youth/resume` — 청년
PDF 이력서를 업로드하고 텍스트 추출 → Storage 저장 → `resume_versions` 생성 → AI 정제까지 요청 내에서 처리합니다.
- **요청**: `multipart/form-data`, 필드명 `file` (PDF 1개, 최대 5 MiB, `%PDF-` 파일 시그니처 검증).
- **200 OK (`ResumeResponse`)**:
  - **정제 성공**:
```json
{
  "resume_id": "00000000-0000-4000-8000-000000000010",
  "filename": "홍길동_이력서.pdf",
  "uploaded_at": "2026-11-20T03:10:00.000Z",
  "extraction_status": "completed",
  "extraction_error": null,
  "matching_json": { "...ResumeMatchingJson..." : true },
  "profile_version": 2
}
```
  - **PDF 저장은 성공했으나 AI 정제만 실패한 경우**: **HTTP `200`** + `extraction_status: "failed"`, `matching_json: null`, `extraction_error: { "code": "EXTRACTION_FAILED", "message": "..." }`. (파일은 저장되어 있으므로 지원 자체는 가능)
- **오류**: `400 PDF_TEXT_EMPTY`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, `503 RESUME_SAVE_FAILED` (고아 파일 정리 후 기존 이력서 유지).

---

### Y05. `GET /api/youth/main` — 청년
청년 메인 화면(`S4`)용 상단 요약(`youth_summary`), 추천 공고(최대 3건), 전체 공고 목록을 반환합니다. **GET 요청에서는 AI를 호출하지 않고**, 저장된 두 JSON으로 규칙 점수 계산 및 `match_results` 캐시 조회/저장을 수행합니다.
- **200 OK (`MainResponse`)**: `{ youth_summary, has_resume, recommended, postings, fallback_used }` (예시는 [fixtures.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/fixtures.ts) `mainFixture` 참고)
  - **`youth_summary`**: `{ name, age, address, youth_policy }` (`S4` 상단 Hero `"김민수 님에게 맞는 서울형 강소기업 공고 / 내 기본요건 예비진단 · 만 25세 · 서울특별시 마포구"` 표시용).
  - **`postings`**: `jobs.match_status = 'verified'`인 공고 전체 (마감 공고 포함). 정렬 순서:
    - 이력서 등록 시: **점수 높은 순 (`score DESC`) → 진행중 공고 먼저 (`is_closed ASC`) → 마감일 빠른 순 (`deadline ASC NULLS LAST`) → 공고 ID (`job_id ASC`)**.
    - 이력서 미등록 시: **진행중 공고 먼저 (`is_closed ASC`) → 마감일 빠른 순 (`deadline ASC NULLS LAST`) → 공고 ID (`job_id ASC`)**.
  - **`recommended`**: `recommendable === true`이며 마감되지 않은 진행중 공고 중 상위 **최대 3건 (TOP 3)**.
  - **적합도 화면 표시 (PRD v1.4 D-05)**: 청년·기업 화면 모두 0~100점 점수 숫자를 표시하지 않고 `fit_grade` 3단계(**60점 이상 `high`(높음) / 40~59점 `medium`(보통) / 39점 이하 `low`(낮음)**)로 표시합니다. API는 `score`와 함께 `fit_grade`를 제공합니다.
  - **`match.reason` 문장 제공 범위 (PRD v1.4 D-19, D-33)**: 추천 TOP 3에만 LLM/근거 기반 추천 이유를 제공하며, 4위 이하 공고는 `match.reason = null`로 제공(대신 `matched_ids`/`missing_ids` 역량 목록 제공)합니다.
  - **이력서 없음 (`has_resume: false`)**: `recommended: []`, 각 공고 `match.status = "no_resume"`, `score = null`, `fit_grade = null`.
  - **지원 버튼 상태 4가지 (`can_apply` & `apply_block_reason`)**: `지원 가능`(`can_apply: true`) / `지원 완료`(`already_applied`) / `모집 마감`(`closed`) / `이력서 없음`(`resume_required`). (`미참여 기업` 상태는 제외하며 시연 시 진행중 검증 공고 전체 지원 가능)
  - **`apply_block_reason` 우선순위**: `already_applied` → `closed` → `resume_required` → `null`.

---

### Y06. `GET /api/youth/jobs/{jobId}` — 청년
- **200 OK (`JobDetailResponse`)**: `JobCard` + `{ position_raw, preferred, employment_type_raw, career_req, education_req, salary, company_industry, crawled_at, matching_json }`.
  - 공고 상세(`S4-1`)의 `일치 역량`과 `추가 확인 항목`은 `match.breakdown.{skills,experience}`의 `matched_ids`(교집합)와 `missing_ids`(차집합)를 그대로 표시합니다.
  - 원문에 없는 항목은 `null`로 반환하며 임의 생성하지 않습니다. `source`(크롤링 상세 URL), `raw_text` 등 크롤링 내부 메타는 응답에서 제외합니다.
- **오류**: `404 JOB_NOT_FOUND` (없는 ID 또는 `match_status !== 'verified'`).

---

### Y07. `POST /api/applications` — 청년
- **요청 (`ApplyRequest`)**: `{ "job_id": "00000000-0000-4000-8000-000000000001" }`
- **응답 (`ApplyResponse`)**:
  - **최초 지원 (`201 Created`)**: `{ "application_id": "...", "already_applied": false }`
  - **중복 지원 (`200 OK`)**: `{ "application_id": "기존ID", "already_applied": true }` (`(youth_user_id, job_id)` UNIQUE 제약 + 단일 트랜잭션/RPC로 동시 연타 시에도 1건만 저장)
- **서버 저장 규칙**: 지원 시점의 `resume_version_id`, `applicant_snapshot`(`age`, `address`, `email`, `resume_summary`), `fit_snapshot`, `desired_categories_snapshot`, `policy_snapshot`, `policy_rule_version`, `policy_evaluated_on`을 `applications` 행에 영구 고정합니다. (이후 프로필·공고가 바뀌어도 기존 지원 스냅샷 불변)
- **오류**: `400 RESUME_REQUIRED`, `404 JOB_NOT_FOUND`, `409 ONBOARDING_REQUIRED`, `409 POSTING_CLOSED`.

---

### Y08. `GET /api/youth/applications` — 청년
- **200 OK (`ApplicationsResponse`)**: `{ applications: ApplicationSummary[] }`
  - 본인 지원 내역만 `applied_at DESC → application_id ASC` 순으로 반환. 점수와 정책은 지원 당시 스냅샷을 반환합니다.

---

### C01. `GET /api/company/overview` — 기업
- **200 OK (`CompanyOverviewResponse`)**: `{ companies: [{ company: CompanySummary, jobs: [{ job_id, title, is_closed, applicant_count, job_policy }] }] }`
  - `company_accounts`로 연결된 자사 정보(`id`, `name`, `industry`, `gu`, `is_demo`)와 자사 공고 목록·지원자 수·공고별 지원금 대상 여부(`job_policy`: 정규직 `eligible`, 인턴·비정규 `ineligible`, 불명 `needs_check`)를 반환합니다 (`S5` 상단 기업 헤더 및 공고 전환 드롭다운용).

---

### C02. `GET /api/company/jobs/{jobId}/applicants?policy=all` — 기업·공고 소유
- **Query**: `policy` = `all`(기본) | `eligible` | `needs_check` | `ineligible` (그 외 `400 VALIDATION_ERROR`).
- **200 OK (`ApplicantsResponse`)**:
  - `{ job: { job_id, title, job_policy }, counts: { all, eligible, needs_check, ineligible }, applicants: Applicant[] }`
  - `counts`는 필터 전 전체 기준이며 `eligible + needs_check + ineligible === all`을 항상 만족합니다.
  - `applicants` 정렬: 지원 당시 `score DESC (NULL 마지막) → applied_at ASC → application_id ASC`.
  - **제공 필드 (`S2` 개인정보 제공 동의 및 `S5` 시안 기준)**: 지원 시점 기준 `name`, `age`, `address`(`sido`, `sigungu`), `email`, `desired_categories`, `resume_summary`(`education`, `major`, `certificates`, `skills`, `experiences`), `match_snapshot`(`matched_ids` 일치 역량 / `missing_ids` 미확인 역량 포함), `policy_snapshot`, `resume_url`(`/api/applications/{id}/resume`), `applied_at`을 반환합니다. (상세 도로명주소·생년월일 원본·이력서 전체 raw text는 제외)
- **오류**: `403 COMPANY_ACCESS_DENIED` (타 기업 공고), `404 JOB_NOT_FOUND`.

---

### F01. `GET /api/applications/{applicationId}/resume` — 지원 본인 또는 해당 기업
- **200 OK**: `application/pdf` 바이너리 스트리밍, `Content-Disposition: inline`, `Cache-Control: private, no-store`.
- 매 요청마다 세션 + 지원 본인 또는 해당 공고의 기업 연결 여부를 검증하고, **지원 시점 `resume_version_id`의 PDF**를 비공개 Storage에서 스트리밍합니다.
- **오류**: `401 UNAUTHORIZED`, `403 APPLICATION_ACCESS_DENIED`, `404 APPLICATION_NOT_FOUND` / `RESUME_NOT_FOUND`.

---

## 5. 내부 배치 및 데이터 경계 (API 외)
- **공고 수집·적재·정제**: [crawling-plan.md](file:///Users/haing/Development/Seoul_Hackton/docs/crawling-plan.md)에 따라 배치 스크립트로 수행하며 프론트 노출 API는 두지 않습니다.
- **지원금 예비진단**: 정책 판정 결과는 적합도 점수나 지원 가능 여부에 영향을 주지 않으며, 항상 `policy.disclaimer` 고지를 함께 표시합니다.
