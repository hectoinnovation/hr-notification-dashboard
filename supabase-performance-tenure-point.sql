-- ─────────────────────────────────────────────────────────────────────────────
-- 성과포인트 / 근속포인트 퇴사자 정산 대상 여부 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

-- 퇴사자 등록/수정 화면에서 담당자가 직접 체크하는 정산 대상 여부.
-- 모든 퇴사자가 자동으로 대상이 되는 것이 아니라 담당자가 개별 확인 후 표시한다.
-- not null default false라 기존 직원 데이터는 전부 false로 채워지고 전혀 영향받지 않는다.
alter table public.employees
  add column if not exists performance_point_target boolean not null default false;

alter table public.employees
  add column if not exists tenure_point_target boolean not null default false;

comment on column public.employees.performance_point_target is
  '퇴사자 성과포인트 정산 대상 여부 — 담당자가 퇴사자 등록/수정 화면에서 직접 체크. 기존 직원은 기본값 false.';

comment on column public.employees.tenure_point_target is
  '퇴사자 근속포인트 정산 대상 여부 — 담당자가 퇴사자 등록/수정 화면에서 직접 체크. 기존 직원은 기본값 false.';
