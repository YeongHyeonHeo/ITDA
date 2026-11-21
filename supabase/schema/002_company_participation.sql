-- 증분 마이그레이션: 기업 참여 상태(participation) 컬럼 및 자동 참여 트리거
-- 이미 companies_jobs_final.sql, users_resumes_final.sql을 실행한 원격 DB에 실행하세요.

begin;

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

-- 기존에 company_accounts로 연결된 기업이 있다면 참여 상태로 동기화
update public.companies c
   set participation = 'participating',
       is_demo = true,
       updated_at = now()
 where exists (
   select 1 from public.company_accounts ca where ca.company_id = c.id
 );

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

commit;
