-- ─────────────────────────────────────────────────────────────────────────────
-- 헥토코인 정산 — 헥토 기준 파일 "기준월" 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 hecto_coin_settlements 테이블/데이터는 전혀 손대지 않음 — nullable 컬럼 추가만.
-- ─────────────────────────────────────────────────────────────────────────────

-- 업로드된 헥토 기준 파일이 실제로 어느 달의 데이터인지를 나타내는 "기준월"
-- ('YYYY-MM'). 화면에서 보고 있는 정산월(settlement_month, 이 테이블의 키)과
-- 다를 수 있다 — 다른 월 기준 파일을 임시로 올려 비교 기능을 테스트할 때 쓴다.
-- 비어 있으면(과거 데이터 포함) 화면 정산월을 그대로 기준월로 취급한다. 순수
-- 비교(검증) 용도이며, 어떤 기존 정산 계산(first_rows/final_rows/지급상한/실제
-- 지급액)에도 관여하지 않는다.
alter table public.hecto_coin_settlements
  add column if not exists hecto_reference_month text;

comment on column public.hecto_coin_settlements.hecto_reference_month is
  '헥토 기준 엑셀의 기준월(YYYY-MM, 화면 정산월과 다를 수 있음) — 비교 전용, 비어 있으면 화면 정산월을 기본값으로 취급';
