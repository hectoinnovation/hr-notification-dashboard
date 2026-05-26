/**
 * SMTP 진단 엔드포인트 (GET /api/test-smtp)
 *
 * - 로그인한 사용자만 접근 가능 (세션 체크)
 * - 현재 배포 서버에 로드된 SMTP env 값 확인 (비밀번호는 마스킹)
 * - nodemailer verify() 로 실제 SMTP 연결/인증 테스트
 * - 성공 or 실제 에러 메시지 반환
 *
 * 사용법: Production 로그인 후 브라우저에서
 *   https://hr-notification-dashboard.vercel.app/api/test-smtp
 */
import { NextRequest, NextResponse } from 'next/server'
import { createTransport } from 'nodemailer'
import { unsealData } from 'iron-session'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  // ── 세션 인증 체크 ──────────────────────────────────────────────────────────
  const sealed = req.cookies.get('hr-session')?.value
  if (!sealed) {
    return NextResponse.json({ error: 'Unauthorized — 먼저 로그인하세요.' }, { status: 401 })
  }
  try {
    const data = await unsealData<{ authenticated?: boolean }>(sealed, {
      password: process.env.SESSION_SECRET ?? 'hectoinno-dashboard-session-secret-2026',
    })
    if (data.authenticated !== true) {
      return NextResponse.json({ error: 'Unauthorized — 세션이 유효하지 않습니다.' }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized — 세션 파싱 실패.' }, { status: 401 })
  }

  // ── SMTP env 로드 확인 ────────────────────────────────────────────────────────
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT ?? '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.MAIL_FROM

  const envStatus = {
    SMTP_HOST:  host  ?? '⚠️ 미설정',
    SMTP_PORT:  isNaN(port) ? '⚠️ 미설정' : port,
    SMTP_USER:  user  ?? '⚠️ 미설정',
    SMTP_PASS:  pass  ? `설정됨 (${pass.length}자)` : '⚠️ 미설정',
    MAIL_FROM:  from  ?? '⚠️ 미설정 (SMTP_USER로 대체)',
  }

  if (!host || !user || !pass) {
    return NextResponse.json({
      ok: false,
      env: envStatus,
      error: 'SMTP env 누락 — Vercel 환경변수를 확인하세요.',
    })
  }

  // ── SMTP 연결 테스트 (verify) ─────────────────────────────────────────────────
  const useSSL = port === 465
  try {
    const transporter = createTransport({
      host,
      port,
      secure: useSSL,
      ...(useSSL ? {} : { requireTLS: true }),
      auth: { user, pass },
      tls: { servername: host },
    })
    await transporter.verify()
    return NextResponse.json({
      ok: true,
      env: envStatus,
      tlsMode: useSSL ? 'SSL (port 465)' : 'STARTTLS (port 587)',
      message: '✅ SMTP 연결 및 인증 성공',
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[test-smtp] verify 실패 →', msg)
    return NextResponse.json({
      ok: false,
      env: envStatus,
      tlsMode: useSSL ? 'SSL (port 465)' : 'STARTTLS (port 587)',
      error: msg,
    })
  }
}
