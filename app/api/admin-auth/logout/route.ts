import { NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { AdminSessionData, getAdminSessionOptions } from '@/lib/admin-session'

export async function POST() {
  try {
    const session = await getIronSession<AdminSessionData>(await cookies(), getAdminSessionOptions())
    session.destroy()
  } catch {
    // SESSION_SECRET이 없어 세션을 열 수 없어도 로그아웃 자체는 성공으로 처리
  }
  return NextResponse.json({ ok: true })
}
