import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { SessionData, sessionOptions } from '@/lib/session'
import { getOtpSecret, generateAndSaveSecret, generateQrDataUrl, isOtpConfirmed } from '@/lib/otp'

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions)
  if (session.step !== 'otp') {
    return NextResponse.json({ error: '먼저 로그인해주세요.' }, { status: 401 })
  }

  // isNew = QR 등록이 한 번도 완료되지 않은 경우
  const isNew = !isOtpConfirmed()

  let secret = getOtpSecret()
  if (!secret) secret = generateAndSaveSecret()

  const qrDataUrl = await generateQrDataUrl(secret)
  return NextResponse.json({ secret, qrDataUrl, isNew })
}
