import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { getOtpSecret, generateAndSaveSecret, verifyOtp } from '@/lib/otp'

export async function POST(req: NextRequest) {
  const { token } = await req.json() as { token: string }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (session.step !== 'otp') {
    return NextResponse.json({ error: '먼저 로그인해주세요.' }, { status: 401 })
  }

  let secret = getOtpSecret()
  if (!secret) secret = generateAndSaveSecret()

  if (!verifyOtp(token, secret)) {
    return NextResponse.json({ error: 'OTP 코드가 올바르지 않습니다.' }, { status: 401 })
  }

  session.authenticated = true
  session.step = undefined
  await session.save()

  return NextResponse.json({ ok: true })
}
