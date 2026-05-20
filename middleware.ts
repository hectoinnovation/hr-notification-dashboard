import { NextRequest, NextResponse } from 'next/server'
import { unsealData } from 'iron-session'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

const COOKIE_NAME = 'hr-session'
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'hectoinno-dashboard-session-secret-2026'

// Paths that do NOT require authentication
const PUBLIC_PATHS = ['/login', '/otp', '/blocked', '/api/auth/']

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── IP Whitelist ──────────────────────────────────────────────────────────
  // localhost is always allowed for the IP check, but NOT for auth.
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = (forwarded ? forwarded.split(',')[0] : req.headers.get('x-real-ip') ?? '127.0.0.1').trim()
  const isLocalhost = ip === '127.0.0.1' || ip === '::1'

  if (!pathname.startsWith('/blocked')) {
    const allowedIPs = (process.env.ALLOWED_IPS ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (allowedIPs.length > 0 && !isLocalhost && !allowedIPs.includes(ip)) {
      const url = req.nextUrl.clone()
      url.pathname = '/blocked'
      return NextResponse.redirect(url)
    }
  }

  // ── Public paths ──────────────────────────────────────────────────────────
  // Login / OTP / blocked pages and all auth API routes are public.
  // Everything else requires a valid authenticated session.
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // ── Session check ─────────────────────────────────────────────────────────
  // isLocalhost does NOT bypass auth — only IP whitelist above.
  const sealed = req.cookies.get(COOKIE_NAME)?.value
  if (sealed) {
    try {
      const data = await unsealData<{ authenticated?: boolean }>(sealed, { password: SESSION_SECRET })
      if (data.authenticated === true) return NextResponse.next()
    } catch {
      // Tampered or expired cookie — fall through to redirect
    }
  }

  // No valid session → redirect to login, preserving the intended destination
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}
