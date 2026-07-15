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

  -- 등록 시 입력 항목 — 등록은 "앞으로 AI로 해결하려는 업무" 기준. 완료 전까지는 계획 텍스트.
  current_work        text,        -- 현재 업무
  ai_usage             text,        -- 등록 시=AI 활용 계획 / 완료 처리 시 실제 활용 내용으로 덮어씀
  result_content       text,        -- 해결 결과 (완료 처리 시 입력)
  reflection           text,        -- 느낀 점 (완료 처리 시 선택 입력)
  completed_at         date,

  -- 수정/삭제/완료 처리 권한 확인용 (bcrypt 해시로 저장, 평문 저장 금지)
  password_hash        text not null,

  -- 관리자 전용 관리 필드 — 항상 최신값. 변경 이력은 ai_assignments 참고.
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
-- 과제별 공개 댓글(질문/답변) 스레드. 직원 누구나 작성 가능, 수정/삭제는 댓글
-- 등록 시 입력한 비밀번호(bcrypt 해시) 확인 후 가능 — 관리자는 비밀번호 없이 가능.
-- 과제 작성자는 댓글 중 하나를 "채택"할 수 있다(is_accepted, 과제당 최대 1개).
create table if not exists public.ai_comments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.ai_tasks(id) on delete cascade,
  author        text not null,       -- 작성자 (자유 텍스트)
  content       text not null,
  password_hash text not null,       -- 수정/삭제 확인용 bcrypt 해시
  is_accepted   boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_ai_comments_task_id     on public.ai_comments (task_id);
create index if not exists idx_ai_comments_created_at  on public.ai_comments (created_at asc);

-- 과제당 채택 댓글은 하나만 허용 (부분 유니크 인덱스로 DB 단에서도 보장)
create unique index if not exists idx_ai_comments_one_accepted
  on public.ai_comments (task_id) where is_accepted = true;

comment on table public.ai_comments is '과제별 공개 댓글 스레드 — 비밀번호(해시) 확인 후 본인 댓글 수정/삭제, 관리자는 무조건 가능';

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
-- 예시 데이터 (화면 확인용 — 진행중 1건 + 완료 1건 + 댓글 3개)
-- 이미 실행했다면 ON CONFLICT DO NOTHING으로 안전하게 건너뜀.
-- 데모 비밀번호는 공통으로 "demo1234" (pgcrypto crypt()로 bcrypt 해시 생성).
-- ============================================================
insert into public.ai_tasks (
  id, title, team, author, resolution_type, status,
  current_work, ai_usage, result_content, completed_at,
  password_hash, priority, created_at, updated_at
) values (
  '11111111-1111-4111-a111-111111111111',
  '채용공고 자동 생성', '인사팀', '안소정', 'self', 'in_progress',
  '매주 채용공고를 작성하고 있습니다.',
  'ChatGPT를 활용하여
채용공고 초안을 자동 생성해볼 예정입니다.',
  null, null,
  crypt('demo1234', gen_salt('bf')), 'high',
  now() - interval '3 days', now() - interval '3 days'
) on conflict (id) do nothing;

insert into public.ai_tasks (
  id, title, team, author, resolution_type, status,
  current_work, ai_usage, result_content, completed_at,
  password_hash, priority, created_at, updated_at
) values (
  '22222222-2222-4222-a222-222222222222',
  '신규입사자 안내 메일 자동 작성', '인사팀', '이수현', 'self', 'done',
  '신규입사자에게 안내 메일을 매번 수작업으로 작성하고 있습니다.',
  'Claude를 활용하여
메일 초안을 자동 작성했습니다.',
  '메일 작성 시간이
20분에서 3분으로 단축되었습니다.',
  (now() - interval '1 day')::date,
  crypt('demo1234', gen_salt('bf')), 'urgent',
  now() - interval '7 days', now() - interval '1 day'
) on conflict (id) do nothing;

insert into public.ai_comments (id, task_id, author, content, password_hash, is_accepted, created_at) values
  ('33333333-3333-4333-a333-333333333333', '22222222-2222-4222-a222-222222222222', '박서준', '좋은 아이디어네요.',           crypt('demo1234', gen_salt('bf')), true,  now() - interval '20 hours'),
  ('44444444-4444-4444-a444-444444444444', '22222222-2222-4222-a222-222222222222', '최유진', '저희 팀도 적용해보겠습니다.', crypt('demo1234', gen_salt('bf')), false, now() - interval '15 hours'),
  ('55555555-5555-4555-a555-555555555555', '22222222-2222-4222-a222-222222222222', '정하은', '프롬프트 공유 가능할까요?',   crypt('demo1234', gen_salt('bf')), false, now() - interval '10 hours')
on conflict (id) do nothing;

-- ============================================================
-- Storage Bucket (SQL Editor에서 생성 불가 — 수동 생성 필요)
-- Supabase Dashboard > Storage > New Bucket:
--   이름: ai-task-files   /   Public bucket: 체크 (Public: true)
-- Public 버킷은 별도 storage.objects 정책 없이도 anon key로 upload/getPublicUrl이 동작한다.
-- ============================================================
