import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import { AdminSessionData, getAdminSessionOptions } from '@/lib/admin-session'

// AI 과제 관리 관리자 전용 로그인. 기존 입퇴사자 대시보드 로그인(app/api/auth/login)과는
// 별개의 엔드포인트/세션이며, OTP 단계 없이 아이디/비밀번호 확인만으로 인증을 완료한다.
export async function POST(req: NextRequest) {
  const { id, password } = await req.json() as { id: string; password: string }

  if (id !== process.env.ADMIN_ID || password !== process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  let session
  try {
    session = await getIronSession<AdminSessionData>(await cookies(), getAdminSessionOptions())
  } catch {
    return NextResponse.json({ error: '서버 설정 오류로 로그인할 수 없습니다. 관리자에게 문의해주세요.' }, { status: 500 })
  }

  session.authenticated = true
  await session.save()

  return NextResponse.json({ ok: true })
}
