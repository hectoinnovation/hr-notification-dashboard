/**
 * GET /api/cron/auto-mail
 *
 * 예약 메일 자동 발송 cron — scheduled_mails 테이블 기반
 *
 * 동작:
 *   status = 'pending' AND scheduled_at <= now() 인 행을 발송
 *   발송 성공 → status = 'sent', sent_at = now()
 *   발송 실패 → status 유지(pending), 다음 실행에서 재시도
 *
 * 인증:
 *   Vercel Cron: Authorization: Bearer <CRON_SECRET> 헤더 자동 전송
 *   수동 테스트: ?secret=<CRON_SECRET> 쿼리 파라미터로도 인증 가능
 *
 * 디버그: ?debug=1 추가 시 환경변수·조회 결과 상세 응답 포함
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendMail } from '@/lib/mail'

export const runtime    = 'nodejs'
export const dynamic    = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const url   = new URL(req.url)
  const debug = url.searchParams.get('debug') === '1'

  // ── 환경변수 진단 (debug=1) ───────────────────────────────────────────────
  const diagnostics: Record<string, unknown> = {}
  if (debug) {
    diagnostics.supabaseUrl   = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').slice(0, 50)
    diagnostics.hasAnonKey    = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    diagnostics.hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
    diagnostics.hasCronSecret = !!process.env.CRON_SECRET
    diagnostics.smtpHost      = process.env.SMTP_HOST ?? null
    diagnostics.smtpPort      = process.env.SMTP_PORT ?? null
    diagnostics.smtpUser      = process.env.SMTP_USER ?? null
    diagnostics.hasSmtpPass   = !!process.env.SMTP_PASS
    diagnostics.smtpPassLen   = (process.env.SMTP_PASS ?? '').length
    diagnostics.mailFrom      = process.env.MAIL_FROM ?? null
    diagnostics.nowUtc        = new Date().toISOString()
  }

  // ── 인증 ────────────────────────────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const bearer      = req.headers.get('Authorization') ?? req.headers.get('authorization')
    const querySecret = url.searchParams.get('secret')
    const passed      = bearer === `Bearer ${cronSecret}` || querySecret === cronSecret
    if (debug) diagnostics.authPassed = passed
    if (!passed) {
      return NextResponse.json(
        { error: 'Unauthorized', ...(debug ? { diagnostics } : {}) },
        { status: 401 },
      )
    }
  } else {
    if (debug) diagnostics.authPassed = 'no-secret-bypass'
  }

  // ── Supabase 클라이언트 ───────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { ok: false, error: 'Supabase 환경변수 미설정', ...(debug ? { diagnostics } : {}) },
      { status: 500 },
    )
  }

  const supabase = createClient(supabaseUrl, supabaseKey)
  const nowIso   = new Date().toISOString()

  // ── 발송 대상 조회 ───────────────────────────────────────────────────────────
  const { data: pending, error: fetchErr } = await supabase
    .from('scheduled_mails')
    .select('id, to_email, cc_email, subject, html, body_text, scheduled_at')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)

  if (debug) {
    diagnostics.pendingCount = pending?.length ?? 0
    diagnostics.fetchError   = fetchErr ? `${fetchErr.code}: ${fetchErr.message}` : null
    diagnostics.pendingRows  = (pending ?? []).map(r => ({
      id: r.id, to: r.to_email, scheduled_at: r.scheduled_at,
    }))
  }

  if (fetchErr) {
    console.error('[auto-mail] scheduled_mails 조회 실패:', fetchErr.message)
    return NextResponse.json(
      { ok: false, error: fetchErr.message, ...(debug ? { diagnostics } : {}) },
      { status: 500 },
    )
  }

  // ── 메일 발송 루프 ───────────────────────────────────────────────────────────
  let sent = 0, errors = 0
  const results: { id: string; to: string; subject: string; status: string }[] = []

  for (const mail of (pending ?? [])) {
    const toArr = String(mail.to_email)
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)

    const ccArr = mail.cc_email
      ? String(mail.cc_email).split(',').map((s: string) => s.trim()).filter(Boolean)
      : undefined

    try {
      const sendErr = await sendMail({
        to:      toArr,
        cc:      ccArr,
        subject: mail.subject,
        html:    mail.html,
      })

      if (!sendErr) {
        // 발송 성공 → sent 처리
        const { error: upErr } = await supabase
          .from('scheduled_mails')
          .update({ status: 'sent', sent_at: nowIso, updated_at: nowIso })
          .eq('id', mail.id)

        if (upErr) console.error('[auto-mail] status 업데이트 실패 id=' + mail.id, upErr.message)

        sent++
        results.push({ id: mail.id, to: mail.to_email, subject: mail.subject, status: 'sent' })
        console.log(`[auto-mail] ✅ 발송 성공 to=${mail.to_email} subject="${mail.subject}"`)
      } else {
        // 발송 실패 → pending 유지, 재시도 대기
        errors++
        results.push({ id: mail.id, to: mail.to_email, subject: mail.subject, status: `error: ${sendErr}` })
        console.error(`[auto-mail] ❌ 발송 실패 to=${mail.to_email}:`, sendErr)
      }
    } catch (e) {
      errors++
      results.push({ id: mail.id, to: mail.to_email, subject: mail.subject, status: `exception: ${String(e)}` })
      console.error(`[auto-mail] ❌ 예외 id=${mail.id}:`, e)
    }
  }

  console.log(`[auto-mail] 완료 — 전체 ${results.length}건 (성공 ${sent}, 실패 ${errors})`)

  return NextResponse.json({
    ok:          true,
    processedAt: nowIso,
    total:       results.length,
    sent,
    errors,
    results,
    ...(debug ? { diagnostics } : {}),
  })
}
