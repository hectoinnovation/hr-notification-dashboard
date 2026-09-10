-- ─────────────────────────────────────────────────────────────────────────────
-- 헥토코인 정산 — 사원리스트(고객아이디 매핑) 테이블 신규 생성
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 테이블(employees, hecto_coin_settlements 등)에는 전혀 영향 없음 — 새 테이블만 추가.
-- ─────────────────────────────────────────────────────────────────────────────

-- 정산월과 무관하게 유지되는 전역 매핑 1행 — 기존 cafe_excel_data와 동일한
-- "id='singleton' 1행을 통째로 upsert" 패턴이다. 사원리스트를 재업로드하면 이 1행만
-- 최신 파일 기준으로 교체되고, 다음 달 헥토코인 정산에서도 그대로 재사용된다.
-- employees.customer_id가 이미 채워져 있는 직원은 이 테이블에 없어도 그 값을 그대로
-- 활용한다(lib/hecto-coin.ts matchCustomerId — 사원리스트 우선, 없으면 employees.customer_id).
create table if not exists public.hecto_coin_roster (
  id            text primary key,   -- 항상 'singleton'
  file_name     text,
  uploaded_at   timestamptz,
  entries       jsonb,              -- [{name, customerId}] — name은 영문 제거 후 정규화된 이름
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.hecto_coin_roster is
  '헥토코인 정산 전용 사원리스트(이름→고객아이디) 매핑 — 정산월과 무관한 전역 1행, 재업로드 시 통째로 교체';
comment on column public.hecto_coin_roster.entries is
  '사원리스트 파싱 결과 [{name, customerId}] — name은 stripEnglishFromName으로 정규화된 이름';

alter table public.hecto_coin_roster enable row level security;

drop policy if exists "allow_all_hecto_coin_roster" on public.hecto_coin_roster;
create policy "allow_all_hecto_coin_roster" on public.hecto_coin_roster
  for all using (true) with check (true);

-- ── hecto_coin_settlements 컬럼 comment 최신화 (테이블 구조는 변경하지 않음) ──────
-- 이번 개편으로 헥토코인 원본 파일의 입사일 컬럼을 더 이상 사용하지 않게 되어(입사/퇴사/
-- 휴직/복귀는 employees가 source of truth), first_rows/final_rows JSONB 각 원소에서
-- joinDate 필드가 빠졌다. comment on column은 문서 성격이라 재실행해도 데이터에는
-- 전혀 영향이 없다.
comment on column public.hecto_coin_settlements.first_rows is
  '1차 업로드 파일 파싱 결과 배열 [{name, company, position, steps, points}] — 입사/퇴사/휴직/복귀 날짜는 employees 테이블 참조';
comment on column public.hecto_coin_settlements.final_rows is
  '최종(익일) 업로드 파일 파싱 결과 배열 — 컬럼 구조는 first_rows와 동일';
