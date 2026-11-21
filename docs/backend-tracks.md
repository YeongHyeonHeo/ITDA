# 백엔드 2인 병렬 개발 런북 (트랙 1 · 트랙 2)

> **목표:** 백엔드 2명이 **Git 파일 충돌 0%**, **작업량·성격 균등(각 6개 API · 각 약 2시간 15~20분)**으로 동시에 개발·테스트할 수 있도록 도메인별로 완전히 분리한 구현 가이드입니다.
> - **API 계약 정본:** [api-spec.md](file:///Users/haing/Development/Seoul_Hackton/docs/api-spec.md), [api.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/api.ts)
> - **매칭·사전 정본:** [matching-spec.md](file:///Users/haing/Development/Seoul_Hackton/docs/matching-spec.md), [matching.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/matching.ts), [taxonomy.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/taxonomy.ts)
> - **가상 응답(Mock):** [fixtures.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/fixtures.ts)
> - **DB 스키마:** [companies_jobs_final.sql](file:///Users/haing/Development/Seoul_Hackton/supabase/schema/companies_jobs_final.sql), [001_mvp_draft.sql](file:///Users/haing/Development/Seoul_Hackton/supabase/schema/001_mvp_draft.sql)

---

## 한눈에 보는 2트랙 비교

| 구분 | **트랙 1 (개발자 1): 청년 프로필 · 이력서 AI · 매칭/공고 탐색** | **트랙 2 (개발자 2): 정책 판정 · 지원하기 · 기업 대시보드 · PDF 열람** |
| --- | --- | --- |
| **담당 화면** | `S2 회원가입`, `S4 청년 메인`, `S4-1 공고 상세`, `S6 내 정보/이력서` | `S1 역할 분기`, `S4-1 지원 버튼`, `S5 기업 지원자 목록`, `S6 지원 내역` |
| **담당 API (각 6개)** | **`Y01`, `Y02`, `Y03`, `Y04`, `Y05`, `Y06`** | **`A01`, `Y07`, `Y08`, `C01`, `C02`, `F01`** |
| **담당 `src/server/`** | `src/server/auth/`, `src/server/resumes/`, `src/server/matching/` | `src/server/policy/`, `src/server/applications/` |
| **쓰기(Write) 소유 테이블** | `youth_profiles`, `youth_categories`, `resume_versions`, `match_results` | `applications` *(읽기: `profiles`, `company_accounts`, `jobs`)* |
| **도메인 규칙 모듈** | 100점 규칙 점수 계산기 (`20 + 40 + 25 + 15`) | 만 나이·서울 거주·정규직 예비진단 (`PolicyResult`) |
| **Storage 파일 작업** | PDF 업로드 저장 (`PUT /api/youth/resume`) | PDF 스트리밍 열람 (`GET /api/applications/[id]/resume`) |
| **총 예상 소요 시간** | **약 140분 (2시간 20분)** | **약 135분 (2시간 15분)** |

---

## 0. 시작 직후 공통 세팅 (5분 — 한 명이 먼저 만들어 `main`에 커밋)

기존 [require-user.ts](file:///Users/haing/Development/Seoul_Hackton/src/server/auth/require-user.ts)는 로그인 세션 확인용(`publishable key`)입니다. RLS 규칙상 **모든 DB 쓰기(`INSERT`/`UPDATE`/`DELETE`)와 비공개 Storage 접근은 `SUPABASE_SECRET_KEY`를 쓰는 Admin 클라이언트**로 수행해야 권한 에러(`42501`)가 발생하지 않습니다.

### `src/lib/supabase/admin.ts` (신규 생성)
```ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("Missing SUPABASE_SECRET_KEY");
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function jsonError(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status });
}
```

---

## 트랙 1 (개발자 1): 청년 프로필 · 이력서 AI · 100점 매칭/공고 탐색 (140분)

| 순서 | 작업 항목 | 생성/수정 파일 | 예상 시간 |
| --- | --- | --- | --- |
| 1-1 | PII 암복호화 + 만 나이 유틸 | `src/server/auth/crypto.ts` | **15분** |
| 1-2 | 청년 프로필 등록·조회·수정 (`Y01`, `Y02`, `Y03`) | `src/app/api/youth/profile/route.ts` | **35분** |
| 1-3 | 이력서 PDF 업로드 + AI 정제 (`Y04`) | `src/server/resumes/`, `src/app/api/youth/resume/route.ts` | **40분** |
| 1-4 | 100점 규칙 매칭 엔진 | `src/server/matching/score.ts` | **25분** |
| 1-5 | 청년 메인 추천·목록(`Y05`) & 공고 상세(`Y06`) | `src/app/api/youth/main/route.ts`, `src/app/api/youth/jobs/[jobId]/route.ts` | **25분** |

### Step 1-1. `src/server/auth/crypto.ts` (15분 — **완성 즉시 먼저 커밋해 트랙 2와 공유**)
- **구현 함수 3개**:
  1. `encryptPii(plain: string): string` — `node:crypto` `aes-256-gcm`으로 암호화하여 `v1:<ivB64>:<tagB64>:<cipherB64>` 반환 (`PII_ENCRYPTION_KEY` base64 디코딩 사용)
  2. `decryptPii(cipherText: string): string` — 복호화한 원본 문자열 반환
  3. `calcKoreanAge(birthDateISO: string, todayISO?: string): number` — KST(`Asia/Seoul`) 기준 만 나이 계산 (`생일이 지났으면 올해 - 출생연도`, 안 지났으면 `-1`)

### Step 1-2. `src/app/api/youth/profile/route.ts` — `Y01`, `Y02`, `Y03` (35분)
- **`POST /api/youth/profile` (`Y01` 최초 온보딩)**:
  1. `requireUser()` 확인 (미로그인 `401 UNAUTHORIZED`)
  2. Zod로 `CreateProfileRequest` 검증:
     - `privacy_consent === true` (아니면 `400 CONSENT_REQUIRED`)
     - `birth_date` (`YYYY-MM-DD`), `address: { sido, sigungu }`, `desired_categories` (**중복 없는 1~3개**, `CATEGORY_IDS` 포함 여부, 위반 시 `400 VALIDATION_ERROR`)
  3. `profiles` 조회 → 이미 `role === 'company'`면 `403 ROLE_FORBIDDEN`, 이미 `youth_profiles` 행이 있으면 `409 PROFILE_ALREADY_EXISTS`
  4. `createAdminClient()`로 저장:
     - `profiles` upsert (`user_id: user.id`, `role: 'youth'`)
     - `youth_profiles` insert (`name_cipher: encryptPii(name)`, `birth_date_cipher: encryptPii(birth_date)`, `address_cipher: encryptPii(JSON.stringify(address))`, `privacy_consent_at: now()`, `profile_version: 1`)
     - `youth_categories` insert (`desired_categories` 1~3개)
  5. `201 Created`로 `ProfileResponse` 반환 (`age`, `email: user.email ?? ""`, `youth_policy: evaluateYouthPolicy(birth_date, address.sido)`, `resume: null`)
- **`GET /api/youth/profile` (`Y02` 내 프로필 조회)**:
  1. `requireUser()` → `youth_profiles` + `youth_categories` + 현재 연결된 `resume_versions`(`current_resume_id`) 조회 (없으면 `409 ONBOARDING_REQUIRED`)
  2. `decryptPii`로 이름·생년월일·주소 복호화 → 만 나이 `age` 및 `youth_policy` 계산 → `200 ProfileResponse` 반환 (Storage 경로와 `resume_text` 원문은 제외)
- **`PATCH /api/youth/profile` (`Y03` 내 프로필 수정)**:
  1. `UpdateProfileRequest` 검증 (`name`, `birth_date`, `address`, `desired_categories` 1~3개 중 최소 1개)
  2. 변경된 필드 암호화 업데이트 + `desired_categories` 포함 시 `youth_categories` 전체 교체
  3. `profile_version = profile_version + 1` 증가 + `match_results`에서 `youth_user_id = user.id` 캐시 삭제 → `200 ProfileResponse`

### Step 1-3. `src/server/resumes/` + `src/app/api/youth/resume/route.ts` — `Y04` (40분)
- **`PUT /api/youth/resume`**:
  1. `requireUser()` + 온보딩 확인(`youth_profiles` 없으면 `409 ONBOARDING_REQUIRED`)
  2. `req.formData()`에서 `file` 추출:
     - 파일 크기 `> 5 * 1024 * 1024` → `413 FILE_TOO_LARGE`
     - 앞 5바이트가 `%PDF-`가 아님 → `415 UNSUPPORTED_FILE_TYPE`
  3. PDF 텍스트 추출 (`unpdf` 또는 `pdf-parse`) → 공백 제거 후 비어 있으면 `400 PDF_TEXT_EMPTY` (기존 현재 이력서 유지)
  4. 새 `resumeId = crypto.randomUUID()`, Storage `resumes` 버킷에 `${user.id}/${resumeId}.pdf` 업로드 (실패 시 `503 RESUME_SAVE_FAILED`)
  5. LLM 호출로 `ResumeMatchingJson` 추출:
     - 프롬프트에 [taxonomy.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/taxonomy.ts)의 `SKILL_TAXONOMY`(32개 `id+label+aliases`)와 `EXPERIENCE_TAXONOMY`(12개)를 전달
     - 추출 필드: `education`(학력), `major`(전공), `certificates`(자격증 배열), `skills([{id, evidence}])`, `experiences([{id, kind, title, evidence, competency_ids, start_month, end_month, is_current}])`, `career`
     - 서버 검증: 허용된 사전 `id`만 통과(사전 밖은 `unmapped` 이동), `evidence`가 공백 정규화 후 실제 이력서 텍스트에 포함되는지 검증
  6. `resume_versions` insert + `youth_profiles`의 `current_resume_id = resumeId`, `profile_version++` 업데이트 + 기존 `match_results` 캐시 삭제
  7. **중요 분기**: LLM 호출/검증이 실패해도 PDF와 `resume_versions` 행은 `extraction_status = 'failed'`, `matching_json = null`로 저장하고 **HTTP `200`** + `extraction_error: { code: "EXTRACTION_FAILED", message: "..." }`를 반환합니다.

### Step 1-4. `src/server/matching/score.ts` — 100점 규칙 엔진 (25분)
- [matching-spec.md](file:///Users/haing/Development/Seoul_Hackton/docs/matching-spec.md) 기준 순수 함수 `computeMatchResult(...)` 구현:
  - **희망 직무 (20점)**: `desired_categories` ∩ `job.categories[].id` $\ge 1$ → `20`, 아니면 `0` (공고 카테고리 비어있으면 `0 + needs_check`)
  - **기술·역량 (40점)**: 필수 `30 * (교집합 / 필수수)` + 우대 `10 * (교집합 / 우대수)` (필수·우대 중복 ID는 필수에만 포함; 빈 배열은 해당 파트 `0 + needs_check`)
  - **경험·프로젝트 (25점)**: `25 * (교집합 / 공고 경험요구수)` (`experiences[].competency_ids` 합집합과 비교)
  - **경력조건 (15점)**: 경력개월 $M$ 계산(`declared_total_months` 우선, 없으면 `kind === 'employment'` 월 합집합, 명시적 무경력만 `M = 0`, 불명 `null`) 후 공고 `career`와 비교
  - 각 항목 소수 첫째 자리 반올림(`Math.round(v * 10) / 10`) 후 합산
  - `recommendable`: `status === 'ready' && score >= 60 && category.score === 20 && (skills.matched_ids.length + experience.matched_ids.length >= 1) && !isClosed`
  - `buildReason(jobJson, resumeJson, breakdown)`: 일치한 스킬/경험의 한글 `label`([taxonomy.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/taxonomy.ts))과 이력서 `evidence`를 결합한 1~2문장 템플릿 반환

### Step 1-5. `src/app/api/youth/main/route.ts` (`Y05`) & `jobs/[jobId]/route.ts` (`Y06`) (25분)
- **`GET /api/youth/main` (`Y05`)**:
  1. 청년 프로필(`youth_summary`), 현재 이력서(`resume_versions`), 본인 지원 목록(`applications.job_id`), `jobs`(`match_status = 'verified'`) + `companies` + `job_post_categories` 조회
  2. **이력서 없음 (`!current_resume_id`)**:
     - `has_resume: false`, `recommended: []`
     - `postings`: **최신 기준 정렬(`posted_at DESC NULLS LAST, id ASC`)**, 각 공고 `match.status = 'no_resume'`, `score = null`, `can_apply = false`, `apply_block_reason = isClosed ? 'closed' : 'resume_required'`
  3. **이력서 있음 (`completed`)**:
     - `match_results` 캐시 조회(`profile_version`, `job_version`, `algorithm_version`, `taxonomy_version`, `evaluated_month` 일치 건 재사용, 미스 건만 `computeMatchResult` 계산 후 upsert)
     - 정렬: `ready` 우선 → `score DESC` → `deadline ASC NULLS LAST` → `job_id ASC`
     - `recommended`: `recommendable === true` 상위 최대 3건 추출 후 **이 3건에만 `match.reason` 세팅** (나머지 일반 공고는 LLM/이유 문장 없이 `reason: null`, 단 `breakdown`의 `matched_ids`/`missing_ids`는 그대로 유지)
- **`GET /api/youth/jobs/[jobId]` (`Y06`)**:
  - `jobs`에서 `id = jobId AND match_status = 'verified'` 조회(없으면 `404 JOB_NOT_FOUND`)
  - `JobCard`에 `position_raw`, `preferred`, `employment_type_raw`, `career_req`, `education_req`, `salary`, `company_industry: job.industry`, `crawled_at`, `matching_json`을 합쳐 `JobDetailResponse` 반환

---

## 트랙 2 (개발자 2): 정책 판정 · 지원하기 · 기업 대시보드 · PDF 열람 (135분)

| 순서 | 작업 항목 | 생성/수정 파일 | 예상 시간 |
| --- | --- | --- | --- |
| 2-1 | 정책 예비진단 모듈 이식 | `src/server/policy/evaluate.ts` | **20분** |
| 2-2 | 내 역할·온보딩 상태 조회 (`A01`) | `src/app/api/me/route.ts` | **15분** |
| 2-3 | 공고 지원하기(`Y07`) & 내 지원 내역(`Y08`) | `src/server/applications/`, `src/app/api/applications/route.ts`, `src/app/api/youth/applications/route.ts` | **40분** |
| 2-4 | 기업 개요(`C01`) & 지원자 목록/필터(`C02`) | `src/app/api/company/overview/route.ts`, `src/app/api/company/jobs/[jobId]/applicants/route.ts` | **40분** |
| 2-5 | 지원 당시 이력서 PDF 스트리밍 (`F01`) | `src/app/api/applications/[applicationId]/resume/route.ts` | **20분** |

### Step 2-1. `src/server/policy/evaluate.ts` (20분 — **완성 즉시 먼저 커밋해 트랙 1과 공유**)
- 기존 [policy-rules.ts](file:///Users/haing/Development/Seoul_Hackton/gangso-matching-share/policy-rules.ts) 로직을 가져와 [api.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/api.ts) 타입(`PolicyResult`, `YouthPolicyResult`)으로 반환하는 순수 함수 2개 export:
  1. `evaluateYouthPolicy(birthDateISO: string, sido: string, todayISO?: string): YouthPolicyResult`
     - `age`: 만 18~39세면 `'pass'`, 범위 밖이면 `'fail'`, 6개월 내 만 18세 도달 또는 만 40세 초과 경계 구간이면 `'unknown'`
     - `residence`: `sido === '서울특별시'`면 `'pass'`, `'서울 전입 예정'`이면 `'unknown'`, 그 외 `'fail'`
     - 종합 `status`: 하나라도 `'fail'`이면 `'ineligible'`, 하나라도 `'unknown'`이면 `'needs_check'`, 모두 `'pass'`면 `'eligible'`
  2. `evaluateJobPolicy(birthDateISO: string, sido: string, employmentKind: string, todayISO?: string): PolicyResult`
     - 위 `age`, `residence`에 `regular`(`employmentKind`가 `'regular' | 'probation'`이면 `'pass'`, `'non_regular' | 'conversion'`이면 `'fail'`, `'unknown'`이면 `'unknown'`)를 합쳐 종합 `status` 반환
     - `disclaimer`: `"입력정보 기반 예비진단이며 지원금 수급을 확정하지 않습니다."`

### Step 2-2. `src/app/api/me/route.ts` — `A01` (15분)
- **`GET /api/me`**:
  1. `requireUser()` (없으면 `401 UNAUTHORIZED`)
  2. `profiles`에서 `user_id = user.id` 조회:
     - 행이 없으면: `{ user_id: user.id, role: null, onboarding_complete: false, company_ids: [] }`
     - `role === 'youth'`: `youth_profiles` 존재 여부로 `onboarding_complete` 확인, `company_ids: []`
     - `role === 'company'`: `company_accounts`에서 연결된 `company_id` 배열 조회 후 `{ user_id: user.id, role: 'company', onboarding_complete: true, company_ids }`

### Step 2-3. `src/app/api/applications/route.ts` (`Y07`) & `youth/applications/route.ts` (`Y08`) (40분)
- **`POST /api/applications` (`Y07`)**:
  1. `requireUser()` + 청년 프로필(`youth_profiles`, `youth_categories`) 조회 (없으면 `409 ONBOARDING_REQUIRED`)
  2. 요청 body `{ job_id }` 검증 → **가장 먼저 `applications`에 `(youth_user_id, job_id)` 기존 행이 있는지 조회** → 있으면 즉시 **`200 OK` `{ application_id: existing.id, already_applied: true }`** 반환 (마감 여부보다 중복 지원 200 반환이 우선)
  3. `jobs`에서 `id = job_id AND match_status = 'verified'` 조회 (없으면 `404 JOB_NOT_FOUND`)
  4. 마감 확인: `job.status !== 'open' || (job.deadline && job.deadline < todayKST)` → `409 POSTING_CLOSED`
  5. 이력서 확인: `!youthProfile.current_resume_id` → `400 RESUME_REQUIRED`
  6. 지원 시점 스냅샷 조립:
     - `applicant_snapshot`: 복호화한 `{ name, age, address, email: user.email ?? "", resume_summary }` (`resume_versions.matching_json`에서 `education`, `major`, `certificates`, `skills`, `experiences` 추출)
     - `fit_snapshot`: `match_results` 캐시 조회 (없으면 `computeMatchResult` 호출)
     - `policy_snapshot`: `evaluateJobPolicy(birthDate, address.sido, job.employment_kind)`
  7. `applications` insert (동시 연타로 `23505 unique_violation` 발생 시 기존 행 조회해 `200 already_applied: true` 반환) → 최초 저장 성공 시 **`201 Created` `{ application_id, already_applied: false }`**
- **`GET /api/youth/applications` (`Y08`)**:
  - `applications` + `jobs(title, company_name)` 조인 (`youth_user_id = user.id`, `created_at DESC, id ASC`)
  - 각 행을 `ApplicationSummary` (`match_snapshot: row.fit_snapshot`, `policy_snapshot: row.policy_snapshot`, `resume_url: \`/api/applications/\${row.id}/resume\``)로 매핑해 `200` 반환

### Step 2-4. `src/app/api/company/overview/route.ts` (`C01`) & `jobs/[jobId]/applicants/route.ts` (`C02`) (40분)
- **`GET /api/company/overview` (`C01`)**:
  1. `requireUser()` + `profiles.role === 'company'` 확인 (아니면 `403 ROLE_FORBIDDEN`)
  2. `company_accounts`로 연결된 `companies` 조회 + 각 기업의 `jobs`(`match_status = 'verified'`) 및 공고별 `applications` 카운트 집계 → `200 CompanyOverviewResponse` (`company`에 `id`, `name`, `industry`, `gu`, `is_demo` 포함)
- **`GET /api/company/jobs/[jobId]/applicants?policy=all` (`C02`)**:
  1. `requireUser()` + `profiles.role === 'company'` 확인
  2. `jobs`에서 `id = jobId` 조회 (없으면 `404 JOB_NOT_FOUND`) → `company_accounts`에 `(user.id, job.company_id)`가 있는지 확인 (없으면 **`403 COMPANY_ACCESS_DENIED`**)
  3. query `policy` 검증 (`all | eligible | needs_check | ineligible`, 그 외 `400 VALIDATION_ERROR`)
  4. 해당 `job_id`의 `applications` 전체 조회:
     - **필터 적용 전 전체 기준**으로 `counts: { all, eligible, needs_check, ineligible }` 집계 (`eligible + needs_check + ineligible === all`)
     - `policy !== 'all'`이면 `row.policy_snapshot.status === policy`로 필터링
     - 정렬: `fit_snapshot.score DESC (null 마지막) → created_at ASC → id ASC`
     - `row.applicant_snapshot` + `desired_categories_snapshot` + `fit_snapshot` + `policy_snapshot` + `resume_url: \`/api/applications/\${row.id}/resume\``로 `Applicant[]` 생성해 `200` 반환

### Step 2-5. `src/app/api/applications/[applicationId]/resume/route.ts` — `F01` (20분)
- **`GET /api/applications/[applicationId]/resume`**:
  1. `requireUser()` (미로그인 `401`)
  2. `applications`에서 `id = applicationId` 조회 (없으면 `404 APPLICATION_NOT_FOUND`)
  3. 권한 확인:
     - `app.youth_user_id === user.id` (지원 본인) **또는**
     - 해당 `app.job_id`의 `company_id`가 `company_accounts`에서 `user.id`와 연결되어 있음
     - 둘 다 아니면 **`403 APPLICATION_ACCESS_DENIED`**
  4. `resume_versions`에서 `id = app.resume_version_id` 조회 → `storage_path`, `original_filename` 확보 (없으면 `404 RESUME_NOT_FOUND`)
  5. `adminClient.storage.from("resumes").download(storage_path)`로 PDF Blob 다운로드 후 스트리밍 반환:
     ```ts
     return new Response(blob, {
       status: 200,
       headers: {
         "Content-Type": "application/pdf",
         "Content-Disposition": `inline; filename="${encodeURIComponent(original_filename)}"`,
         "Cache-Control": "private, no-store",
       },
     });
     ```

---

## 독립 개발 & 통합 체크포인트

1. **초반 20분 체크포인트**:
   - 트랙 1은 `src/server/auth/crypto.ts`, 트랙 2는 `src/server/policy/evaluate.ts`를 가장 먼저 작성해 `main`에 push합니다.
2. **트랙 2 단독 테스트 방법 (트랙 1 완성 전)**:
   - Supabase Auth에서 테스트 유저 1명을 만든 뒤 `profiles`, `youth_profiles`, `resume_versions`에 더미 1행([fixtures.ts](file:///Users/haing/Development/Seoul_Hackton/src/contracts/fixtures.ts)의 `resumeMatchingFixture` JSON 활용)만 SQL로 넣어두면, 트랙 1 API가 완성되기 전에도 `A01`, `Y07`, `Y08`, `C01`, `C02`, `F01` 6개 API를 처음부터 끝까지 단독으로 검증할 수 있습니다.
