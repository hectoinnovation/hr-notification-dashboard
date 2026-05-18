import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { STAGES, AUTO_MAIL_STAGE_IDS, calcDday, makeOnboardingMailHtml } from '@/lib/onboarding'
import { sendMail } from '@/lib/mail'
import type { Employee } from '@/lib/supabase'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  // Verify Vercel cron secret if configured
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.get('Authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Cron runs at UTC 00:00 = KST 09:00 — UTC date matches KST date
  const today = new Date().toISOString().slice(0, 10)

  const { data: employees, error: empErr } = await supabase
    .from('employees')
    .select('*')
    .eq('status', 'active')

  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 })

  const autoStages = STAGES.filter(s => AUTO_MAIL_STAGE_IDS.includes(s.id))
  const recipient = 'inno_hm@hecto.co.kr'
  let sent = 0, skipped = 0, failed = 0

  for (const emp of (employees ?? []) as Employee[]) {
    if (!emp.join_date) continue

    for (const stage of autoStages) {
      const scheduledDate = calcDday(emp.join_date, stage.timing)
      if (!scheduledDate || scheduledDate !== today) continue

      // Skip if already manually sent via UI
      const { data: task } = await supabase
        .from('onboarding_tasks')
        .select('mail_sent')
        .eq('employee_id', String(emp.id))
        .eq('stage_id', stage.id)
        .maybeSingle()
      if (task?.mail_sent) { skipped++; continue }

      // Skip if already auto-sent today
      const { data: log } = await supabase
        .from('onboarding_mail_logs')
        .select('id')
        .eq('employee_id', String(emp.id))
        .eq('stage_key', stage.id)
        .eq('scheduled_date', today)
        .eq('status', 'sent')
        .maybeSingle()
      if (log) { skipped++; continue }

      const subject = `[온보딩 알림] ${emp.name}님 ${stage.label} 진행 요청`
      const html = makeOnboardingMailHtml(emp, stage.label, stage.timing, scheduledDate)
      const mailErr = await sendMail({ to: [recipient], subject, html })

      const logBase = { employee_id: String(emp.id), stage_key: stage.id, scheduled_date: today, recipient }

      if (mailErr) {
        failed++
        await supabase.from('onboarding_mail_logs').upsert(
          { ...logBase, status: 'failed' },
          { onConflict: 'employee_id,stage_key,scheduled_date' }
        )
      } else {
        sent++
        await supabase.from('onboarding_mail_logs').upsert(
          { ...logBase, status: 'sent', sent_at: new Date().toISOString() },
          { onConflict: 'employee_id,stage_key,scheduled_date' }
        )
        // Update onboarding_tasks so UI reflects sent status on next load
        await supabase.from('onboarding_tasks').upsert(
          {
            employee_id: String(emp.id), stage_id: stage.id,
            stage_label: stage.label, timing: stage.timing,
            sort_order: STAGES.findIndex(s => s.id === stage.id),
            mail_sent: true, mail_sent_at: new Date().toISOString(),
          },
          { onConflict: 'employee_id,stage_id' }
        )
      }
    }
  }

  return NextResponse.json({ ok: true, today, sent, skipped, failed })
}
