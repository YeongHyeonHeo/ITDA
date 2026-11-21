# JOB잇다 (서울잇다) 백엔드 13개 API 전수 E2E 테스트 계획서

> **목적:** Track 1(`Y01`~`Y06`)과 Track 2(`A01`, `Y07`, `Y08`, `C01`, `C02`, `F01`) 및 헬스체크(`H01`) **전체 13개 API**를 실제 Supabase(Auth·Postgres·Storage) 및 OpenAI 환경에서 전수 검증합니다.
> - **계약 정본:** [api-spec.md](file:///Users/haing/Development/Seoul_Hackton/docs/api-spec.md), [matching-spec.md](file:///Users/haing/Development/Seoul_Hackton/docs/matching-spec.md), [backend-tracks.md](file:///Users/haing/Development/Seoul_Hackton/docs/backend-tracks.md)
> - **PRD 기준:** [PRD v1.4 최종본.md](file:///Users/haing/Development/Seoul_Hackton/PRD%20v1.4%20%EC%B5%9C%EC%A2%85%EB%B3%B8.md) (13-1 P0 완료 체크리스트 13개 항목 100% 포함)

---

## 1. 원격 DB 보호 및 테스트 격리 원칙

1. **시드 데이터 읽기 전용 (Read-Only)**
   - 원격 DB에 적재된 `companies`(256건), `jobs`(81건), `job_categories`(15건), `job_post_categories`(210건)는 **절대 수정하거나 삭제하지 않고 조회만 수행**합니다.
2. **격리된 임시 계정 사용 (`e2e_*_<timestamp>@itda.kr`)**
   - 시연용 실제 계정 이메일과 충돌하지 않도록 실행 시점 타임스탬프가 붙은 임시 계정 3개(`Youth A`, `Youth C`, `Company BlendX`)를 생성해 테스트합니다.
3. **100% 원상복구 (`finally` 클린업 보장)**
   - 테스트 성공·실패 여부와 무관하게 `finally` 블록에서 아래 순서로 임시 데이터를 모두 삭제합니다:
     1. 테스트 중 생성된 `applications` 행 삭제 (`youth_user_id IN (...)` — FK 제약 해제)
     2. 테스트 중 `participating`으로 바뀐 기업(`블렌드엑스`)의 `participation` / `is_demo`를 원래 상태로 복구
     3. Storage `resumes` 버킷에 업로드된 테스트 PDF 파일 삭제
     4. 임시 생성한 Supabase Auth 유저 3명 `deleteUser` 삭제 (`profiles`, `youth_profiles`, `youth_categories`, `resume_versions`, `match_results`, `company_accounts`는 `ON DELETE CASCADE`로 자동 정리)

---

## 2. 테스트 픽스처 (계정 3종 · 대상 공고 3종)

### 2.1 임시 테스트 계정 3종

| 식별자 | 역할 (`role`) | 프로필 설정 | 검증 목적 |
| :--- | :---: | :--- | :--- |
| **`Youth A`** | `youth` | 이름: `강서울` / 생년월일: `1997-03-14` (만 29세) / 주소: `서울특별시 마포구` / 희망직무: `["marketing_pr"]` / PDF: `이력서_A_강서울_디지털캠페인AE.pdf` | • 정책 `eligible` (`충족 가능`)<br>• 블렌드엑스 AE 공고 **100점 (`high`)** 추천 1위<br>• 지원·중복 연타·스냅샷 불변성·본인 PDF 열람 |
| **`Youth C`** | `youth` | 이름: `최윤서` / 생년월일: `1987-03-10` (만 39세, **4개월 뒤 만 40세 경계 나이**) / 주소: `서울특별시 성동구` / 희망직무: `["design"]` | • 정책 **`needs_check` (`추가 확인 필요` — 6개월 경계 나이 룰)**<br>• 타인(`Youth A`) 지원서 PDF 열람 시 **`403 APPLICATION_ACCESS_DENIED`** 검증<br>• 기업 `C02` 정책 필터(`eligible` vs `needs_check`) 검증 |
| **`Company BlendX`** | `company` | `POST /api/company/profile`로 **`주식회사 블렌드엑스`** 회원가입 연결 | • 가입 시 `companies.participation = 'participating'`(`is_demo = true`) 자동 전환<br>• `A01`, `C01`, `C02` 자사 지원자 조회 및 자사 지원자 PDF 열람(`200`)<br>• 타사(엔디컴퍼니) 공고 조회 시 **`403 COMPANY_ACCESS_DENIED`** 검증 |

### 2.2 대상 공고 3종 (원격 DB에서 동적 조회)

| 구분 | 조회 조건 | 검증 목적 |
| :--- | :--- | :--- |
| **`Open Job (BlendX AE)`** | `company_name = '주식회사 블렌드엑스'` & `title ILIKE '%디지털 캠페인 AE%'` & `status = 'open'` | 추천 1위 매칭, 정상 지원(`201`), 중복 지원(`200`), 기업 지원자 목록(`C02`) 조회 |
| **`Closed Job`** | `match_status = 'verified'` & (`status = 'closed'` OR `deadline < todayKST`) 중 1건 | 추천 TOP 3 제외 확인, 지원 시도 시 **`409 POSTING_CLOSED`** 확인 |
| **`Other Company Job`** | `match_status = 'verified'` & `company_id != 블렌드엑스` (예: `주식회사 엔디컴퍼니`) 중 1건 | 블렌드엑스 기업 계정으로 `C02` 요청 시 **`403 COMPANY_ACCESS_DENIED`** 확인 |

---

## 3. 단계별 전수 테스트 시나리오 (Phase 0 ~ Phase 6, 총 30개 케이스)

### Phase 0. 서버 헬스체크 & DB 시드 상태 점검 (3건)

| 코드 | 대상 API / 테이블 | 입력 / 조건 | 기대 결과 (Pass 기준) |
| :---: | :--- | :--- | :--- |
| **T01** | `H01` `GET /api/health` | 인증 없이 호출 | `200 OK`, `status === "ok"` |
| **T02** | DB 시드 테이블 | `companies`, `jobs`, `job_categories`, `job_post_categories` 카운트 | `companies = 256`, `jobs = 81`, `job_categories = 15`, `job_post_categories >= 200` |
| **T03** | 시연 대상 공고 | `Open Job (BlendX AE)`, `Closed Job`, `Other Company Job`, `Non-Participating Open Job` 조회 | 4종 모두 유효한 UUID와 `matching_json` 존재 |
| **C00** | `GET /api/companies`<br>`POST /api/company/profile` | ① 기업 목록 `?q=블렌드엑스` 조회<br>② 미로그인(401) · 없는 기업 UUID(404)<br>③ `Company BlendX` 정상 회원가입(201) · 중복 가입(409)<br>④ `Youth A` 청년 계정으로 기업 가입 시도(403) | ① `200`, 블렌드엑스 포함<br>② `401 UNAUTHORIZED`, `404 COMPANY_NOT_FOUND`<br>③ `201`, `company.participation === "participating"`, `is_demo === true` 전환 + 중복 시 `409 PROFILE_ALREADY_EXISTS`<br>④ `403 ROLE_FORBIDDEN` |

---

### Phase 1. 인증 · 내 역할(`A01`) · 온보딩 전 가드 (5건)

| 코드 | 대상 API | 호출 주체 / 입력 | 기대 HTTP & 응답 |
| :---: | :--- | :--- | :--- |
| **T04** | `A01` `GET /api/me` | 미로그인 (토큰 없음) | `401 UNAUTHORIZED` |
| **T05** | `A01` `GET /api/me` | `Youth A` (Auth 가입 직후, 온보딩 전) | `200 OK`, `{ role: null, onboarding_complete: false, company_ids: [] }` |
| **T06** | `Y02` `GET /api/youth/profile` | `Youth A` (온보딩 전) | `409 ONBOARDING_REQUIRED` |
| **T07** | `Y05` `GET /api/youth/main` | `Youth A` (온보딩 전) | `409 ONBOARDING_REQUIRED` |
| **T08** | `Y07` `POST /api/applications` | `Youth A` (온보딩 전) + `{ job_id: OpenJobId }` | `409 ONBOARDING_REQUIRED` |

---

### Phase 2. 청년 프로필 온보딩 · PII 암호화 · 수정 (`Y01`~`Y03`) (7건)

| 코드 | 대상 API | 호출 주체 / 입력 | 기대 HTTP & 검증 포인트 |
| :---: | :--- | :--- | :--- |
| **T09** | `Y01` `POST /api/youth/profile` | `Youth A` + `privacy_consent: false` | `400 CONSENT_REQUIRED` |
| **T10** | `Y01` `POST /api/youth/profile` | `Youth A` + 중복 카테고리 `["marketing_pr", "marketing_pr"]` | `400 VALIDATION_ERROR` |
| **T11** | `Y01` `POST /api/youth/profile` | `Company BlendX` (기업 계정) | `403 ROLE_FORBIDDEN` |
| **T12** | `Y01` `POST /api/youth/profile` | `Youth A` 정상 입력 (`1997-03-14`, `서울특별시 마포구`, `["marketing_pr"]`) | `201 Created`, `age === 29`, `youth_policy.status === "eligible"`, `profile_version === 1`<br>• DB `youth_profiles`의 `name_cipher`, `birth_date_cipher`, `address_cipher`에 평문이 아닌 `iv:tag:cipher` 암호문 저장 확인 |
| **T13** | `Y01` `POST /api/youth/profile` | `Youth A` 동일 요청 재호출 | `409 PROFILE_ALREADY_EXISTS` |
| **T14** | `A01` & `Y02` | `Youth A` 온보딩 후 `GET /api/me` 및 `GET /api/youth/profile` | • `A01`: `role === "youth"`, `onboarding_complete === true`<br>• `Y02`: `200 OK`, 복호화된 `name: "강서울"`, `birth_date: "1997-03-14"`, `address: { sido: "서울특별시", sigungu: "마포구" }` 일치 |
| **T15** | `Y03` `PATCH /api/youth/profile` | • 빈 객체 `{}` 전송<br>• `Youth C` 온보딩(`1987-03-10`, 만 39세 경계 나이) 후 확인 | • 빈 객체: `400 VALIDATION_ERROR`<br>• `Youth C` 정책 판정: **`youth_policy.status === "needs_check"` (`items.age === "unknown"`)** |

---

### Phase 3. 이력서 업로드 · AI 정제 · 100점 매칭 · 캐시 (`Y04`~`Y06`) (6건)

| 코드 | 대상 API | 호출 주체 / 입력 | 기대 HTTP & 검증 포인트 |
| :---: | :--- | :--- | :--- |
| **T16** | `Y05` `GET /api/youth/main` | `Youth A` (이력서 업로드 전) | `200 OK`, `has_resume === false`, `recommended: []` (0건), 모든 공고 `match.status === "no_resume"`, `score === null`, `can_apply === false`, `apply_block_reason`이 `"resume_required"`(또는 마감은 `"closed"`) |
| **T17** | `Y07` `POST /api/applications` | `Youth A` (이력서 업로드 전) + `{ job_id: OpenJobId }` | `400 RESUME_REQUIRED` |
| **T18** | `Y04` `PUT /api/youth/resume` | `Youth A` + ① 비-PDF(`bad.txt`) ② 텍스트 없는 빈 PDF ③ 5MiB 초과 파일 | ① `415 UNSUPPORTED_FILE_TYPE` (`%PDF-` 불일치)<br>② `400 PDF_TEXT_EMPTY`<br>③ `413 FILE_TOO_LARGE` |
| **T19** | `Y04` `PUT /api/youth/resume` | `Youth A` + 실제 시연 PDF (`이력서_A_강서울_디지털캠페인AE.pdf`) | `200 OK`, `extraction_status === "completed"`, `profile_version === 2`<br>• `matching_json.skills` (`digital_marketing`, `communication` 등) 추출 및 모든 `evidence` 원문 포함 확인<br>• `matching_json.career.declared_total_months === 44` |
| **T20** | `Y05` `GET /api/youth/main` | `Youth A` (이력서 업로드 후 1차·2차 호출) | `200 OK`, `has_resume === true`<br>• `recommended`: 1~3건 (마감 공고 0건), 1위 = 블렌드엑스 `디지털 캠페인 AE` (`score === 100`, `fit_grade === "high"`)<br>• **TOP 3에만 개인 이력서(경험 제목·`evidence`·역량·자격증) 기반 `match.reason` 존재**, 4위 이하는 `match.reason === null`<br>• DB `match_results` 테이블에 79건 캐시 저장 확인 및 2차 호출 시 캐시 히트(응답 시간 단축) 확인 |
| **T21** | `Y06` `GET /api/youth/jobs/[jobId]` | • 없는 UUID 조회<br>• `Open Job (BlendX AE)` 조회 | • 없는 UUID: `404 JOB_NOT_FOUND`<br>• `Open Job`: `200 OK`, `match.score === 100`, `match.fit_grade === "high"`, `match.reason` 포함, `can_apply === true` |

---

### Phase 4. 공고 지원 · 연타 방어 · 캐시 미스 실시간 계산 · 스냅샷 불변성 (`Y07`, `Y08`) (5건)

| 코드 | 대상 API | 호출 주체 / 입력 | 기대 HTTP & 검증 포인트 |
| :---: | :--- | :--- | :--- |
| **T22** | `Y06` & `Y07` | ① `Youth A` + `{ job_id: ClosedJobId }` (마감 공고)<br>② 미참여 기업 열림 공고(`(주)아크메디코리아`) 상세(`Y06`) & 지원(`Y07`) | ① `409 POSTING_CLOSED`<br>② `Y06`: `company.participation === "non_participating"`, `can_apply === false`, `apply_block_reason === "company_not_participating"`, `external_url`에 실제 외부 채용 링크 포함<br>   `Y07`: **`403 COMPANY_NOT_PARTICIPATING`** |
| **T23** | `Y07` `POST /api/applications` | `Youth A` + `{ job_id: OpenJobId }` (최초 지원) | `201 Created`, `{ application_id, already_applied: false }`<br>• 지원 후 `Y06` 재조회 시 `applied === true`, `can_apply === false`, `apply_block_reason === "already_applied"` |
| **T24** | `Y07` `POST /api/applications` | `Youth A` + `{ job_id: OpenJobId }` (**동시 2회 연타 / 재호출**) | **`200 OK`**, `{ application_id: <동일 ID>, already_applied: true }`<br>• DB `applications` 테이블에 `(youth_user_id, job_id)` 행이 정확히 **1건만** 존재하는지 확인 |
| **T25** | `Y03` → `Y07` (캐시 미스 지원) | `Youth C` 이력서 등록 후 `Y03 PATCH`로 `match_results` 캐시를 비운 직후, `Y05`를 거치지 않고 바로 `Y07`로 `Open Job` 지원 | `201 Created`<br>• 캐시가 비어 있었음에도 실시간 `calculateMatchScore`가 동작해 DB `applications.fit_snapshot.status === "ready"` 및 `score !== null`, `fit_grade !== null`로 저장되는지 확인 |
| **T26** | `Y03` → `Y08` (스냅샷 불변성) | `Youth A`가 지원 완료 후 `Y03 PATCH`로 희망직무를 전혀 다른 직무(`["it_data"]`)로 변경한 뒤 `Y08 GET /api/youth/applications` 조회 | • `Youth A`의 현재 프로필(`Y02`)은 `desired_categories: ["it_data"]`, `profile_version: 3`으로 변경됨<br>• 하지만 **`Y08` 지원 내역의 `match_snapshot.score`는 지원 당시 `100`점(`profile_version: 2`) 그대로 불변 유지** 확인 |

---

### Phase 5. 기업 대시보드 · 정책 필터 · 타사 공고 403 차단 (`C01`, `C02`) (3건)

| 코드 | 대상 API | 호출 주체 / 입력 | 기대 HTTP & 검증 포인트 |
| :---: | :--- | :--- | :--- |
| **T27** | `C01` & `C02` | `Youth A` (청년 계정)로 기업 API 호출 | `403 ROLE_FORBIDDEN` |
| **T28** | `C01` & `C02` | `Company BlendX`로 `GET /api/company/overview` 및 `GET /api/company/jobs/{OpenJobId}/applicants` (`?policy=all`, `eligible`, `needs_check`, `invalid`) | • `C01`: 블렌드엑스 `is_demo === true`, `OpenJobId`의 `applicant_count >= 2` 및 **`job_policy.status === "eligible"` (`regular === "pass"`)** 확인<br>• `C02 (?policy=all)`: **`job.job_policy.status === "eligible"`** 확인, `counts.all === counts.eligible + counts.needs_check + counts.ineligible` 일치, 지원자 목록이 `match_snapshot.score DESC` 순(`Youth A` 100점 `eligible` → `Youth C` `needs_check`) 정렬 확인<br>• `C02 (?policy=eligible)`: `Youth A`만 반환되고 `counts`는 전체 기준 유지 확인<br>• `C02 (?policy=needs_check)`: `Youth C`만 반환 확인<br>• `C02 (?policy=invalid)`: `400 VALIDATION_ERROR` |
| **T29** | `C02` (교차 권한 차단) | `Company BlendX` 계정으로 **타사 공고(`OtherCompanyJobId`)** 지원자 목록 조회 | **`403 COMPANY_ACCESS_DENIED`** (PRD D-29 필수 체크항목) |

---

### Phase 6. 지원 당시 이력서 PDF 스트리밍 권한 검증 (`F01`) (1건 · 4분기)

| 코드 | 대상 API | 호출 주체 / 입력 | 기대 HTTP & 검증 포인트 |
| :---: | :--- | :--- | :--- |
| **T30** | `F01` `GET /api/applications/{appId}/resume` | ① **지원 본인 (`Youth A`)**<br>② **공고 소유 기업 (`Company BlendX`)**<br>③ **타인 청년 (`Youth C`)**<br>④ **없는 `applicationId` UUID** | ① 본인: `200 OK`, `Content-Type: application/pdf`, 첫 5바이트 `%PDF-` 일치<br>② 소유 기업: `200 OK`, `Content-Type: application/pdf`, 첫 5바이트 `%PDF-` 일치<br>③ 타인 청년: **`403 APPLICATION_ACCESS_DENIED`**<br>④ 없는 UUID: **`404 APPLICATION_NOT_FOUND`** |

---

## 4. 실행 방법

```bash
# 1. 로컬 Next.js 개발 서버 실행 (포트 3000)
npm run dev

# 2. 별도 터미널에서 전수 E2E 테스트 스크립트 실행
node scripts/test_e2e_api.js
```

## 5. 합격 기준 (Pass Criteria)
- **T01 ~ T30 총 30개 검증 항목 100% 통과 (실패 0건)**
- 테스트 종료 후 임시 생성한 `applications`, Storage PDF, Auth 계정 3개가 모두 삭제되어 원격 DB에 잔여 테스트 데이터가 0건일 것.
