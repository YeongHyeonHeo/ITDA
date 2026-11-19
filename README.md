# 서울잇다 — 사전 보일러플레이트

Next.js + TypeScript + Tailwind CSS / Supabase Auth·Postgres·Storage.
화면과 API를 단일 Next.js 앱으로 배포하며 담당 폴더만 분리합니다.

## 시작

Node 22 사용. 저장소 루트에서:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

홈과 `/api/health`는 환경변수 없이 실행됩니다. 인증 관련 경로에는 Supabase URL/공개 키가 필요합니다. 비밀 키와 개인정보 암호화 키는 `NEXT_PUBLIC_` 변수에 넣지 마세요.

```sh
npm run lint
npm run typecheck
npm run build
npm start
```

빌드 스크립트는 실행 환경의 Turbopack 내부 포트 제한을 피하기 위해 `next build --webpack`을 사용합니다.

## 개발 분담

- 프론트: `src/app/` 페이지, `src/components/`, `src/features/`
- 백엔드: `src/app/api/`, `src/server/`, `supabase/`
- 공유 API 명세: [API v1](docs/api-spec.md) 
- AI JSON·규칙 배점: [매칭 명세](docs/matching-spec.md)
- 공통 계약: `src/contracts/api.ts`, `src/contracts/matching.ts`
- 프론트 가상 응답: `src/contracts/fixtures.ts` (업무 API에 연결되지 않음)
- 설계·일정·배포: [백엔드 합의안](docs/backend-plan.md)
- DB 추가 초안: [검토용 SQL](supabase/schema/)

업무 API, 로그인 UI, AI 호출, 암호화, 지원 RPC는 아직 구현하지 않았습니다. SQL은 기존 companies/jobs 이후 적용하는 **검토 초안**이며 원격 DB에는 적용하지 않았습니다.

DB 적용 후 Supabase CLI로 실제 프로젝트의 TypeScript 타입을 생성해 `src/contracts/database.types.ts`에 저장하고 두 Supabase 클라이언트의 Database 제네릭에 연결하세요. 현재 공유 타입은 API 계약 초안입니다.

Vercel 프로젝트 Root Directory는 저장소 루트, Framework는 Next.js, Node는 22로 설정합니다. Supabase Auth의 Site URL/redirect URL과 환경변수 등록 후 첫 배포부터 확인하세요. 
