/**
 * GET /api/cron/sync-scheduled-mails
 *
 * 기존 employees 테이블을 스캔해 scheduled_mails를 생성(백필)하는 유틸리티 엔드포인트.
 * - 신규 직원 등록 이전에 이미 존재하는 active 입사자의 D-7/D-1/D-Day 메일을 생성
 * - ?dry=1 : 실제 INSERT 없이 생성될 행만 미리보기
 * - ?secret=<CRON_SECRET> : 인증
 *
 * 중복 방지: 이미 sent인 메일은 재생성하지 않음.
 * 수신자: inno_hm@hecto.co.kr
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { STAGES, calcDday, makeOnboardingMailHtml } from '@/lib/onboarding'
import type { Employee } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONBOARD_RECIPIENT = 'inno_hm@hecto.co.kr'
const TARGET_STAGE_IDS  = ['s5', 's6', 's7'] as const   // D-7, D-1, D-Day

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const dry  = url.searchParams.get('dry') === '1'

  // ── 인증 ────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const bearer = req.headers.get('Authorization') ?? req.headers.get('authorization')
    const qs     = url.searchParams.get('secret')
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

  // ── 활성 입사자 조회 ─────────────────────────────────────────────────────────
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('id, name, join_date, department, division, team, position, leader, join_reason, phone, status')
    .eq('status', 'active')
    .not('join_date', 'is', null)
    .in('join_reason', ['입사', null])  // 전적·휴직복귀 제외

  if (empErr) {
    return NextResponse.json({ error: empErr.message }, { status: 500 })
  }

  const empList = (employees ?? []) as Employee[]

  // ── 이미 scheduled or sent된 subject 목록 조회 (중복 방지) ──────────────────
  const { data: existingMails } = await supabase
    .from('scheduled_mails')
    .select('subject, status')
    .eq('to_email', ONBOARD_RECIPIENT)
    .in('status', ['pending', 'sent'])

  const existingSubjects = new Set((existingMails ?? []).map((m: { subject: string }) => m.subject))

  // ── 생성할 행 계산 ───────────────────────────────────────────────────────────
  const onboardStages = STAGES.filter(s => (TARGET_STAGE_IDS as readonly string[]).includes(s.id))
  const nowIso        = new Date().toISOString()

  type MailRow = {
    to_email: string
    subject:  string
    html:     string
    scheduled_at: string
    status:   string
    employeeName?: string
    targetDate?: string
    stage?: string
  }

  const toInsert: MailRow[] = []
  const skipped:  { name: string; stage: string; reason: string }[] = []

  for (const emp of empList) {
    if (!emp.join_date) continue
    // 전적·휴직복귀 제외 (join_reason null은 입사로 간주)
    if (emp.join_reason && !['입사'].includes(emp.join_reason)) {
      skipped.push({ name: emp.name, stage: '전체', reason: `join_reason=${emp.join_reason}` })
      continue
    }

    const empObj: Employee = {
      id: emp.id, name: emp.name,
      join_date:  emp.join_date,
      department: emp.department ?? undefined,
      division:   emp.division   ?? undefined,
      team:       emp.team       ?? undefined,
      position:   emp.position   ?? undefined,
      leader:     emp.leader     ?? undefined,
      join_reason: emp.join_reason ?? '입사',
      phone:      emp.phone      ?? undefined,
      status:     emp.status,
    }

    for (const stage of onboardStages) {
      const targetDate = calcDday(emp.join_date, stage.timing)
      if (!targetDate) continue

      const subject = `[온보딩 알림] ${emp.name}님 ${stage.label} 진행 요청`

      if (existingSubjects.has(subject)) {
        skipped.push({ name: emp.name, stage: stage.timing, reason: '이미 pending 또는 sent 존재' })
        continue
      }

      toInsert.push({
        to_email:     ONBOARD_RECIPIENT,
        subject,
        html:         makeOnboardingMailHtml(empObj, stage.label, stage.timing, targetDate),
        scheduled_at: `${targetDate}T00:00:00.000Z`,
        status:       'pending',
        // 미리보기용 메타 (INSERT 전 제거)
        employeeName: emp.name,
        targetDate,
        stage: stage.timing,
      })
    }
  }

  // ── dry=1 이면 미리보기만 ────────────────────────────────────────────────────
  if (dry) {
    return NextResponse.json({
      ok:       true,
      dry:      true,
      total:    empList.length,
      toInsert: toInsert.map(r => ({
        name:         r.employeeName,
        stage:        r.stage,
        targetDate:   r.targetDate,
        subject:      r.subject,
        scheduled_at: r.scheduled_at,
      })),
      skipped,
    })
  }

  // ── 실제 INSERT ──────────────────────────────────────────────────────────────
  const dbRows = toInsert.map(({ employeeName: _n, targetDate: _d, stage: _s, ...rest }) => rest)

  type InsertedRow = { id: string; to_email: string; subject: string; scheduled_at: string; status: string }
  let inserted: InsertedRow[] = []
  let insertErr: string | null = null

  if (dbRows.length > 0) {
    const { data, error } = await supabase
      .from('scheduled_mails')
      .insert(dbRows)
      .select('id, to_email, subject, scheduled_at, status')

    if (error) insertErr = error.message
    else inserted = (data ?? []) as InsertedRow[]
  }

  console.log(`[sync-scheduled-mails] 직원 ${empList.length}명 → ${inserted.length}건 생성, ${skipped.length}건 스킵`)

  return NextResponse.json({
    ok:            !insertErr,
    employeeCount: empList.length,
    inserted:      toInsert.map((r, i) => ({
      name:         r.employeeName,
      stage:        r.stage,
      targetDate:   r.targetDate,
      subject:      r.subject,
      scheduled_at: r.scheduled_at,
      id:           inserted[i]?.id ?? null,
    })),
    skipped,
    error:         insertErr,
  })
}
