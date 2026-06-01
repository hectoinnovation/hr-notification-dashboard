import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { STAGES, AUTO_MAIL_STAGE_IDS, calcDday, makeOnboardingMailHtml } from '@/lib/onboarding'
import { sendMail } from '@/lib/mail'
import type { Employee } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// 시간 헬퍼
//
// Vercel Cron 스케줄: "0 23 * * *" (UTC 23:00 = KST 다음날 08:00)
// → 발송 대상 날짜는 KST 기준으로 계산
// ─────────────────────────────────────────────────────────────────────────────

/** UTC 기준 현재 시각 문자열 (로그용) */
function getNowUTC(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

/** KST 기준 현재 시각 문자열 (로그용) */
function getNowKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().replace('T', ' ').slice(0, 19) + ' KST'
}

/** KST 기준 오늘 날짜 (YYYY-MM-DD) — Cron이 UTC 23:00에 실행되면 KST 다음날 08:00이므로 +9h 후의 날짜를 반환 */
function getTodayKST(): string {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().slice(0, 10) // 'YYYY-MM-DD'
}

// ─────────────────────────────────────────────────────────────────────────────
// [메일자동발송] 로그 포매터
// ─────────────────────────────────────────────────────────────────────────────
function logMail({
  today,
  totalCandidates,
  recipient,
  subject,
  result,
  error,
}: {
  today: string
  totalCandidates: number
  recipient: string
  subject: string
  result: '성공' | '실패' | '스킵'
  error?: string | null
}) {
  console.log(
    `\n[메일자동발송]\n` +
    `오늘 날짜: ${today}\n` +
    `조회 건수: ${totalCandidates}\n` +
    `수신자: ${recipient}\n` +
    `제목: ${subject}\n` +
    `발송 결과: ${result}\n` +
    `에러: ${error ?? '-'}`
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/cron/onboarding-mails
//
// Vercel Cron: 매일 KST 09:00 (UTC 00:00) 자동 실행
//
// 수동 테스트 파라미터 (로그인 불필요):
//   ?force=true          → mail_sent 체크 무시하고 재발송
//   ?date=2026-06-01     → 특정 날짜 기준 강제 실행
//   ?date=2026-06-01&force=true  → 날짜 + 강제 재발송 조합
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const url = new URL(req.url)

  // ── 날짜 오버라이드 (수동 테스트용) ──────────────────────────────────────
  const dateParam  = url.searchParams.get('date')
  const forceParam = url.searchParams.get('force') === 'true'
  const today      = dateParam ?? getTodayKST()

  // ── CRON_SECRET 인증 ──────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('Authorization') ?? req.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      console.error('[메일자동발송] ❌ 인증 실패 — Authorization 헤더 불일치')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ── Supabase 클라이언트 ───────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('[메일자동발송] ❌ Supabase 환경변수 미설정')
    return NextResponse.json({ error: 'Supabase env not set' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  // ── 재직 중 직원 조회 ─────────────────────────────────────────────────────
  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('*')
    .eq('status', 'active')

  if (empErr) {
    console.error('[메일자동발송] ❌ employees 조회 실패 →', empErr.message)
    return NextResponse.json({ error: empErr.message }, { status: 500 })
  }

  const empList    = (employees ?? []) as Employee[]
  const autoStages = STAGES.filter(s => (AUTO_MAIL_STAGE_IDS as readonly string[]).includes(s.id))
  const recipient  = process.env.MAIL_RECIPIENT ?? 'inno_hm@hecto.co.kr'

  // ── 오늘 발송 대상 후보 계산 ──────────────────────────────────────────────
  type Candidate = { emp: Employee; stage: typeof autoStages[number]; scheduledDate: string }
  const candidates: Candidate[] = []

  for (const emp of empList) {
    if (!emp.join_date) continue
    for (const stage of autoStages) {
      const scheduledDate = calcDday(emp.join_date, stage.timing)
      if (!scheduledDate || scheduledDate !== today) continue
      candidates.push({ emp, stage, scheduledDate })
    }
  }

  console.log(
    `\n[메일자동발송] 시작\n` +
    `Cron 실행 시간: ${getNowKST()} (스케줄: 매일 08:00 KST)\n` +
    `현재 UTC 시간: ${getNowUTC()}\n` +
    `현재 KST 시간: ${getNowKST()}\n` +
    `발송 기준 날짜: ${today} (KST)\n` +
    `force 모드: ${forceParam}\n` +
    `재직자 수: ${empList.length}명\n` +
    `발송 대상 건수: ${candidates.length}건`
  )

  if (candidates.length === 0) {
    console.log(`[메일자동발송] ${today} 발송 대상 없음 — 종료`)
    return NextResponse.json({ ok: true, today, sent: 0, skipped: 0, failed: 0, total: 0 })
  }

  let sent = 0, skipped = 0, failed = 0

  for (const { emp, stage, scheduledDate } of candidates) {
    const subject = `[온보딩 알림] ${emp.name}님 ${stage.label} 진행 요청`

    if (!forceParam) {
      // 이미 수동 발송된 경우 스킵
      const { data: task, error: taskErr } = await supabase
        .from('onboarding_tasks')
        .select('mail_sent')
        .eq('employee_id', String(emp.id))
        .eq('stage_id', stage.id)
        .maybeSingle()

      if (taskErr) {
        console.warn('[메일자동발송] ⚠️ onboarding_tasks 조회 오류 →', taskErr.message)
      }

      if (task?.mail_sent) {
        skipped++
        logMail({ today, totalCandidates: candidates.length, recipient, subject, result: '스킵', error: '이미 수동 발송됨 (force=true 로 재발송 가능)' })
        continue
      }

      // 오늘 이미 자동 발송된 경우 스킵 (중복 방지)
      const { data: log, error: logErr } = await supabase
        .from('onboarding_mail_logs')
        .select('id')
        .eq('employee_id', String(emp.id))
        .eq('stage_key', stage.id)
        .eq('scheduled_date', today)
        .eq('status', 'sent')
        .maybeSingle()

      if (logErr) {
        console.warn('[메일자동발송] ⚠️ onboarding_mail_logs 조회 오류 →', logErr.message)
      }

      if (log) {
        skipped++
        logMail({ today, totalCandidates: candidates.length, recipient, subject, result: '스킵', error: '오늘 이미 자동 발송됨' })
        continue
      }
    } else {
      console.log(`[메일자동발송] force=true — skip 체크 생략 (${emp.name} ${stage.id})`)
    }

    // ── 메일 발송 ────────────────────────────────────────────────────────────
    const html    = makeOnboardingMailHtml(emp, stage.label, stage.timing, scheduledDate)
    const mailErr = await sendMail({ to: [recipient], subject, html })
    const logBase = { employee_id: String(emp.id), stage_key: stage.id, scheduled_date: today, recipient }

    if (mailErr) {
      failed++
      logMail({ today, totalCandidates: candidates.length, recipient, subject, result: '실패', error: mailErr })

      const { error: dbErr } = await supabase.from('onboarding_mail_logs').upsert(
        { ...logBase, status: 'failed' },
        { onConflict: 'employee_id,stage_key,scheduled_date' }
      )
      if (dbErr) console.error('[메일자동발송] ❌ DB 실패 로그 기록 오류 →', dbErr.message, '(Supabase RLS 정책 확인 필요)')

    } else {
      sent++
      logMail({ today, totalCandidates: candidates.length, recipient, subject, result: '성공' })

      const { error: dbErr } = await supabase.from('onboarding_mail_logs').upsert(
        { ...logBase, status: 'sent', sent_at: new Date().toISOString() },
        { onConflict: 'employee_id,stage_key,scheduled_date' }
      )
      if (dbErr) {
        console.error('[메일자동발송] ❌ DB 성공 로그 기록 오류 →', dbErr.message, '(Supabase RLS 정책 확인 필요)')
        console.error('[메일자동발송] ❌ RLS 수정 SQL: CREATE POLICY "allow_all_mail_logs" ON onboarding_mail_logs FOR ALL USING (true) WITH CHECK (true);')
      }

      // onboarding_tasks UI 상태 업데이트
      const stageIdx = STAGES.findIndex(s => s.id === stage.id)
      const { error: taskDbErr } = await supabase.from('onboarding_tasks').upsert(
        {
          employee_id: String(emp.id), stage_id: stage.id,
          stage_label: stage.label, timing: stage.timing,
          sort_order: stageIdx, mail_sent: true,
          mail_sent_at: new Date().toISOString(),
        },
        { onConflict: 'employee_id,stage_id' }
      )
      if (taskDbErr) console.error('[메일자동발송] ❌ onboarding_tasks 업데이트 오류 →', taskDbErr.message)
    }
  }

  console.log(
    `\n[메일자동발송] 완료\n` +
    `Cron 실행 시간: ${getNowKST()}\n` +
    `현재 UTC 시간: ${getNowUTC()}\n` +
    `발송 기준 날짜: ${today} (KST)\n` +
    `발송 대상 건수: ${sent + skipped + failed}건\n` +
    `발송 성공: ${sent}건\n` +
    `스킵: ${skipped}건\n` +
    `실패: ${failed}건`
  )

  return NextResponse.json({ ok: true, today, sent, skipped, failed, total: candidates.length, force: forceParam })
}
