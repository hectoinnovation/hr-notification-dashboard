import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/mail'

// nodemailer는 Node.js 전용 (net/tls 모듈 사용) — Edge runtime에서 실행 시 500 발생
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { to, cc, subject, html } = await req.json() as { to: string[]; cc?: string[]; subject: string; html: string }
  console.log('[api/send-mail] 수신 →', { to, cc, subject })
  const err = await sendMail({ to, cc, subject, html })
  if (err) {
    console.error('[api/send-mail] sendMail 오류 →', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }
  console.log('[api/send-mail] 발송 완료')
  return NextResponse.json({ ok: true })
}
