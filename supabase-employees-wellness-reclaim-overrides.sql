-- ─────────────────────────────────────────────────────────────────────────────
-- 웰니스코인 환수 — 인정 종료일 수기 지정 + 인정금액/환수금액 수기 수정 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 employees 데이터는 전혀 손대지 않음 — nullable 컬럼 추가만.
-- ─────────────────────────────────────────────────────────────────────────────

-- 휴직 후 복직 없이 퇴사한 직원처럼, exit_date(퇴사일)가 실제 웰니스 인정 종료일과
-- 다른 경우를 위한 수기 지정값. 값이 있으면 퇴사일 대신 이 날짜를 기준으로
-- calcWellnessLeave를 계산한다(예: 퇴사일 10/23, 휴직시작 8/15인 경우 8/14로 지정).
-- 값이 없으면 기존처럼 퇴사일(또는 휴직자의 경우 휴직시작일-1일) 기준으로 계산한다.
alter table public.employees
  add column if not exists wellness_recognize_end_date date;

-- 인정금액/환수금액 수기 수정값 — 있으면 calcWellnessLeave 자동계산 대신 이 값을 쓴다.
-- 환수금액(wellness_reclaim_override)은 최종 정산·엑셀 다운로드·메일에도 그대로 반영된다.
alter table public.employees
  add column if not exists wellness_recognized_override numeric,
  add column if not exists wellness_reclaim_override numeric;

comment on column public.employees.wellness_recognize_end_date is
  '웰니스코인 환수 전용: 인정 종료일 수기 지정(미입력 시 퇴사일/휴직시작일-1 기준). 퇴사일(exit_date)이나 헥토코인 계산에는 영향 없음';
comment on column public.employees.wellness_recognized_override is
  '웰니스코인 환수 전용: 인정금액 수기 입력(있으면 자동계산 대신 이 값을 화면에 표시)';
comment on column public.employees.wellness_reclaim_override is
  '웰니스코인 환수 전용: 환수금액 수기 입력(있으면 자동계산 대신 이 값을 화면·최종 정산·엑셀/메일에 사용)';
