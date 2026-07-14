-- ─────────────────────────────────────────────────────────────────────────────
-- AI 과제 관리 기능 — 테이블 생성
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists pgcrypto;

-- ── ai_tasks ────────────────────────────────────────────────────────────────
-- AI 활용 과제의 현재 상태를 담는 메인 테이블.
-- 담당자/우선순위를 컬럼으로 직접 보유해 목록 화면에서 조인 없이 렌더링한다.
-- 변경 이력은 ai_assignments에 별도로 남긴다 (이 테이블 값이 항상 최신 source of truth).
--
-- 두 축을 혼동하지 말 것:
--   status          = 진행 상태  (in_progress=진행중 / done=완료)
--   resolution_type = 해결 방식  (self=자체 해결 / help=도움 필요)
create table if not exists public.ai_tasks (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  team                text not null,                          -- 팀 (자유 텍스트, 고정 목록 없음)
  author              text not null,                          -- 등록자 (자유 텍스트, 로그인 계정 없음)
  resolution_type     text not null check (resolution_type in ('self','help')),        -- 해결 방식: 자체 해결 | 도움 필요
  status              text not null default 'in_progress' check (status in ('in_progress','done')),  -- 진행 상태: 진행중 | 완료

  -- 등록 시 입력 항목
  current_work        text,        -- 현재 업무
  problem_definition   text,        -- 문제 정의
  expected_effect      text,        -- 기대 효과
  ai_plan              text,        -- AI 활용 계획

  -- 완료 처리 시 입력 항목
  result_content       text,        -- 개발 결과
  ai_used              text,        -- 사용한 AI (ChatGPT/Claude/Cursor 등, 자유 텍스트)
  completed_at         date,

  -- 관리자 전용 관리 필드 (도움 필요 과제 운영) — 항상 최신값. 변경 이력은 ai_assignments 참고.
  assignee             text,        -- 담당자
  priority             text not null default 'medium' check (priority in ('urgent','high','medium','low')),  -- 긴급 | 높음 | 보통 | 낮음

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_ai_tasks_status          on public.ai_tasks (status);
create index if not exists idx_ai_tasks_resolution_type  on public.ai_tasks (resolution_type);
create index if not exists idx_ai_tasks_team             on public.ai_tasks (team);
create index if not exists idx_ai_tasks_created_at       on public.ai_tasks (created_at desc);
create index if not exists idx_ai_tasks_completed_at     on public.ai_tasks (completed_at desc);
create index if not exists idx_ai_tasks_priority         on public.ai_tasks (priority);

comment on table public.ai_tasks is 'AI 활용 과제. status=진행 상태(진행중/완료), resolution_type=해결 방식(자체해결/도움필요) — 서로 다른 축이니 혼동 금지';

-- ── ai_guides ───────────────────────────────────────────────────────────────
-- "AI 활용 방법" 페이지에 노출되는 관리자 큐레이션 콘텐츠 카드.
create table if not exists public.ai_guides (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text not null check (category in ('영상','문서','블로그','프롬프트','기타')),
  description   text,
  url           text not null,
  sort_order    integer not null default 0,     -- 노출 순서 조정용
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_ai_guides_category   on public.ai_guides (category);
create index if not exists idx_ai_guides_sort_order  on public.ai_guides (sort_order);

comment on table public.ai_guides is 'AI 활용 방법 페이지에 노출되는 관리자 큐레이션 가이드 카드';

-- ── ai_assignments ──────────────────────────────────────────────────────────
-- 담당자/우선순위 변경 이력 (append-only 감사 로그).
-- ai_tasks의 현재값이 source of truth이고, 이 테이블은 "누가 언제 무엇을 바꿨는지"만 기록.
create table if not exists public.ai_assignments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.ai_tasks(id) on delete cascade,
  assignee      text,
  priority      text check (priority in ('urgent','high','medium','low')),
  changed_by    text,                              -- 변경한 관리자 (자유 텍스트)
  changed_at    timestamptz not null default now()
);

create index if not exists idx_ai_assignments_task_id     on public.ai_assignments (task_id);
create index if not exists idx_ai_assignments_changed_at  on public.ai_assignments (changed_at desc);

comment on table public.ai_assignments is '과제 담당자/우선순위 변경 이력 (append-only 감사 로그, 현재값은 ai_tasks에 있음)';

-- ── ai_comments ─────────────────────────────────────────────────────────────
-- 관리자 운영 메모 스레드.
-- ⚠ 이 테이블은 RLS가 allow_all(익명 anon key로 전체 CRUD 가능)이라 비공개를 보장할 수 없다.
--   민감정보(개인정보, 인사평가성 코멘트 등)는 절대 적지 말 것 — "공개 운영 메모"로만 사용.
--   UI에서도 이 사실을 명시적으로 안내한다.
create table if not exists public.ai_comments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.ai_tasks(id) on delete cascade,
  author        text not null,       -- 작성자 (관리자, 자유 텍스트)
  content       text not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_ai_comments_task_id     on public.ai_comments (task_id);
create index if not exists idx_ai_comments_created_at  on public.ai_comments (created_at desc);

comment on table public.ai_comments is '과제별 공개 운영 메모 스레드 — RLS가 allow_all이라 비공개 보장 불가, 민감정보 입력 금지';

-- ── ai_files ────────────────────────────────────────────────────────────────
-- 첨부파일 메타데이터. 실제 바이너리는 Supabase Storage 'ai-task-files' 버킷에 저장.
create table if not exists public.ai_files (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.ai_tasks(id) on delete cascade,
  file_name     text not null,
  file_url      text not null,       -- Storage public URL
  file_size     bigint,              -- bytes
  uploaded_by   text,                -- 자유 텍스트 (등록자 이름)
  created_at    timestamptz not null default now()
);

create index if not exists idx_ai_files_task_id  on public.ai_files (task_id);

comment on table public.ai_files is '과제 첨부파일 메타데이터 (실제 파일은 Storage ai-task-files 버킷)';

-- ── updated_at 유지 안내 ──────────────────────────────────────────────────────
-- 이 프로젝트는 트리거를 쓰지 않는 기존 관례를 따른다. 앱 코드가 update 호출 시
-- updated_at: new Date().toISOString() 을 매번 명시적으로 같이 보낸다.

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.ai_tasks       enable row level security;
alter table public.ai_guides      enable row level security;
alter table public.ai_assignments enable row level security;
alter table public.ai_comments    enable row level security;
alter table public.ai_files       enable row level security;

drop policy if exists "allow_all_ai_tasks"       on public.ai_tasks;
drop policy if exists "allow_all_ai_guides"      on public.ai_guides;
drop policy if exists "allow_all_ai_assignments" on public.ai_assignments;
drop policy if exists "allow_all_ai_comments"    on public.ai_comments;
drop policy if exists "allow_all_ai_files"       on public.ai_files;

create policy "allow_all_ai_tasks"       on public.ai_tasks       for all using (true) with check (true);
create policy "allow_all_ai_guides"      on public.ai_guides      for all using (true) with check (true);
create policy "allow_all_ai_assignments" on public.ai_assignments for all using (true) with check (true);
create policy "allow_all_ai_comments"    on public.ai_comments    for all using (true) with check (true);
create policy "allow_all_ai_files"       on public.ai_files       for all using (true) with check (true);

-- ============================================================
-- Storage Bucket (SQL Editor에서 생성 불가 — 수동 생성 필요)
-- Supabase Dashboard > Storage > New Bucket:
--   이름: ai-task-files   /   Public bucket: 체크 (Public: true)
-- Public 버킷은 별도 storage.objects 정책 없이도 anon key로 upload/getPublicUrl이 동작한다.
-- ============================================================
