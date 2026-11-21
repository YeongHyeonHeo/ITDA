-- 최종 회원·이력서·매칭·지원 DB 스키마 (Supabase SQL Editor 실행용, 멱등성 보장)
-- 선행 실행: supabase/schema/companies_jobs_final.sql (companies, jobs, job_categories, job_post_categories)
-- 기준 문서: docs/api-spec.md, docs/matching-spec.md, docs/backend-tracks.md

begin;

-- ============================================================================
-- 1. 회원 역할 & 기업 계정 연결 (profiles, company_accounts)
-- ============================================================================
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('youth','company')),
  created_at timestamptz not null default now()
);

create table if not exists public.company_accounts (
  user_id    uuid not null references public.profiles(user_id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key (user_id, company_id)
);

create index if not exists company_accounts_company_idx on public.company_accounts(company_id);

-- 기업 계정 연결(회원가입/관리자 매핑) 시 해당 기업 상태를 참여('participating', is_demo=true)로 자동 전환
create or replace function public.mark_company_participating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.companies
     set participation = 'participating',
         is_demo = true,
         updated_at = now()
   where id = new.company_id;
  return new;
end;
$$;

drop trigger if exists trg_company_accounts_participating on public.company_accounts;
create trigger trg_company_accounts_participating
  after insert on public.company_accounts
  for each row execute function public.mark_company_participating();

-- ============================================================================
-- 2. 청년 프로필 & 희망 직무 (youth_profiles, youth_categories)
-- ============================================================================
create table if not exists public.youth_profiles (
  user_id            uuid primary key references public.profiles(user_id) on delete cascade,
  name_cipher        text not null,
  birth_date_cipher  text not null,
  address_cipher     text not null,
  privacy_consent_at timestamptz not null,
  profile_json       jsonb,
  profile_version    integer not null default 1 check (profile_version > 0),
  current_resume_id  uuid,
  updated_at         timestamptz not null default now()
);

-- 기존 age_cipher 로 생성된 테이블이 있을 경우 birth_date_cipher 로 안전하게 전환
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'youth_profiles' and column_name = 'age_cipher'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'youth_profiles' and column_name = 'birth_date_cipher'
  ) then
    alter table public.youth_profiles rename column age_cipher to birth_date_cipher;
  end if;
end $$;

create table if not exists public.youth_categories (
  user_id       uuid not null references public.youth_profiles(user_id) on delete cascade,
  category_slug text not null references public.job_categories(slug),
  primary key (user_id, category_slug)
);

-- ============================================================================
-- 3. 이력서 버전 (resume_versions)
-- ============================================================================
create table if not exists public.resume_versions (
  id                uuid primary key default gen_random_uuid(),
  youth_user_id     uuid not null references public.youth_profiles(user_id) on delete cascade,
  storage_path      text not null unique,
  original_filename text not null,
  matching_json     jsonb,
  extraction_error  text,
  resume_text       text,
  extraction_status text not null default 'pending'
                      check (extraction_status in ('pending','completed','failed')),
  created_at        timestamptz not null default now(),
  unique (id, youth_user_id)
);

-- 타인의 이력서를 본인 프로필에 연결하지 못하도록 복합 FK 설정
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'current_resume_owner_fk' and conrelid = 'public.youth_profiles'::regclass
  ) then
    alter table public.youth_profiles
      add constraint current_resume_owner_fk
      foreign key (current_resume_id, user_id)
      references public.resume_versions(id, youth_user_id);
  end if;
end $$;

-- ============================================================================
-- 4. 100점 매칭 캐시 (match_results)
-- ============================================================================
create table if not exists public.match_results (
  youth_user_id     uuid not null references public.youth_profiles(user_id) on delete cascade,
  job_id            uuid not null references public.jobs(id) on delete cascade,
  fit_score         numeric(4,1) not null check (fit_score between 0 and 100),
  recommendable     boolean not null default false,
  breakdown         jsonb not null,
  needs_check       text[] not null default '{}',
  evidence          jsonb not null default '[]',
  reason            text,
  profile_version   integer not null,
  job_version       integer not null,
  algorithm_version text not null,
  taxonomy_version  text not null,
  evaluated_month   date not null check (extract(day from evaluated_month) = 1),
  computed_at       timestamptz not null default now(),
  primary key (youth_user_id, job_id)
);

-- ============================================================================
-- 5. 지원 내역 & 통합 스냅샷 (applications)
-- ============================================================================
create table if not exists public.applications (
  id                          uuid primary key default gen_random_uuid(),
  youth_user_id               uuid not null references public.youth_profiles(user_id),
  job_id                      uuid not null references public.jobs(id),
  resume_version_id           uuid not null,
  applicant_snapshot          jsonb not null,
  fit_snapshot                jsonb not null,
  desired_categories_snapshot text[] not null,
  policy_snapshot             jsonb not null,
  policy_rule_version         text not null,
  policy_evaluated_on         date not null,
  created_at                  timestamptz not null default now(),
  unique (youth_user_id, job_id),
  foreign key (resume_version_id, youth_user_id) references public.resume_versions(id, youth_user_id)
);

alter table public.applications
  add column if not exists applicant_snapshot  jsonb,
  add column if not exists policy_snapshot     jsonb,
  add column if not exists policy_rule_version text,
  add column if not exists policy_evaluated_on date;

create index if not exists applications_job_idx on public.applications(job_id);

-- ============================================================================
-- 6. RLS 및 권한 설정 (읽기는 본인/소유 기업만, 쓰기는 service_role 전용)
-- ============================================================================
do $$ declare t text; begin
  foreach t in array array[
    'profiles','company_accounts','youth_profiles','youth_categories',
    'resume_versions','match_results','applications'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

drop policy if exists own_profile on public.profiles;
create policy own_profile on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists own_company_links on public.company_accounts;
create policy own_company_links on public.company_accounts
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists own_youth_profile on public.youth_profiles;
create policy own_youth_profile on public.youth_profiles
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists own_interests on public.youth_categories;
create policy own_interests on public.youth_categories
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists own_resume on public.resume_versions;
create policy own_resume on public.resume_versions
  for select to authenticated using (youth_user_id = (select auth.uid()));

drop policy if exists own_matches on public.match_results;
create policy own_matches on public.match_results
  for select to authenticated using (youth_user_id = (select auth.uid()));

drop policy if exists scoped_applications on public.applications;
create policy scoped_applications on public.applications
  for select to authenticated using (
    youth_user_id = (select auth.uid()) or exists (
      select 1 from public.jobs j
      join public.company_accounts ca on ca.company_id = j.company_id
      where j.id = applications.job_id and ca.user_id = (select auth.uid())
    )
  );

-- ============================================================================
-- 7. 비공개 이력서 Storage 버킷 (resumes)
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

commit;
