-- 데모용: 검증(verified) 공고를 진행중으로 개방.
-- 크롤 스냅샷의 대부분 공고가 '종료'/마감이라 시연 시 추천/목록이 비어 보이는 문제를 해소한다.
-- 운영 적재(크롤링 파이프라인)와 무관한 "시연 전용" 보정 SQL이며, 필요 시에만 실행한다.
-- 실행: Supabase SQL Editor 또는 psql 로 1회.

begin;

update public.jobs
set status = 'open',
    deadline = '2026-12-31'::date,
    updated_at = now()
where match_status = 'verified';

commit;

-- 되돌리기(필요 시): 공고 재적재 스크립트(scripts/load_jobs_to_supabase.py)로 실제 상태를 다시 반영한다.
