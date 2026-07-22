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

  -- 등록 시 입력 항목 — 등록은 "앞으로 AI로 해결하려는 업무" 기준.
  current_work        text,        -- 현재 업무 (등록 시)
  ai_usage             text,        -- AI 활용 계획 (등록 시 입력, 완료 후에도 그대로 유지)
  result_content       text,        -- 과제 링크 / 결과물 (완료 처리 시 입력 — GitHub/Notion 등 링크 또는 결과물 설명)
  completed_at         date,

  -- 수정/삭제/완료 처리 권한 확인용 (bcrypt 해시로 저장, 평문 저장 금지)
  password_hash        text not null,

  -- 관리자 전용 관리 필드 — 항상 최신값. 변경 이력은 ai_assignments 참고.
  assignee             text,        -- 담당자
  priority             text not null default 'medium' check (priority in ('urgent','high','medium','low')),  -- 긴급 | 높음 | 보통 | 낮음

  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 기존(이전 버전) 스키마로 이미 생성된 프로젝트를 위한 마이그레이션 — 새로 생성된 테이블에는 no-op.
-- 좋아요 수 — 로그인 없는 구조이므로 인증/중복 방지 없이 단순 증가 카운트만 저장한다.
alter table public.ai_tasks add column if not exists likes_count integer not null default 0;

create index if not exists idx_ai_tasks_status          on public.ai_tasks (status);
create index if not exists idx_ai_tasks_resolution_type  on public.ai_tasks (resolution_type);
create index if not exists idx_ai_tasks_team             on public.ai_tasks (team);
create index if not exists idx_ai_tasks_created_at       on public.ai_tasks (created_at desc);
create index if not exists idx_ai_tasks_completed_at     on public.ai_tasks (completed_at desc);
create index if not exists idx_ai_tasks_priority         on public.ai_tasks (priority);

comment on table public.ai_tasks is 'AI 활용 과제. status=진행 상태(진행중/완료), resolution_type=해결 방식(자체해결/도움필요) — 서로 다른 축이니 혼동 금지';

-- ── ai_teams ────────────────────────────────────────────────────────────────
-- 참여팀 관리(관리자 전용). ai_tasks.team은 여전히 자유 텍스트 컬럼이며, 이 테이블은
-- "과제 등록 화면에 노출할 팀 목록"을 관리하는 별도 마스터 테이블이다 — 조인이나
-- FK로 강제하지 않고, 팀명을 변경/삭제할 때 앱 코드가 ai_tasks.team을 함께 갱신한다
-- (이 프로젝트는 트리거를 쓰지 않는 기존 관례를 따름).
create table if not exists public.ai_teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  integer not null default 0,     -- 관리자가 지정한 노출 순서 (작을수록 먼저)
  is_active   boolean not null default true,  -- 비활성 팀은 과제 등록 Dropdown에서만 숨김, 기존 과제는 유지
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_ai_teams_sort_order on public.ai_teams (sort_order);
create index if not exists idx_ai_teams_is_active   on public.ai_teams (is_active);

comment on table public.ai_teams is '참여팀 관리 마스터 목록 (관리자 전용) — ai_tasks.team은 자유 텍스트로 별도 유지, 이름 변경/삭제 시 앱 코드가 동기화';

-- ── ai_guides ───────────────────────────────────────────────────────────────
-- "AI 활용 방법" 페이지에 노출되는 사내 AI 활용 자료. 단순 링크 모음이 아니라
-- 제목/설명(Markdown)/대표 이미지/카테고리/작성자를 갖춘 자료 카드다.
-- url은 선택 항목 — 있으면 카드에 "자료 보기" 버튼으로 새 탭에 연다.
create table if not exists public.ai_guides (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text not null,   -- Markdown 지원 (렌더링은 클라이언트에서 react-markdown으로)
  category      text not null check (category in ('AI 뉴스','프롬프트','활용 사례','바이브코딩','추천 툴','교육자료','기타')),
  url           text,            -- 선택 — 있으면 "자료 보기" 버튼 노출
  image_url     text,            -- 대표 이미지 (직접 업로드 또는 OG 자동 수집, 선택)
  author        text not null,
  is_pinned     boolean not null default false,   -- 상단 고정 — Pin, 필독 다음 우선순위
  is_required   boolean not null default false,   -- 필독 — 정렬 1순위 (Pin보다 우선)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 기존(이전 버전) 스키마로 이미 생성된 프로젝트를 위한 마이그레이션 — 새로 생성된
-- 테이블에는 전부 no-op이다. 이 테이블은 현재 데이터가 없는 것을 확인하고 작성함.
alter table public.ai_guides add column if not exists image_url text;
alter table public.ai_guides add column if not exists author text;
alter table public.ai_guides add column if not exists is_pinned boolean not null default false;
alter table public.ai_guides add column if not exists is_required boolean not null default false;
alter table public.ai_guides alter column url drop not null;
alter table public.ai_guides alter column description set not null;
alter table public.ai_guides alter column author set not null;
alter table public.ai_guides drop column if exists sort_order;
alter table public.ai_guides drop constraint if exists ai_guides_category_check;
alter table public.ai_guides add constraint ai_guides_category_check
  check (category in ('AI 뉴스','프롬프트','활용 사례','바이브코딩','추천 툴','교육자료','기타'));

create index if not exists idx_ai_guides_category    on public.ai_guides (category);
create index if not exists idx_ai_guides_is_pinned    on public.ai_guides (is_pinned);
create index if not exists idx_ai_guides_is_required  on public.ai_guides (is_required);
create index if not exists idx_ai_guides_created_at   on public.ai_guides (created_at desc);
drop index if exists idx_ai_guides_sort_order;

comment on table public.ai_guides is 'AI 활용 방법 페이지에 노출되는 사내 AI 활용 자료 카드 (필독 우선 → Pin 우선 → 최신 등록순)';

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

-- ── updated_at 유지 안내 ──────────────────────────────────────────────────────
-- 이 프로젝트는 트리거를 쓰지 않는 기존 관례를 따른다. 앱 코드가 update 호출 시
-- updated_at: new Date().toISOString() 을 매번 명시적으로 같이 보낸다.

-- ── RLS ───────────────────────────────────────────────────────────────────
alter table public.ai_tasks       enable row level security;
alter table public.ai_guides      enable row level security;
alter table public.ai_assignments enable row level security;
alter table public.ai_comments    enable row level security;
alter table public.ai_teams       enable row level security;

drop policy if exists "allow_all_ai_tasks"       on public.ai_tasks;
drop policy if exists "allow_all_ai_guides"      on public.ai_guides;
drop policy if exists "allow_all_ai_assignments" on public.ai_assignments;
drop policy if exists "allow_all_ai_comments"    on public.ai_comments;
drop policy if exists "allow_all_ai_teams"       on public.ai_teams;

create policy "allow_all_ai_tasks"       on public.ai_tasks       for all using (true) with check (true);
create policy "allow_all_ai_guides"      on public.ai_guides      for all using (true) with check (true);
create policy "allow_all_ai_assignments" on public.ai_assignments for all using (true) with check (true);
create policy "allow_all_ai_comments"    on public.ai_comments    for all using (true) with check (true);
create policy "allow_all_ai_teams"       on public.ai_teams       for all using (true) with check (true);

-- ============================================================
-- 예시(데모) 데이터 안내
-- 이 SQL에는 예시 데이터를 넣지 않는다 — SQL은 사용자가 Production DB에도 그대로
-- 실행할 수 있는 파일이라, 여기에 넣으면 Production에도 예시 데이터가 생겨버린다.
-- 대신 app/api/ai-tasks/seed/route.ts 가 앱 실행 시점에 process.env.VERCEL_ENV로
-- Preview/로컬인지 확인한 뒤에만(=== 'production'이면 항상 차단) 예시 데이터를 생성한다.
-- ============================================================

-- ============================================================
-- Storage Bucket (SQL Editor에서 생성 불가 — 수동 생성 필요)
-- Supabase Dashboard > Storage > New Bucket:
--   이름: ai-guide-images   /   Public bucket: 체크 (Public: true)
-- AI 활용 방법 자료의 대표 이미지 직접 업로드용.
--
-- 주의: 버킷을 Public으로 만들어도 그건 "읽기(SELECT)"만 익명 허용할 뿐,
-- anon key로 업로드(INSERT)하려면 storage.objects에 별도 RLS 정책이 필요하다.
-- 이 프로젝트는 service_role key 없이 anon key만 쓰는 기존 관례이므로,
-- 이 버킷에 한해서만 anon key로 업로드/수정/삭제가 가능하도록 정책을 추가한다
-- (다른 버킷에는 영향 없음 — bucket_id로 범위를 한정).
drop policy if exists "allow_all_ai_guide_images" on storage.objects;
create policy "allow_all_ai_guide_images" on storage.objects
  for all using (bucket_id = 'ai-guide-images') with check (bucket_id = 'ai-guide-images');
-- ============================================================
