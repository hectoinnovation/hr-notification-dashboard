-- ─────────────────────────────────────────────────────────────────────────────
-- 입퇴사자 관리 — 퇴사자 전적 여부(is_transfer) 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 employees 테이블/데이터는 전혀 손대지 않음 — not null 컬럼을 기본값 false로 추가.
-- ─────────────────────────────────────────────────────────────────────────────

-- 퇴사자 등록/수정 시 "일반 퇴사"(false, 기본값) / "전적 퇴사"(true)를 선택해 저장하는
-- 값. status(재직중/퇴사)·join_reason(입사/전적/휴직/휴직복귀/인턴)과는 완전히 별개의
-- 컬럼이다 — 특히 join_reason은 퇴사자(status='resigned')에 대해서는 항상 null로
-- 저장되는 기존 규칙을 그대로 유지하므로(app/page.tsx handleSubmit), 이 컬럼이 그
-- 자리를 대신한다. 입사자의 전적 여부는 기존과 동일하게 join_reason==='전적'이 그대로
-- 담당하며 이 컬럼과 무관하다(신호가 두 곳으로 나뉘어 꼬이는 것을 막기 위해 입사자에게는
-- 이 컬럼을 노출하지 않는다). not null default false라 기존 행은 전부 자동으로
-- "일반"(false)으로 처리된다.
alter table public.employees
  add column if not exists is_transfer boolean not null default false;

comment on column public.employees.is_transfer is
  '퇴사자 전적 여부(true=전적 퇴사, false=일반 퇴사, 기본값 false) — status/join_reason과 별개 컬럼. 입사자의 전적 여부는 기존처럼 join_reason=''전적''이 담당하므로 이 컬럼은 퇴사자 등록 화면에서만 사용한다.';
