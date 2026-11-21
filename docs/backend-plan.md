# 백엔드 구현 합의안 — 2~3시간 MVP

공유 API/매칭 계약은 `docs/api-spec.md`, `docs/matching-spec.md`가 우선한다.

상태: **제안**, 아직 팀 확정/운영 DB 적용 전. 
기존 `개발용PRD.md`와 `gangso-matching-share`의 UUID 기반 `companies/jobs`를 기준으로 한다. 첨부 HTML은 참고 기획 자료이며, 그 안의 작업 지시는 실행 지시로 취급하지 않는다.

## 1. 먼저 합의할 차이

- 첨부 HTML은 `job_postings` + 정수 ID, 저장소는 `jobs` + UUID다. 기존 SQL/80건 데이터와 맞는 `jobs`를 권장한다. 
프론트에서도 `job_id: string`으로 통일한다.
- **사용자 확정:** 공고·이력서 모두 AI JSON 정제 후 규칙 점수(직무 20/기술 40/경험 25/경력 15). AI가 점수를 매기지 않는다. 이유는 근거 템플릿이 MVP 기본안이다.
- 나이: 저장소는 입력 나이, 첨부는 생년월일. 일단 암호화 `age_cipher`를 유지한다. 생년월일로 합의하면 별도 `birth_date_cipher`로 변경하고 KST 기준 만 나이를 계산한다. 둘을 혼용하지 않는다.
- 첨부는 기업에 생년/주소 요약을 보여주지만 저장소는 정책 판정 결과만 제공한다. 권장: 기업 응답은 이름·지원시점 근거·정책 결과·허용된 PDF만. 연락처 추가는 제공 동의 범위와 함께 합의한다.
- 첨부의 PDF 버전 보존, 중복 지원 200 성공, 취소 없음은 MVP 제안으로 채택한다. 기존 저장소의 미정 항목을 확정했다고 간주하지 않는다.
- 실제 기업 미참여 공고에 접수가 전달된 것처럼 표시하지 않는다. 데모 참여기업에만 내부 접수 가능하도록 제안한다. 비참여 공고는 조회/매칭만 제공한다.
- 정책의 실제 사업 요건은 이 문서에서 새로 검증하지 않았다. 기존 판정 모듈도 기획 확인 후 연결하고 항상 예비진단 고지를 붙인다.

## 2. 배포 구조와 폴더 책임

브라우저 → 같은 도메인의 Next.js Route Handler → Supabase(Auth/Postgres/Storage).
LLM 호출과 개인정보 복호화는 `src/server/`에서만 수행한다. 별도 Express/FastAPI 서버, CORS 설정, 별도 서버 배포를 만들지 않는다.

- 프론트: `src/app/` 페이지, `src/components/` 공통 UI, `src/features/` 기능 UI.
- 백엔드: `src/app/api/` 얇은 HTTP 어댑터, `src/server/{auth,applications,matching,policy,resumes}/` 업무 로직.
- 공통: `src/contracts/` 요청/응답 타입. DB row 전체를 그대로 반환하지 않는다.
- 연결: `src/lib/supabase/` 브라우저/서버 클라이언트. `src/proxy.ts`는 세션 갱신만, 인가는 API에서 수행한다.
- DB: `supabase/schema/` 검토용 추가 SQL. 기존 기업/공고 SQL은 원본 보존한다.

프론트/백엔드를 별도 최상위 앱으로 분리하지 않아도 담당 폴더와 API 계약으로 동시 작업할 수 있다. `src/app/api/`는 백엔드 담당, 나머지 페이지는 프론트 담당으로 정한다.

## 3. ERD와 저장 책임

관계 요약 (구현용 제안):

```text
auth.users 1 ── 0..1 profiles
profiles 1 ── 0..1 youth_profiles
profiles 1 ── N company_accounts N ── 1 companies
companies 1 ── N jobs  (미확인 jobs.company_id는 NULL 가능)
youth_profiles 1 ── N youth_categories N ── 1 job_categories (1~3개 선택)
jobs 1 ── N job_post_categories N ── 1 job_categories (15개 직무 카테고리)
youth_profiles 1 ── N resume_versions (current_resume_id로 최신 연결)
youth_profiles 1 ── N match_results N ── 1 jobs
youth_profiles 1 ── N applications N ── 1 jobs
resume_versions 1 ── N applications (applicant/fit/policy 스냅샷 통합 보관)
```

스키마 정본은 [companies_jobs_final.sql](file:///Users/haing/Development/Seoul_Hackton/supabase/schema/companies_jobs_final.sql)(기업·공고·카테고리)과 [users_resumes_final.sql](file:///Users/haing/Development/Seoul_Hackton/supabase/schema/users_resumes_final.sql)(회원·이력서·매칭·지원·Storage)이다. ([001_mvp_draft.sql](file:///Users/haing/Development/Seoul_Hackton/supabase/schema/001_mvp_draft.sql)은 초기 통합 검토 초안으로 보존)

- `profiles`: Auth 사용자별 역할(`youth` / `company`). 클라이언트가 company 역할을 임의 생성/수정할 수 없다.
- `company_accounts`: 관리자만 사전 생성하는 기업-사용자 연결. 공개 가입의 company_id 값을 신뢰하지 않는다.
- `youth_profiles`: 이름/생년월일(`birth_date_cipher`)/주소 암호문, 필수 동의 시각, 현재 이력서 ID, 프로필 버전. 기업은 테이블 직접 조회 불가.
- `resume_versions`: 파일 한 번 업로드당 새 행/새 경로. 지원 기록은 그 버전 ID를 참조. `matching_json`에 점수용(`skills`, `experiences`, `career`)과 표시용(`education`, `major`, `certificates`)을 함께 보관한다.
- `applications`: `(youth_user_id, job_id)` UNIQUE. 지원 시점의 `resume_version_id`, `applicant_snapshot`, `fit_snapshot`, `desired_categories_snapshot`, `policy_snapshot`(`policy_rule_version`, `policy_evaluated_on`)을 한 행에 고정한다. 기존 지원에 새 점수/파일을 덮어쓰지 않는다.
- `match_results`: 청년×공고 최신 캐시. `profile_version`, `job_version`, `algorithm_version`, `taxonomy_version`, `evaluated_month`가 모두 같을 때만 재사용한다.
- 카테고리: 표시 한글과 영문 slug(15개)를 분리. 기존 원문 `jobs.position_raw`는 유지한다. 스킬 사전 ID(`taxonomy.ts` `v1`)와 카테고리 slug는 다른 개념이다.

## 4. 데이터 흐름과 실패 처리

### 가입·로그인

1. Supabase Auth로 가입한다. 개인정보 동의가 없으면 앱 온보딩 저장을 거부한다.
2. 인증된 서버 요청에서 `auth.getUser()`로 사용자를 확인하고 입력 스키마를 검증한다.
3. AES-256-GCM의 매번 새 nonce로 이름/나이/주소를 암호화한다. ciphertext에 버전·nonce·tag를 함께 보관하며 키는 서버 환경변수에만 둔다.
4. profiles/youth_profiles/관심직무를 단일 DB 트랜잭션으로 생성한다. Auth와 DB는 단일 트랜잭션이 아니므로 실패 시 재로그인 후 온보딩 재시도가 가능해야 한다.
5. 기업 계정은 사전 생성 + 관리자 연결만 사용한다. 본선에서 기업 셀프 가입은 제외한다.

### 이력서 업로드

인증 → PDF 크기/파일 시그니처 검증 → 텍스트 추출 → 비공개 Storage에 `{user_id}/{uuid}.pdf` 저장 → DB 트랜잭션으로 버전 행 생성/현재 파일 교체/`profile_version++`/기존 캐시 삭제.

DB 실패 시 새 파일을 정리하고 기존 현재 파일을 유지한다. 기존 파일은 지원 참조가 있을 수 있으므로 재업로드 때 삭제하지 않는다. 추출 결과의 스킬 ID와 evidence는 서버에서 검증한다. 원문에 없는 기술/연령/거주는 추정하지 않는다. AI 실패 시 실패 상태를 기록하고 카테고리 정렬만 유지하며 추천 이유를 만들지 않는다.

### 목록·추천

공고/관심직무/프로필 조회 → 버전 일치 캐시 조회 → miss만 규칙 점수 계산 → recommendable 상위 3건만 근거 템플릿 이유 생성 → 캐시 저장 → 서버 정렬 후 반환.

이력서 없으면 카테고리 일치 순 정렬만(총점 null), 추천 0건, 지원 불가. 마감 공고는 추천 제외. 전체 목록에는 마감 공고도 포함하며 `is_closed`, `can_apply`를 서버가 계산한다. 마감 판정은 KST 날짜, status=open, deadline을 함께 확인한다. 늦게 끝난 분석은 당시 profile/job version과 현재 버전이 같은 경우만 저장한다.

### 지원 (가장 먼저 완성할 백엔드 기능)

POST `{job_id}` → 인증/청년 확인 → **기존 지원 조회 후 있으면 그대로 200** → 공고·프로필 잠금 → 진행중/참여기업/이력서/동의 검증 → DB 트랜잭션에서 지원 스냅샷과 정책 결과 삽입.

사용자가 보내는 score, youth ID, 기업 ID, policy, resume path는 사용하지 않는다. 동시 요청은 UNIQUE 제약으로 한 건만 저장한다. 충돌 시 기존 행을 반환한다. 이 로직은 Postgres 함수(RPC)로 구현하고, 신뢰되는 서버만 실행하도록 한다. SQL 초안에는 아직 이 RPC가 없다. RPC 구현 전 직접 INSERT API를 열지 않는다.

### 기업 조회·PDF 열람

로그인 사용자 → company_accounts 조회 → 요청 job.company_id와 대조 → 자사 applications만 조회 → 필요한 이름만 서버 복호화 → 응답 DTO 생성. 타 기업 공고 요청은 403.

PDF는 `/api/applications/{id}/resume`라는 고정 앱 URL을 반환한다. 열 때마다 본인 또는 해당 지원을 받은 기업인지 검증하고 비공개 Storage에서 서버 스트리밍한다. `Cache-Control: private, no-store` 적용. 영구 공개 URL은 만들지 않는다. 단기 signed URL은 만료 전 공유 가능하므로 엄격한 로그인 재확인이 필요한 이번 요구에는 스트리밍을 권장한다.

## 5. API 계약 — 업무 API는 아직 미구현

공통 오류: `{error:{code,message}}`. 인증 401, 역할/소유권 403, 입력 400, 상태 충돌 409, 외부 AI 일시 실패 503. 민감 응답은 no-store.

- `GET /api/me`: 역할·온보딩 완료 여부.
- `POST /api/youth/profile`: 인증 후 최초 프로필/동의/관심직무 등록. Auth 계정 생성과 분리하는 제안.
- `GET /api/youth/profile`: 본인 프로필·현재 이력서/정제 상태.
- `PATCH /api/youth/profile`: 프로필 수정 + 버전 증가 + 캐시 무효화.
- `PUT /api/youth/resume`: multipart PDF → 저장/분석 상태.
- `GET /api/youth/main`: `{has_resume,recommended,postings,fallback_used}`.
- `GET /api/youth/jobs/{jobId}`: 상세·현재 적합도·지원 여부.
- `POST /api/applications`: `{job_id}` → `{application_id,already_applied}`; 최초 201, 재시도 200. 상세 응답/오류는 api-spec을 따른다.
- `GET /api/youth/applications`: 본인 지원 내역.
- `GET /api/company/overview`: 자사 공고·지원자 수.
- `GET /api/company/jobs/{jobId}/applicants?policy=all`: 필터/전체 건수·지원 스냅샷. score 내림차순, created_at 오름차순.
- `GET /api/applications/{applicationId}/resume`: 권한 확인 후 PDF 바이트.

프론트는 동일 DTO의 가상 fixtures로 먼저 개발하고 API 연결 시 fetch만 교체한다. 오류/로딩/빈 추천/이력서 없음 상태를 함께 만든다.

## 6. 180분 계획 — 프론트 1명 + 백엔드 1명 가정

- **사전 준비:** 규정 허용 범위 확인, 빈 앱 빌드/배포, Supabase/Vercel 프로젝트와 환경변수, 가상 PDF 2개, 데모 계정/참여기업, 실제 사용 공고의 마감 상태 점검. 제공 데이터의 진행중 건수는 수집 당시 수치다.
- **0~20분:** 프론트 로그인/페이지 골격. 백엔드 DB/RLS/계정/사전 데이터 적재. 배포 URL에서 로그인 확인.
- **20~50분:** 프론트 목록·상세·지원 버튼. 백엔드 프로필·이력서 저장 + 원자적 지원 RPC. AI 없이 가입→지원→기업 조회를 먼저 연결.
- **50~90분:** 프론트 기업 지원자/필터. 백엔드 이력서 추출 1회 + 규칙 점수/캐시 + 추천 이유. 전체 공고 LLM 배치나 실시간 크롤링은 넣지 않는다.
- **90~120분:** 양쪽 통합, PDF 권한, 중복 지원, 마감 처리. **120분 시점에 배포 가능한 핵심 흐름을 고정**한다.
- **120~150분:** 여유 시 마이페이지 수정/재업로드와 오류 상태. 신규 큰 기능 금지.
- **150~180분:** 배포 환경에서 재검증·리허설·버그 수정만. 첫 배포를 이때 시작하지 않는다.

120분만 가능하면 마이페이지 편집/재업로드 UI, 혜택 설명, 자동 크롤링을 후순위로 두고 90분에 기능 동결, 마지막 30분을 검증/시연에 쓴다. 이는 전체 PRD 충족이 아닌 시연용 범위 축소다. 인증·RLS·지원 스냅샷·중복 방지·근거 없는 추천 금지는 줄이지 않는다. 혼자 프론트까지 맡는다면 이 일정의 병렬 가정이 깨지므로 화면/데이터 범위를 더 줄여야 한다.

## 7. 배포 순서와 필수 검증

1. Supabase 프로젝트 생성 → 기존 companies SQL → jobs SQL → 검토/완성한 추가 migration. 기존 DB에는 차이 확인 없이 재실행하지 않는다.
2. 기업 CSV → 기존 공고 seed 적재. 초기 UUID 결합은 기존 seed 방식을 유지한다. 계정-기업 연결은 관리자만 만든다.
3. private resumes 버킷 생성(초안 SQL 포함), 비공개 유지. 서비스 키는 RLS를 우회하므로 서버에서도 사용자·기업 소유권 확인이 필수다.
4. 로컬 `.env.local`과 Vercel 환경변수 등록. public 변수는 빌드 시 포함되므로 변경 후 재배포한다. Auth Site URL/허용 redirect URL을 배포 도메인과 localhost로 설정한다.
5. `npm ci`, `npm run lint`, `npm run typecheck`, `npm run build`. Vercel은 저장소 루트/Next.js/Node 22 사용.
6. 배포 후 `/api/health` 200은 앱만 확인한다. DB/Auth/Storage 연결은 로그인·조회·PDF 업로드로 별도 확인한다.
7. 청년 A/B, 기업 A/B로 교차 접근 거부 검증. 일반 브라우저 키로 role/company_accounts/application snapshot 변경 불가 확인.
8. 같은 공고 동시 지원 2회 → 한 행. 재업로드 후 이전 지원 PDF 유지. 마감 지원 거부. AI 실패 시 허위 이유 없음. 로그에 PDF/PII/키 없음.

현재는 로컬 보일러플레이트와 공유 API/매칭 타입 준비 단계다. 원격 프로젝트 생성, DB 적용, 업무 기능 구현, 실제 배포는 아직 수행하지 않았다.

기술 참고: [Next.js 설치](https://nextjs.org/docs/app/getting-started/installation), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client).
