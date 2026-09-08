-- ─────────────────────────────────────────────────────────────────────────────
-- AI 과제 결과물 다중 첨부 지원 — result_files 컬럼 신규 추가
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 ai_tasks 데이터/행에는 영향 없음 — nullable 아닌 컬럼이지만 기본값(빈 배열)으로
-- 채워지므로 기존 행도 그대로 유지된다.
-- ─────────────────────────────────────────────────────────────────────────────

-- result_file_url/result_file_name(레거시 단일 첨부)은 그대로 둔다 — 새로 제출/수정할 때마다
-- result_files의 첫 번째 파일을 이 두 컬럼에도 함께 기록해 하위 호환(관리자 화면 등 기존 코드가
-- 계속 이 두 컬럼만 읽어도 최소 1개 파일은 보이도록)을 유지한다. 화면에서는 lib/ai-tasks.ts의
-- getResultFiles()로 두 방식을 합쳐서 읽는다.
alter table public.ai_tasks add column if not exists result_files jsonb not null default '[]'::jsonb;

comment on column public.ai_tasks.result_files is
  '결과물 첨부파일 목록 [{"url":"...", "name":"..."}, ...] — 여러 개 제출 가능. 레거시 단일 첨부(result_file_url/result_file_name)와 병행 유지되며, 화면에서는 lib/ai-tasks.ts의 getResultFiles()로 병합해서 읽는다.';
