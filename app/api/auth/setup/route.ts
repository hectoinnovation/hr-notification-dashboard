import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { getOtpSecret, generateAndSaveSecret, generateQrDataUrl } from '@/lib/otp'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (session.step !== 'otp') {
    return NextResponse.json({ error: '먼저 로그인해주세요.' }, { status: 401 })
  }

  let secret = getOtpSecret()
  const isNew = !secret
  if (!secret) secret = generateAndSaveSecret()

  const qrDataUrl = await generateQrDataUrl(secret)
  return NextResponse.json({ secret, qrDataUrl, isNew })
}
