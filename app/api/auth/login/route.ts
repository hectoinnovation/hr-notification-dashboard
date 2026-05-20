import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'

export async function POST(req: NextRequest) {
  const { id, password } = await req.json() as { id: string; password: string }

  if (id !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  session.step = 'otp'
  await session.save()

  return NextResponse.json({ ok: true })
}
