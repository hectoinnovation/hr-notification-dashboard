/**
 * GET /api/cron/sync-scheduled-mails
 *
 * 기존 employees 기준 온보딩 예약메일 백필(backfill) 유틸리티
 *
 * - ?dry=1   : DB 변경 없이 생성 대상만 JSON으로 표시
 * - ?secret= : 인증 (CRON_SECRET 없는 환경은 자유 호출 가능)
 *
 * 대상 조건: status='active' AND join_date IS NOT NULL
 *            AND (join_reason='입사' OR join_reason IS NULL)
 *            AND is_onboarding_excluded IS NOT true (인턴/휴직복귀·관리자 제외 처리 제외)
 * 생성 스테이지: D-7(s5), D-1(s6), D-Day(s7)
 * 수신자: inno_hm@hecto.co.kr
 * 중복 방지: 동일 subject가 pending/sent면 스킵
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { STAGES, calcDday, makeOnboardingMailHtml, isOnboardingExcluded } from '@/lib/onboarding'
import type { Employee } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONBOARD_RECIPIENT = 'inno_hm@hecto.co.kr'
const TARGET_STAGES     = STAGES.filter(s => ['s5', 's6', 's7'].includes(s.id))

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const dry = url.searchParams.get('dry') === '1'

  // ── 인증 ────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const bearer = req.headers.get('Authorization') ?? req.headers.get('authorization') ?? ''
    const qs     = url.searchParams.get('secret') ?? ''
    if (bearer !== `Bearer ${cronSecret}` && qs !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Supabase ────────────────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase 환경변수 미설정' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, supabaseKey)

  // ── 활성 입사자 조회 (전적·휴직복귀 제외) ────────────────────────────────────
  // join_reason = '입사' 또는 null (join_reason이 없는 경우 입사로 간주)
  const { data: empData, error: empErr } = await supabase
    .from('employees')
    .select('id, name, join_date, department, division, team, position, leader, join_reason, phone, status, is_onboarding_excluded')
    .eq('status', 'active')
    .not('join_date', 'is', null)

  if (empErr) {
    return NextResponse.json({ error: `employees 조회 실패: ${empErr.message}` }, { status: 500 })
  }

  // 전적·휴직복귀·인턴 및 관리자가 온보딩 목록에서 제외 처리한 직원은 백필 대상에서 제외
  const empList = ((empData ?? []) as Employee[]).filter(
    e => (!e.join_reason || e.join_reason === '입사') && !isOnboardingExcluded(e)
  )

  // ── 이미 pending/sent인 subject 목록 (중복 방지) ─────────────────────────────
  const { data: existingData } = await supabase
    .from('scheduled_mails')
    .select('subject, status')
    .eq('to_email', ONBOARD_RECIPIENT)
    .in('status', ['pending', 'sent'])

  const existingSubjects = new Set(
    ((existingData ?? []) as { subject: string; status: string }[]).map(m => m.subject)
  )

  // ── 생성 대상 계산 ───────────────────────────────────────────────────────────
  type PreviewRow = {
    name: string; stage: string; targetDate: string
    subject: string; scheduled_at: string; to_email: string
  }
  type DbRow = {
    to_email: string; subject: string; html: string
    scheduled_at: string; status: string
  }

  const preview:  PreviewRow[] = []
  const dbRows:   DbRow[]      = []
  const skipped:  { name: string; stage: string; reason: string }[] = []

  for (const emp of empList) {
    if (!emp.join_date) continue

    const empObj: Employee = {
      id: emp.id, name: emp.name,
      join_date:   emp.join_date,
      department:  (emp as { department?: string }).department  ?? undefined,
      division:    (emp as { division?: string }).division     ?? undefined,
      team:        (emp as { team?: string }).team         ?? undefined,
      position:    (emp as { position?: string }).position     ?? undefined,
      leader:      (emp as { leader?: string }).leader       ?? undefined,
      join_reason: emp.join_reason ?? '입사',
      phone:       (emp as { phone?: string }).phone        ?? undefined,
      status:      emp.status,
    }

    for (const stage of TARGET_STAGES) {
      const targetDate = calcDday(emp.join_date, stage.timing)
      if (!targetDate) continue

      const subject = `[온보딩 알림] ${emp.name}님 ${stage.label} 진행 요청`

      if (existingSubjects.has(subject)) {
        skipped.push({ name: emp.name, stage: stage.timing, reason: '이미 pending/sent 존재' })
        continue
      }

      // scheduled_at: 해당 날짜 KST 00:00 → UTC 전날 15:00 (= T15:00:00.000Z)
      // cron이 UTC 01:00에 실행되므로 어느 시각이든 당일 자정이면 픽업됨
      const scheduled_at = `${targetDate}T00:00:00.000Z`

      preview.push({ name: emp.name, stage: stage.timing, targetDate, subject, scheduled_at, to_email: ONBOARD_RECIPIENT })
      dbRows.push({
        to_email:     ONBOARD_RECIPIENT,
        subject,
        html:         makeOnboardingMailHtml(empObj, stage.label, stage.timing, targetDate),
        scheduled_at,
        status:       'pending',
      })
    }
  }

  // ── dry=1: 미리보기만 반환 ────────────────────────────────────────────────────
  if (dry) {
    return NextResponse.json({
      ok:            true,
      dry:           true,
      employeeCount: empList.length,
      willInsert:    preview.length,
      skipped:       skipped.length,
      toInsert:      preview,
      skippedList:   skipped,
    })
  }

  // ── 실제 INSERT ──────────────────────────────────────────────────────────────
  if (dbRows.length === 0) {
    return NextResponse.json({
      ok: true, inserted: 0, skipped: skipped.length,
      message: '생성할 신규 예약메일 없음 (모두 이미 존재)',
      skippedList: skipped,
    })
  }

  const { data: inserted, error: insErr } = await supabase
    .from('scheduled_mails')
    .insert(dbRows)
    .select('id, to_email, subject, scheduled_at, status')

  if (insErr) {
    console.error('[sync-scheduled-mails] INSERT 실패:', insErr.message)
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 })
  }

  const insertedRows = (inserted ?? []) as { id: string; to_email: string; subject: string; scheduled_at: string; status: string }[]
  console.log(`[sync-scheduled-mails] ${insertedRows.length}건 생성 완료`)

  return NextResponse.json({
    ok:            true,
    employeeCount: empList.length,
    inserted:      insertedRows.length,
    skipped:       skipped.length,
    rows:          insertedRows.map(r => ({
      id:           r.id,
      to_email:     r.to_email,
      subject:      r.subject,
      scheduled_at: r.scheduled_at,
      status:       r.status,
    })),
    skippedList: skipped,
  })
}
