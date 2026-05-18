import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/mail'

export async function POST(req: NextRequest) {
  const { to, subject, html } = await req.json() as { to: string[]; subject: string; html: string }
  const err = await sendMail({ to, subject, html })
  if (err) return NextResponse.json({ error: err }, { status: 500 })
  return NextResponse.json({ ok: true })
}
