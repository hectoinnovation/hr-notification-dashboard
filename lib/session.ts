import type { SessionOptions } from 'iron-session'

export interface SessionData {
  step?: 'otp'
  authenticated?: boolean
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET ?? 'hectoinno-dashboard-session-secret-2026',
  cookieName: 'hr-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 8, // 8 hours
  },
}
