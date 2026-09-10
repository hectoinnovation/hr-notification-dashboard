-- ─────────────────────────────────────────────────────────────────────────────
-- 헥토코인 정산 탭 — 테이블 신규 생성
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 테이블(employees 등)에는 전혀 영향 없음 — 완전히 새로운 테이블만 추가.
-- ─────────────────────────────────────────────────────────────────────────────

-- 정산월(YYYY-MM) 단위로 1행. 1차/최종 업로드 파일의 "파싱된 원본 데이터"를 JSONB로
-- 그대로 저장하고, 화면에 보이는 지급액(지급 상한/1차·최종 지급액/추가 지급액 등)은
-- 항상 이 원본 데이터에서 매번 다시 계산한다(= lib/hecto-coin.ts computeHectoCoinEntries).
-- 계산 결과 자체를 컬럼으로 저장하지 않는 이유: 재업로드 시 "이전 계산값과 새 계산값이
-- 섞이는" 문제를 원천 차단하기 위함 — 매번 최신 first_rows/final_rows 두 원본만 보고
-- 처음부터 다시 계산하므로 항상 하나의 정답만 존재한다.
--
-- first_rows / final_rows 배열의 각 원소 형태 (lib/hecto-coin.ts HectoCoinRawRow):
--   { name, company, position, steps, points }
--   steps  = 월 누적 걸음수 (참고용, 지급액 계산에는 사용하지 않음)
--   points = 월 누적 포인트 (실제 지급액 계산 기준)
-- 입사/퇴사/휴직/복귀 날짜는 이 JSONB가 아니라 employees 테이블이 source of truth다
-- (아래 supabase-hecto-coin-roster.sql 하단에서 이 컬럼 comment를 최신 구조로 갱신한다).
create table if not exists public.hecto_coin_settlements (
  settlement_month   text primary key,  -- 'YYYY-MM' (예: '2026-09')
  first_file_name    text,
  first_uploaded_at  timestamptz,
  first_rows         jsonb,
  final_file_name    text,
  final_uploaded_at  timestamptz,
  final_rows         jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.hecto_coin_settlements is
  '헥토코인 월별 정산(1차/최종 걸음수·포인트 업로드) — 원본 파싱 데이터만 저장하고 지급액은 매번 재계산';
comment on column public.hecto_coin_settlements.first_rows is
  '1차 업로드 파일 파싱 결과 배열 [{name, company, position, steps, points, joinDate}]';
comment on column public.hecto_coin_settlements.final_rows is
  '최종(익일) 업로드 파일 파싱 결과 배열 — 컬럼 구조는 first_rows와 동일';

alter table public.hecto_coin_settlements enable row level security;

drop policy if exists "allow_all_hecto_coin_settlements" on public.hecto_coin_settlements;
create policy "allow_all_hecto_coin_settlements" on public.hecto_coin_settlements
  for all using (true) with check (true);
