-- ─────────────────────────────────────────────────────────────────────────────
-- AI 과제 분류 체계 확장 — "개선 방식" 값 추가 + "과제 대분류" 컬럼 신규 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 ai_tasks 데이터/행에는 영향 없음 — 제약조건 확장과 nullable 컬럼 추가만 수행.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1) classification_type("개선 방식") 허용값 확장 ──────────────────────────
-- 기존: automation(자동화) / efficiency(효율화) / needs_review(판단 필요)
-- 추가: advancement(고도화) / new_usage(신규 활용)
-- 기존에 저장된 automation/efficiency/needs_review 값은 새 제약조건에도 그대로
-- 포함되어 있으므로 기존 데이터는 전혀 변경되지 않는다.
-- 제약조건 이름이 최초 생성 시 자동 부여된 이름과 다를 수 있어, classification_type을
-- 참조하는 check 제약을 이름에 상관없이 찾아 제거한 뒤 새 허용값으로 다시 만든다.
do $$
declare con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.ai_tasks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%classification_type%'
  loop
    execute format('alter table public.ai_tasks drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.ai_tasks add constraint ai_tasks_classification_type_check
  check (classification_type in ('automation','efficiency','advancement','new_usage','needs_review'));

comment on column public.ai_tasks.classification_type is
  '개선 방식 1차 분류 (automation=자동화/efficiency=효율화/advancement=고도화/new_usage=신규 활용/needs_review=판단 필요) — AI 또는 관리자가 지정';

-- ── 2) task_category("과제 대분류") 신규 컬럼 ────────────────────────────────
-- classification_type(개선 방식)과는 별개 축 — 과제가 어떤 형태의 AI 활용인지 묶어보기 위한 분류.
-- 관리자가 /admin/task-analysis, /admin/tasks 화면에서 직접 선택/수정한다 (AI 자동 분류 없음).
alter table public.ai_tasks add column if not exists task_category text;

do $$
declare con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'public.ai_tasks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%task_category%'
  loop
    execute format('alter table public.ai_tasks drop constraint %I', con.conname);
  end loop;
end $$;

alter table public.ai_tasks add constraint ai_tasks_task_category_check
  check (task_category in (
    'agent_bot',                    -- Agent·업무봇
    'monitoring_alert',              -- 모니터링·알림
    'data_collection_analysis',      -- 데이터 수집·분석
    'document_content_generation',   -- 문서·콘텐츠 생성
    'dev_test_automation',           -- 개발·테스트 자동화
    'process_operations',            -- 업무 프로세스·운영
    'etc'                            -- 기타
  ));

create index if not exists idx_ai_tasks_task_category on public.ai_tasks (task_category);

comment on column public.ai_tasks.task_category is
  '과제 대분류 (agent_bot/monitoring_alert/data_collection_analysis/document_content_generation/dev_test_automation/process_operations/etc) — 관리자가 직접 지정, null=미분류';
