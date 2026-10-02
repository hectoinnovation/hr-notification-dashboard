-- ─────────────────────────────────────────────────────────────────────────────
-- 웰니스포인트 탭 — 웰니스코인 환수 업로드 테이블 신규 생성
-- Supabase Dashboard > SQL Editor 에서 실행하세요 (몇 번 실행해도 안전 · idempotent)
-- 기존 테이블(employees, point_requests 등)에는 전혀 영향 없음 — 완전히 새로운 테이블만 추가.
-- ─────────────────────────────────────────────────────────────────────────────

-- 헥토에서 받는 웰니스 관련 엑셀 파일 중 "환수"로 표시된 금액이 있는 행만 파싱해서
-- 저장한다(cafe_excel_data와 동일한 단일 행(id='singleton') 패턴). 화면의 환수 대상자
-- 목록·금액은 항상 이 원본(data)에서 매번 다시 계산한다(lib/wellness-reclaim.ts
-- buildWellnessReclaimEntries) — 기존 웰니스코인 지급 테이블/계산(employees 입사·퇴사일
-- 기반)과는 완전히 분리되어 있다.
create table if not exists public.wellness_coin_reclaim_upload (
  id          text primary key default 'singleton',
  file_name   text,
  data        jsonb,
  uploaded_at timestamptz,
  updated_at  timestamptz not null default now()
);

comment on table public.wellness_coin_reclaim_upload is
  '웰니스코인 환수 대상 엑셀 업로드(비교·지급과 무관, 환수 전용) — 원본 파싱 데이터[{name, amount}]만 저장하고 화면 표시는 매번 재계산';
comment on column public.wellness_coin_reclaim_upload.data is
  '업로드 엑셀에서 추출한 환수 대상 원본 배열 [{"name":"...","amount":숫자}, ...] — 직원 1명당 1건(동일 이름은 합산), employees 테이블과는 이름으로만 매칭';

alter table public.wellness_coin_reclaim_upload enable row level security;

drop policy if exists "allow_all_wellness_coin_reclaim_upload" on public.wellness_coin_reclaim_upload;
create policy "allow_all_wellness_coin_reclaim_upload" on public.wellness_coin_reclaim_upload
  for all using (true) with check (true);
