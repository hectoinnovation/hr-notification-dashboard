import { NextRequest, NextResponse } from 'next/server'
import { unsealData } from 'iron-session'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

const COOKIE_NAME = 'hr-session'
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'hectoinno-dashboard-session-secret-2026'
const PUBLIC_PATHS = ['/login', '/otp', '/blocked', '/api/auth/']

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Resolve client IP (x-forwarded-for → x-real-ip → fallback)
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = (forwarded ? forwarded.split(',')[0] : req.headers.get('x-real-ip') ?? '127.0.0.1').trim()
  const isLocalhost = ip === '127.0.0.1' || ip === '::1'

  // IP whitelist — skip for /blocked to avoid redirect loop
  if (!pathname.startsWith('/blocked')) {
    const allowedIPs = (process.env.ALLOWED_IPS ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (allowedIPs.length > 0 && !isLocalhost && !allowedIPs.includes(ip)) {
      const url = req.nextUrl.clone()
      url.pathname = '/blocked'
      return NextResponse.redirect(url)
    }
  }

  // Public paths — no auth required
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Verify session cookie
  const sealed = req.cookies.get(COOKIE_NAME)?.value
  if (sealed) {
    try {
      const data = await unsealData<{ authenticated?: boolean }>(sealed, { password: SESSION_SECRET })
      if (data.authenticated) return NextResponse.next()
    } catch {
      // invalid / tampered cookie — fall through to redirect
    }
  }

  const url = req.nextUrl.clone()
  url.pathname = '/login'
  return NextResponse.redirect(url)
}
