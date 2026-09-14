-- ─────────────────────────────────────────────────────────────────────────────
-- 헥토코인 정산 — 정산 대상 제외(excluded_employees) 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 hecto_coin_settlements 테이블/데이터는 전혀 손대지 않음 — nullable 컬럼 추가만.
-- ─────────────────────────────────────────────────────────────────────────────

-- employees/hecto_coin_roster/원본 포인트 파일(first_rows/final_rows) 등 원본 데이터는
-- 절대 건드리지 않고, "선택한 정산월의 헥토코인 정산 화면 목록에서만" 특정 직원을 빼는
-- 플래그. key는 정규화된 이름(기존 payment_overrides/data_overrides와 동일한 식별자
-- 기준) — 있으면 computeHectoCoinEntries가 UNION(포인트 파일 ∪ employees 이벤트)을
-- 전부 만든 뒤 마지막 단계에서 걸러낸다. 정산월별 컬럼이라 다른 달에는 영향이 없고,
-- 값을 지우면(복원) 원본 데이터를 다시 입력할 필요 없이 즉시 원래 행/지급액이 되살아난다.
alter table public.hecto_coin_settlements
  add column if not exists excluded_employees jsonb;

comment on column public.hecto_coin_settlements.excluded_employees is
  '정산 대상 제외 플래그 { "정규화된이름": true } — 있으면 해당 정산월 헥토코인 정산 화면/엑셀에서만 제외(employees/사원리스트/원본 포인트 파일은 삭제하지 않음)';
