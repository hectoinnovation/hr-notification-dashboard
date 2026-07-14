'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/ai', label: '대시보드' },
  { href: '/ai/guides', label: 'AI 활용 방법' },
  { href: '/ai/register', label: 'AI 과제 등록' },
  { href: '/ai/my', label: '내 과제' },
]

export function AiNav() {
  const pathname = usePathname()
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center font-bold text-xs">AI</div>
          <span className="font-bold text-sm text-gray-900 hidden sm:inline">AI 과제 관리</span>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto">
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
      </div>
    </header>
  )
}
