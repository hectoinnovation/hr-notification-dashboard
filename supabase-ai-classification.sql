-- ─────────────────────────────────────────────────────────────────────────────
-- AI 과제 분석(자동화/효율화 분류) 기능 — 컬럼 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 ai_tasks 데이터/행에는 영향 없음 — nullable 컬럼 추가만 수행.
-- ─────────────────────────────────────────────────────────────────────────────

-- classification_type/classification_reason 은 "AI 활용" 원본 기능의 ai_usage_* 컬럼과
-- 전혀 다른 목적이다 — 혼동 금지: ai_usage_* = 과제 등록 시 작성한 개선 방향(사람이 입력),
-- classification_* = 관리자가 "AI 분류 실행"을 눌렀을 때 Claude가 과제를 읽고 매긴 1차 분류.
alter table public.ai_tasks add column if not exists classification_type text
  check (classification_type in ('automation','efficiency','needs_review'));
alter table public.ai_tasks add column if not exists classification_reason text;
alter table public.ai_tasks add column if not exists classification_by text
  check (classification_by in ('ai','admin'));
alter table public.ai_tasks add column if not exists classified_at timestamptz;

create index if not exists idx_ai_tasks_classification_type on public.ai_tasks (classification_type);

comment on column public.ai_tasks.classification_type is '자동화/효율화 1차 분류 (automation/efficiency/needs_review) — AI 또는 관리자가 지정';
comment on column public.ai_tasks.classification_by is '마지막으로 분류를 지정한 주체 (ai=AI 분류 실행 결과, admin=관리자가 직접 수정)';
