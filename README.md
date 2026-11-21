# ITDA— 청년 고용 인센티브 매칭 플랫폼

서울형 강소기업 채용공고와 청년 이력서를 AI로 정제하고, 규칙 기반 100점 적합도로 공고를 추천하는 서비스입니다.
Next.js + TypeScript + Tailwind CSS / Supabase Auth·Postgres·Storage. 화면과 API를 단일 Next.js 앱으로 배포합니다.

기준 문서: [PRD v1.4 최종본](PRD%20v1.4%20최종본.md). PRD와 노션이 다르면 노션이 정본입니다.

## 시작

Node 22 사용. 저장소 루트에서:

```sh
npm ci
cp .env.example .env.local   # 값 채우기
npm run dev
```

### 환경변수 (`.env.local`, 커밋 금지)

| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 공개 키 (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | 서버 전용 service key (`sb_secret_...`) |
| `PII_ENCRYPTION_KEY` | 이름·생년월일·주소 AES-256-GCM 암호화 키 (`openssl rand -base64 32`) |
| `OPENAI_API_KEY` | 이력서 정제용 LLM. 없으면 규칙 기반 폴백으로 동작 |

비밀 키와 암호화 키는 `NEXT_PUBLIC_` 변수에 넣지 마세요.

```sh
npm run lint
npm run typecheck
npm run build   # next build --webpack
npm start
```

## DB 적용 (Supabase SQL Editor, 순서대로)

1. `supabase/schema/companies_jobs_final.sql` — 기업·공고·카테고리·추천 뷰, GRANT 포함 (수정 시 재실행)
2. `supabase/schema/users_resumes_final.sql` — 프로필·이력서·매칭 캐시·지원·RLS·`resumes` 버킷
3. `supabase/seed/01_seed_companies.sql` — 강소기업 256개사
4. `supabase/seed/02_seed_jobs_and_matching.sql` — 크롤링 공고 81건 + `matching_json`

`supabase/schema/001_mvp_draft.sql`은 참고용 초안이며 적용 대상이 아닙니다.

## 구현 현황

**Track 1 (청년·매칭)**

| API | 경로 | 상태 |
|---|---|---|
| H01 | `GET /api/health` | 동작 |
| Y01~Y03 | `/api/youth/profile` (POST/GET/PATCH) | 구현 및 로컬 E2E 검증 완료 |
| Y04 | `PUT /api/youth/resume` | 구현 및 실 PDF + OpenAI 로컬 E2E 검증 완료 |
| Y05 | `GET /api/youth/main` | 구현 및 로컬 E2E 검증 완료 (블렌드엑스 AE 100점 `high` 1위 확인) |
| Y06 | `GET /api/youth/jobs/{jobId}` | 구현 및 로컬 E2E 검증 완료 |

**Track 2 (지원·기업)** — 구현 및 로컬 E2E 검증 완료 후 main 머지 완료 (PR #3~#6, `.gitignore`는 #2). 실 Supabase 23/23 통과, `typecheck`·`lint`·`build` 통과.

| API | 경로 | 상태 |
|---|---|---|
| A01 | `GET /api/me` | 구현 및 로컬 E2E 검증 완료 (role·onboarding·company_ids) |
| Y07 | `POST /api/applications` | 구현 및 로컬 E2E 검증 완료 (최초 201 / 중복 200, 온보딩·마감(KST)·이력서 가드, 지원 시점 스냅샷 고정) |
| Y08 | `GET /api/youth/applications` | 구현 및 로컬 E2E 검증 완료 (본인 지원 내역, 당시 스냅샷) |
| C01 | `GET /api/company/overview` | 구현 및 로컬 E2E 검증 완료 (자사 공고·지원자 수) |
| C02 | `GET /api/company/jobs/{jobId}/applicants` | 구현 및 로컬 E2E 검증 완료 (정책 필터, 점수 DESC 정렬, counts 불변식) |
| F01 | `GET /api/applications/{applicationId}/resume` | 구현 및 로컬 E2E 검증 완료 (요청마다 권한 재검증, 비공개 Storage PDF 스트리밍) |

**공통 모듈**: `src/lib/supabase/admin.ts`, `src/server/auth/` (암호화·인증·프로필), `src/server/policy/evaluate.ts` (만 18~39세, 6개월 경계 나이 추가 확인), `src/server/matching/score.ts` (직무20·역량40·경험25·경력15, 화면은 `fit_grade` 3단계), `src/server/resumes/extract.ts` (PDF 추출·정제), `src/server/applications/snapshot.ts` (지원 스냅샷 매퍼, `match_results` 캐시 → `fit_snapshot`).

**알려진 미완료**: `match_results` 캐시 채우기(Track 1 Y05 연동 전 `fit_snapshot`은 `pending` 폴백), PDF 시그니처·텍스트 없음 검증, 추천 이유 LLM 작성, 에러코드 명세 정합, 로그인·화면 UI. `CompanySummary.industry`는 전용 컬럼이 없어 `companies.business_desc`로 대체 중.

## 개발 분담

- 프론트: `src/app/` 페이지, `src/components/`, `src/features/`
- 백엔드: `src/app/api/`, `src/server/`, `supabase/`
- API 명세: [api-spec.md](docs/api-spec.md)
- 매칭·배점 규칙: [matching-spec.md](docs/matching-spec.md)
- 트랙별 작업: [backend-tracks.md](docs/backend-tracks.md)
- 설계·배포: [backend-plan.md](docs/backend-plan.md), 크롤링: [crawling-plan.md](docs/crawling-plan.md)
- 공통 계약: `src/contracts/` (`api.ts`, `matching.ts`, `taxonomy.ts`), 프론트용 가상 응답 `fixtures.ts`
- 크롤러·시드 생성: `scripts/crawl_seoul_jobs.py`, `scripts/build_initial_seed_sql.py`

## 주의

- 정책 판정은 예비진단이며 지원금 수급을 확정하지 않습니다.
- 테스트 계정이 Supabase에 남아 있으면 시연 전에 삭제하세요 (시연자 A는 현장 가입).
- `require-user.ts`는 쿠키 외에 `Authorization: Bearer`도 허용합니다(로컬 테스트용). 배포 전 유지 여부를 정하세요.

## 배포

Vercel Root Directory는 저장소 루트, Framework는 Next.js, Node는 22. Supabase Auth Site URL/redirect URL과 환경변수를 등록한 뒤 첫 배포부터 로그인·조회·PDF 업로드를 확인하세요.
