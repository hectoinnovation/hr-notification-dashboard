-- ─────────────────────────────────────────────────────────────────────────────
-- 헥토코인 정산 — 휴직자 제외 명단(leave_excluded_names) 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 hecto_coin_settlements 테이블/데이터는 전혀 손대지 않음 — nullable 컬럼 추가만.
-- ─────────────────────────────────────────────────────────────────────────────

-- 관리자가 쉼표(,) 또는 줄바꿈으로 구분해 한 번에 입력한 휴직자 이름 목록(정규화된
-- 이름, 중복 제거됨). employees/사원리스트/원본 1차·최종 포인트 파일은 전혀 건드리지
-- 않고, "선택한 정산월의 헥토코인 정산 화면/계산 단계에서만" 이 목록에 있는 이름과
-- 일치하는 직원을 제외한다 — 기존 excluded_employees(행별 휴지통 아이콘으로 제외)와
-- 기계적으로는 동일한 필터이지만 입력 경로가 다르다(아직 업로드 전인 사람도 이름만
-- 알면 미리 등록 가능). 입사/퇴사/휴직복귀 분류(employees 테이블 기반 계산)에는
-- 전혀 관여하지 않는다. 정산월별 컬럼이라 다른 달에는 영향이 없다.
alter table public.hecto_coin_settlements
  add column if not exists leave_excluded_names jsonb;

comment on column public.hecto_coin_settlements.leave_excluded_names is
  '휴직자 제외 명단 ["정규화된이름", ...] — 있으면 해당 정산월 헥토코인 정산 화면/계산에서만 제외(employees/사원리스트/원본 포인트 파일은 삭제하지 않음)';
