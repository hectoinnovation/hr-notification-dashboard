import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.authenticated) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }
  return NextResponse.json({ ok: true })
}
