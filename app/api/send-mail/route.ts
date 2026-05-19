import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/mail'

export async function POST(req: NextRequest) {
  const { to, cc, subject, html } = await req.json() as { to: string[]; cc?: string[]; subject: string; html: string }
  const err = await sendMail({ to, cc, subject, html })
  if (err) return NextResponse.json({ error: err }, { status: 500 })
  return NextResponse.json({ ok: true })
}
