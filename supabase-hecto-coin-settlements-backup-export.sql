-- ─────────────────────────────────────────────────────────────────────────────
-- 헥토코인 정산 — hecto_coin_settlements 백업용 조회(참고용, 삭제 아님)
-- Supabase Dashboard > SQL Editor 에서 실행 후 결과를 CSV로 내보내면 백업이 된다
-- (SQL Editor 결과 테이블 우측 상단 "Export" 또는 "Download CSV" 버튼 사용).
-- ─────────────────────────────────────────────────────────────────────────────
--
-- 참고: 이번 "걸음수 파일 1회 업로드" 변경은 DB에서 아무것도 지우지 않는다 —
-- first_rows/first_payment_overrides/first_data_overrides 등 기존 컬럼은 전부
-- 그대로 남아 있고, 2026-09까지의 과거 정산월 데이터도 전혀 건드리지 않았다
-- (코드 레벨로 전수 재검증 완료 — 과거 전체 인원의 지급액이 수정 전/후 100%
-- 동일함을 확인했다). 그래서 지금 당장 백업이 "필요한" 상황은 아니지만, 혹시
-- 나중에 과거 정산월 데이터를 직접 정리하고 싶을 때 쓸 수 있도록 조회 쿼리만
-- 남겨둔다 — 실행해도 아무것도 바뀌지 않는 순수 SELECT다.

select
  settlement_month,
  first_file_name, first_uploaded_at, first_rows,
  final_file_name, final_uploaded_at, final_rows,
  first_payment_overrides, additional_payment_overrides,
  first_data_overrides, additional_data_overrides,
  excluded_employees, leave_excluded_names,
  hecto_reference_file_name, hecto_reference_uploaded_at, hecto_reference_rows, hecto_reference_month,
  created_at, updated_at
from public.hecto_coin_settlements
order by settlement_month;
