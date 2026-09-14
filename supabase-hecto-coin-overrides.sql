-- ─────────────────────────────────────────────────────────────────────────────
-- 헥토코인 정산 — 지급금액 수동 수정(override) 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 hecto_coin_settlements 테이블/데이터는 전혀 손대지 않음 — nullable 컬럼 추가만.
-- ─────────────────────────────────────────────────────────────────────────────

-- 관리자가 화면에서 개별 직원의 1차/추가 지급액을 자동 계산값 대신 직접 입력한 값.
-- key는 정규화된 이름(lib/hecto-coin.ts stripEnglishFromName 결과 — 이 기능 전체가
-- 이름 기준으로 직원/사원리스트/포인트파일을 매칭하는 것과 동일한 식별자를 그대로 쓴다.
-- 고객아이디는 사원리스트 업로드 전에는 null일 수 있어 override 키로 쓰기에 불안정하다).
-- 값이 없는 사람은 자동 계산값을 그대로 쓰고(override 없음), 있는 사람만 그 값을
-- 자동 계산값보다 우선 적용한다 — 자동 계산값 자체는 이 컬럼과 무관하게 항상 그대로
-- 다시 계산되어 화면에서 비교/복원할 수 있다.
alter table public.hecto_coin_settlements
  add column if not exists first_payment_overrides jsonb,
  add column if not exists additional_payment_overrides jsonb;

comment on column public.hecto_coin_settlements.first_payment_overrides is
  '1차 지급액 수동 수정값 { "정규화된이름": 금액 } — 있으면 자동계산값보다 우선 적용, 없으면 자동계산 사용';
comment on column public.hecto_coin_settlements.additional_payment_overrides is
  '추가 지급액 수동 수정값 — 형식/키는 first_payment_overrides와 동일';
