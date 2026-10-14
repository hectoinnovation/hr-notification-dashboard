-- ─────────────────────────────────────────────────────────────────────────────
-- 입퇴사자 관리 — 전적자(입사 전적) 웰니스 부여포인트 수기 입력 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 employees 데이터는 전혀 손대지 않음 — nullable 컬럼 추가만.
-- ─────────────────────────────────────────────────────────────────────────────

-- 전적자(join_reason='전적', status='active')는 웰니스포인트 자동 계산 대상이 아니라
-- 관리자가 금액을 직접 입력한다. 값이 있으면 웰니스포인트 엑셀/메일에서 자동계산
-- 대신 이 값을 그대로 쓴다. 값이 없으면(미입력) 기존처럼 "해당 없음"으로 처리된다.
-- 전적자가 아닌 직원에게는 쓰이지 않는다.
alter table public.employees
  add column if not exists wellness_transfer_points numeric;

comment on column public.employees.wellness_transfer_points is
  '전적자(입사 전적)의 웰니스 부여포인트 수기 입력값. 값이 있으면 자동계산 대신 이 값을 웰니스포인트 엑셀/메일에 사용함. 전적자 외 직원에는 사용하지 않음';
