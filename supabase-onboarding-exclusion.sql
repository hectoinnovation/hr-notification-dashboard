-- ─────────────────────────────────────────────────────────────────────────────
-- 온보딩 목록 제외 처리 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- 관리자가 온보딩 목록에서 수동으로 제외 처리한 경우 true.
-- employees 원본 데이터는 그대로 유지되며, 온보딩 목록 노출 여부에만 영향을 줍니다.
alter table public.employees
  add column if not exists is_onboarding_excluded boolean not null default false;

comment on column public.employees.is_onboarding_excluded is
  '관리자가 온보딩 목록에서 수동 제외 처리했는지 여부. 직원 데이터/메일 이력에는 영향 없음.';
