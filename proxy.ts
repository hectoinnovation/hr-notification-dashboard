import { NextRequest, NextResponse } from 'next/server'
import { unsealData } from 'iron-session'
import { ADMIN_COOKIE_NAME } from '@/lib/admin-session'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}

const COOKIE_NAME    = 'hr-session'
const SESSION_SECRET = process.env.SESSION_SECRET ?? 'hectoinno-dashboard-session-secret-2026'

// Paths that do NOT require authentication
// /api/cron/ 은 Vercel Cron이 세션 없이 호출하므로 반드시 PUBLIC에 포함
// /ai 는 AI 과제 관리 기능의 사용자 페이지 — 로그인 없이 사내망/IP 화이트리스트만으로 접근
// (trailing slash를 붙이면 '/ai' 루트 자체는 startsWith 매칭에서 빠지므로 반드시 슬래시 없이 등록)
// /admin/login, /api/admin-auth/ 는 AI 관리자 전용 로그인 — 기존 HR 로그인(/login, /otp)과 별개
const PUBLIC_PATHS = ['/login', '/otp', '/blocked', '/api/auth/', '/api/cron/', '/ai', '/admin/login', '/api/admin-auth/']

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

  // ── AI 관리자(/admin) 전용 세션 체크 — 기존 HR 세션과 완전히 분리 ─────────────
  // /admin/login은 위 PUBLIC_PATHS에서 이미 걸러졌으므로 여기 도달하는 /admin* 요청은
  // 전부 보호 대상이다. 기존 HR 세션 체크(아래)는 이 분기와 전혀 관계없이 그대로 동작한다.
  if (pathname.startsWith('/admin')) {
    const adminSealed = req.cookies.get(ADMIN_COOKIE_NAME)?.value
    const adminSecret = process.env.SESSION_SECRET
    if (adminSealed && adminSecret) {
      try {
        const data = await unsealData<{ authenticated?: boolean }>(adminSealed, { password: adminSecret })
        if (data.authenticated === true) return NextResponse.next()
      } catch {
        // Tampered or expired cookie — fall through to redirect
      }
    }
    const url = req.nextUrl.clone()
    url.pathname = '/admin/login'
    return NextResponse.redirect(url)
  }

  // ── Session check (기존 입퇴사자 대시보드 — 변경 없음) ───────────────────────
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
