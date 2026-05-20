import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'

export async function POST() {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
  await session.destroy()

  // Belt-and-suspenders: also set the cookie to expire immediately
  const res = NextResponse.json({ ok: true })
  res.cookies.set(sessionOptions.cookieName as string, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  })
  return res
}
