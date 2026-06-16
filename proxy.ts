import { NextRequest, NextResponse } from 'next/server'
import { unsealData } from 'iron-session'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

const COOKIE_NAME    = 'hr-session'
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'hectoinno-dashboard-session-secret-2026'

// Paths that do NOT require authentication
// /api/cron/ 은 Vercel Cron이 세션 없이 호출하므로 반드시 PUBLIC에 포함
const PUBLIC_PATHS = ['/login', '/otp', '/blocked', '/api/auth/', '/api/cron/']

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  // ── Public paths (IP/Host 체크보다 먼저) ─────────────────────────────────
  // /api/cron/ 은 Vercel Cron·GitHub Actions 등 외부에서 세션 없이 호출하므로
  // ALLOWED_IPS·PRODUCTION_HOST 체크 전에 통과시켜야 함
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // ── IP 감지 ───────────────────────────────────────────────────────────────
  const forwarded = req.headers.get('x-forwarded-for')
  const ip = (forwarded ? forwarded.split(',')[0] : req.headers.get('x-real-ip') ?? '127.0.0.1').trim()
  const isLocalhost = ip === '127.0.0.1' || ip === '::1'

  // ── Preview 배포 차단 ─────────────────────────────────────────────────────
  const productionHost = process.env.PRODUCTION_HOST ?? ''
  const host = req.headers.get('host') ?? ''
  if (productionHost && !isLocalhost && host !== productionHost && !pathname.startsWith('/blocked')) {
    const url = req.nextUrl.clone()
    url.pathname = '/blocked'
    return NextResponse.redirect(url)
  }

  // ── IP Whitelist ──────────────────────────────────────────────────────────
  if (!pathname.startsWith('/blocked')) {
    const allowedIPs = (process.env.ALLOWED_IPS ?? '').split(',').map(s => s.trim()).filter(Boolean)
    if (allowedIPs.length > 0 && !isLocalhost && !allowedIPs.includes(ip)) {
      const url = req.nextUrl.clone()
      url.pathname = '/blocked'
      return NextResponse.redirect(url)
    }
  }

  // ── Session check ─────────────────────────────────────────────────────────
  const sealed = req.cookies.get(COOKIE_NAME)?.value
  if (sealed) {
    try {
      const data = await unsealData<{ authenticated?: boolean }>(sealed, { password: SESSION_SECRET })
      if (data.authenticated === true) return NextResponse.next()
    } catch {
      // Tampered or expired cookie — fall through to redirect
    }
  }

  // No valid session → redirect to login
  const url = req.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
}
