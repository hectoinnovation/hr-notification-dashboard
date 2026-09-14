-- ─────────────────────────────────────────────────────────────────────────────
-- 헥토코인 정산 — 걸음수/포인트 수동 보정값(data override) 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 hecto_coin_settlements 테이블/데이터는 전혀 손대지 않음 — nullable 컬럼 추가만.
-- (hecto_coin_roster는 이미 jsonb라 스키마 변경 없이 각 항목에 source 필드만 추가한다.)
-- ─────────────────────────────────────────────────────────────────────────────

-- employees UNION으로 추가됐지만 헥토코인 포인트 파일에는 없는 직원(예: 황태석)의
-- 걸음수/포인트를 관리자가 직접 입력한 값. key는 정규화된 이름(기존 payment_overrides와
-- 동일한 식별자 기준). 있으면 업로드된 포인트 파일 값보다 우선 적용되고, 없으면 파일값을
-- 그대로 쓴다 — "지급액 수동 수정(payment_overrides)"과는 완전히 별개 컬럼/개념이다:
-- 이건 원천 데이터(걸음수/포인트) 보정이고, payment_overrides는 계산된 지급액 자체의
-- 최종 보정이다. 두 override는 함께 적용될 수 있다.
-- 컬럼명은 기존 first_payment_overrides/additional_payment_overrides와 동일한 명명
-- 규칙(1차=first, 최종 단계=additional)을 그대로 따른다.
alter table public.hecto_coin_settlements
  add column if not exists first_data_overrides jsonb,
  add column if not exists additional_data_overrides jsonb;

comment on column public.hecto_coin_settlements.first_data_overrides is
  '1차 걸음수/포인트 수동 보정값 { "정규화된이름": {"steps": 숫자|null, "points": 숫자} } — 있으면 1차 포인트 파일 값보다 우선 적용';
comment on column public.hecto_coin_settlements.additional_data_overrides is
  '최종(추가 지급 단계) 걸음수/포인트 수동 보정값 — 형식/키는 first_data_overrides와 동일';
