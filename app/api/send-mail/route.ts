import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

export interface SendMailPayload {
  to: string[]
  subject: string
  html: string
}

export async function POST(req: NextRequest) {
  const { to, subject, html }: SendMailPayload = await req.json()

  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT ?? '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM ?? user

  if (!host || !user || !pass) {
    return NextResponse.json({ error: 'SMTP 환경변수가 설정되지 않았습니다.' }, { status: 500 })
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })

  try {
    await transporter.sendMail({ from, to, subject, html })
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
