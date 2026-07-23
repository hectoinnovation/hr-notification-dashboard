'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const LINKS = [
  { href: '/ai/about', label: 'AI 해커톤 안내' },
  { href: '/ai/guides', label: 'AI 활용 방법' },
  { href: '/ai', label: 'AI 과제 등록' },
  { href: '/ai/tasks', label: '등록된 과제' },
]

export function AiNav() {
  const pathname = usePathname()

  // Preview/로컬에서만 예시 데이터를 생성한다 (라우트 안에서 Production은 항상 차단).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/ai-tasks/seed', { method: 'POST' })
        const data = await res.json()
        if (!res.ok || data.error) console.error('[AI 해커톤] 예시 데이터 생성 실패:', data.error ?? res.status)
      } catch (err) {
        console.error('[AI 해커톤] 예시 데이터 생성 요청 실패:', err)
      }
    })()
  }, [])

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-100">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
        <Link href="/ai/about" className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center text-sm">🤖</div>
          <span className="font-bold text-sm text-gray-900 hidden sm:inline">AI 해커톤</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto flex-1">
          {LINKS.map(l => {
            const active = pathname === l.href
            return (
              <Link key={l.href} href={l.href}
                className={`text-xs sm:text-sm font-semibold px-2.5 sm:px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors ${
                  active ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
                }`}>
                {l.label}
              </Link>
            )
          })}
        </nav>
        <Link href="/admin/login"
          className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-2.5 py-1.5 rounded-lg transition-colors">
          관리자 로그인
        </Link>
      </div>
    </header>
  )
}
