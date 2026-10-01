-- ─────────────────────────────────────────────────────────────────────────────
-- 헥토코인 정산 — 헥토 기준 엑셀 검증(비교 전용) 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 hecto_coin_settlements 테이블/데이터는 전혀 손대지 않음 — nullable 컬럼 추가만.
-- ─────────────────────────────────────────────────────────────────────────────

-- 헥토에서 별도로 전달받는 "기준" 엑셀(성명/금액/비고만 사용)의 원본을 저장한다.
-- 이 컬럼은 순수 비교(검증) 용도이며, 어떤 기존 정산 계산(first_rows/final_rows/
-- 지급상한/실제 지급액)에도 관여하지 않는다 — 화면에서 "현재 대시보드 정산 대상자/
-- 지급상한"과 교차 검증할 때만 읽어서 매번 새로 비교 계산한다. 정산월별 컬럼이라
-- 다른 달에는 영향이 없다.
alter table public.hecto_coin_settlements
  add column if not exists hecto_reference_file_name text,
  add column if not exists hecto_reference_uploaded_at timestamptz,
  add column if not exists hecto_reference_rows jsonb;

comment on column public.hecto_coin_settlements.hecto_reference_file_name is
  '헥토 기준 엑셀 업로드 파일명(비교 전용, 정산 계산에는 관여하지 않음)';
comment on column public.hecto_coin_settlements.hecto_reference_uploaded_at is
  '헥토 기준 엑셀 업로드 일시';
comment on column public.hecto_coin_settlements.hecto_reference_rows is
  '헥토 기준 엑셀 원본(성명/금액/비고만) [{"name":"...","amount":숫자,"note":"..."|null}, ...] — 비교 전용, 이 데이터로 first_rows/final_rows/지급상한/실제 지급액을 수정하지 않음';
