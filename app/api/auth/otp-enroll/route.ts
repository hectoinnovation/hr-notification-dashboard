import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { getOtpSecret, generateQrDataUrl, logQrAccess } from '@/lib/otp'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (!session.authenticated) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 })
  }

  const secret = getOtpSecret()
  if (!secret) {
    return NextResponse.json({ error: 'OTP 시크릿이 없습니다.' }, { status: 500 })
  }

  logQrAccess('admin')
  const qrDataUrl = await generateQrDataUrl(secret)
  return NextResponse.json({ qrDataUrl, secret })
}
