-- 최종 공고·기업 DB 적재용 스키마 (Supabase SQL Editor 실행용, 멱등성 보장)
-- 기준 문서: docs/crawling-plan.md, docs/matching-spec.md, supabase/schema/001_mvp_draft.sql
-- 기존 gangso-matching-share/db-companies.sql, db-jobs.sql 을 먼저 실행했든 안 했든 안전하게 적용됩니다.

begin;

-- ============================================================================
-- 1. 서울형 강소기업 테이블 (companies)
-- ============================================================================
create table if not exists public.companies (
  id                    uuid primary key default gen_random_uuid(),

  name                  text        not null,   -- 기업명 (舊 상호 표기 제거)
  name_norm             text        not null,   -- 정규화 기업명 — 공고 결합 키
  former_name           text,                   -- 이전 상호
  former_name_norm      text,                   -- 이전 상호 정규화

  biz_type_code         text,                   -- 업종코드: IFIDS / SRIDS / MCIDS
  business_desc         text,                   -- 사업내용
  homepage              text,                   -- 홈페이지 URL

  zip_code              text,                   -- 우편번호 5자리
  road_address          text,                   -- 도로명주소
  address_detail        text,                   -- 상세주소
  gu                    text,                   -- 자치구

  source                text        not null default 'data.seoul.go.kr/OA-23042',
  source_downloaded_at  date,
  participation         text        not null default 'non_participating'
                                      check (participation in ('participating','non_participating')),
  is_demo               boolean     not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint companies_zip_format  check (zip_code is null or zip_code ~ '^[0-9]{5}$'),
  constraint companies_biz_type    check (biz_type_code is null or biz_type_code in ('IFIDS','SRIDS','MCIDS'))
);

alter table public.companies
  add column if not exists participation text not null default 'non_participating';

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'companies_participation_check' and conrelid = 'public.companies'::regclass
  ) then
    alter table public.companies
      add constraint companies_participation_check
      check (participation in ('participating','non_participating'));
  end if;
end $$;

create unique index if not exists companies_name_gu_uniq
  on public.companies (name_norm, coalesce(gu, ''));
create index if not exists companies_name_norm_idx        on public.companies (name_norm);
create index if not exists companies_former_name_norm_idx on public.companies (former_name_norm);
create index if not exists companies_gu_idx               on public.companies (gu);

alter table public.companies enable row level security;
grant select on public.companies to anon, authenticated;
grant all on public.companies to service_role;
drop policy if exists "companies are readable by everyone" on public.companies;
create policy "companies are readable by everyone"
  on public.companies for select
  using (true);

-- ============================================================================
-- 2. 채용공고 테이블 (jobs) — 검색/표시 + 크롤링 원문 + AI 정제 결과 통합
-- ============================================================================
create table if not exists public.jobs (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid references public.companies(id) on delete set null,
  match_status         text not null default 'none'
                         check (match_status in ('verified','review','none')),
  match_method         text check (match_method in ('name_gu','address','name_only')),

  source               text not null,          -- 크롤링한 상세 페이지 URL
  source_job_id        text not null,          -- 일자리포털 구인번호(post_id) = 고용24 wantedAuthNo

  -- 기본 표시·검색 필드
  company_name         text not null,
  title                text not null,
  position_raw         text,                   -- 크롤링 원문 모집분야(position)
  preferred            text,                   -- 우대사항 원문

  employment_type_raw  text,
  employment_kind      text not null default 'unknown'
                         check (employment_kind in ('regular','probation','conversion','non_regular','unknown')),
  career_req           text,
  education_req        text,
  salary               text,
  work_address         text,
  work_gu              text,
  holiday_type         text,

  posted_at            date,
  deadline             date,
  status               text not null default 'open'
                         check (status in ('open','closed')),

  -- 상세 정보
  headcount            int,
  work_hours           text,
  selection_process    text,
  documents            text,
  notes                text,
  benefits             text,
  industry             text,
  company_homepage     text,

  -- 크롤링 변경 감지 필드 (개인/담당자 연락처 제외)
  raw_text             text,                   -- AI 매칭 입력용 섹션 조합 본문
  content_hash         text,                   -- raw_text SHA-256 해시
  crawled_at           timestamptz,            -- 마지막 정상 수집 시각

  -- AI 정제 결과·버전 관리 필드
  matching_json        jsonb,                  -- JobMatchingJson (스키마/사전/evidence 검증 완료본)
  extraction_status    text not null default 'pending'
                         check (extraction_status in ('pending','completed','failed')),
  job_version          integer not null default 1 check (job_version > 0),

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 기존 db-jobs.sql 이 먼저 적용된 경우를 위한 보강 (job_category -> position_raw 이관 포함)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'job_category'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'jobs' and column_name = 'position_raw'
  ) then
    alter table public.jobs rename column job_category to position_raw;
  end if;
end $$;

alter table public.jobs drop constraint if exists jobs_source_check;

alter table public.jobs
  add column if not exists position_raw        text,
  add column if not exists raw_text            text,
  add column if not exists content_hash        text,
  add column if not exists crawled_at          timestamptz,
  add column if not exists matching_json       jsonb,
  add column if not exists extraction_status   text not null default 'pending',
  add column if not exists job_version         integer not null default 1;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_extraction_status_check' and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_extraction_status_check
      check (extraction_status in ('pending','completed','failed'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'jobs_job_version_check' and conrelid = 'public.jobs'::regclass
  ) then
    alter table public.jobs
      add constraint jobs_job_version_check
      check (job_version > 0);
  end if;
end $$;

create unique index if not exists jobs_source_job_id_uniq    on public.jobs (source_job_id);
create index if not exists jobs_company_idx                  on public.jobs (company_id);
create index if not exists jobs_deadline_idx                 on public.jobs (deadline);
create index if not exists jobs_extraction_status_idx        on public.jobs (extraction_status);
create index if not exists jobs_status_deadline_idx          on public.jobs (status, deadline);

alter table public.jobs enable row level security;
grant select on public.jobs to anon, authenticated;
grant all on public.jobs to service_role;
drop policy if exists "jobs are readable by everyone" on public.jobs;
create policy "jobs are readable by everyone"
  on public.jobs for select
  using (true);

-- ============================================================================
-- 3. 직무 카테고리 & 공고-카테고리 매핑 (AI 정제 결과 동기화용)
-- ============================================================================
create table if not exists public.job_categories (
  slug  text primary key,
  label text not null
);

insert into public.job_categories (slug, label) values
  ('management_hr',               '경영·기획·인사'),
  ('accounting_finance',          '회계·재무'),
  ('marketing_pr',                '마케팅·홍보'),
  ('sales_customer',              '영업·고객관리'),
  ('product_md',                  '상품기획·MD'),
  ('it_data',                     'IT개발·데이터'),
  ('design',                      '디자인'),
  ('rnd_engineering',             '연구개발·설계'),
  ('production_quality',          '생산·품질'),
  ('procurement_logistics_trade', '구매·물류·무역'),
  ('construction_civil_env',      '건축·토목·환경'),
  ('medical_health',              '의료·보건'),
  ('education',                   '교육'),
  ('media_content',               '미디어·콘텐츠'),
  ('other',                       '기타')
on conflict (slug) do update set label = excluded.label;

create table if not exists public.job_post_categories (
  job_id        uuid not null references public.jobs(id) on delete cascade,
  category_slug text not null references public.job_categories(slug),
  primary key (job_id, category_slug)
);

alter table public.job_categories enable row level security;
revoke all on public.job_categories from anon, authenticated;
grant select on public.job_categories to anon, authenticated;
grant all on public.job_categories to service_role;
drop policy if exists categories_read on public.job_categories;
create policy categories_read on public.job_categories for select to authenticated using (true);

alter table public.job_post_categories enable row level security;
revoke all on public.job_post_categories from anon, authenticated;
grant select on public.job_post_categories to anon, authenticated;
grant all on public.job_post_categories to service_role;
drop policy if exists job_categories_read on public.job_post_categories;
create policy job_categories_read on public.job_post_categories for select to authenticated using (true);

-- ============================================================================
-- 4. 추천 대상 뷰 (KST 기준 진행중 + 강소기업 검증 공고)
-- ============================================================================
drop view if exists public.recommendable_jobs;
create view public.recommendable_jobs with (security_invoker = true) as
  select j.*, c.name as gangso_name, c.gu as gangso_gu, c.biz_type_code
  from public.jobs j
  join public.companies c on c.id = j.company_id
  where j.match_status = 'verified'
    and j.status = 'open'
    and (j.deadline is null or j.deadline >= (now() at time zone 'Asia/Seoul')::date);

grant select on public.recommendable_jobs to anon, authenticated;
grant all on public.recommendable_jobs to service_role;

commit;
