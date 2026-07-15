import type { SessionOptions } from 'iron-session'

// AI 과제 관리 관리자(/admin) 전용 세션. 기존 입퇴사자 대시보드 세션(lib/session.ts, 'hr-session')과
// 쿠키 이름·데이터 모두 완전히 분리되어 있어 서로 영향을 주지 않는다.
export interface AdminSessionData {
  authenticated?: boolean
}

export const ADMIN_COOKIE_NAME = 'ai-admin-session'

// 하드코딩 기본값을 두지 않는다 — SESSION_SECRET이 없으면 로그인 시도 자체를 명시적으로 실패시킨다.
export function getAdminSessionOptions(): SessionOptions {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('SESSION_SECRET 환경변수가 설정되지 않았습니다.')
  }
  return {
    password: secret,
    cookieName: ADMIN_COOKIE_NAME,
    cookieOptions: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 8, // 8 hours
    },
  }
}
