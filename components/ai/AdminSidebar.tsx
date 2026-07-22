'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/admin/tasks', label: '전체 과제' },
  { href: '/admin/team-status', label: '팀 참여 현황' },
  { href: '/admin/teams', label: '참여팀 관리' },
  { href: '/admin/guides', label: 'AI 활용 방법 관리' },
]

export function AdminSidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 min-h-screen sticky top-0 flex flex-col">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-gray-100 flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-orange-500 text-white flex items-center justify-center text-sm">🤖</div>
        <span className="font-bold text-sm text-gray-900">AI 해커톤 관리자</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {LINKS.map(l => {
          const active = pathname === l.href
          return (
            <Link key={l.href} href={l.href}
              className={`block text-sm font-semibold px-3 py-2 rounded-lg transition-colors ${
                active ? 'bg-orange-50 text-orange-600' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}>
              {l.label}
            </Link>
          )
        })}
      </nav>
      <div className="px-3 py-4 border-t border-gray-100 flex-shrink-0">
        <button
          onClick={async () => { await fetch('/api/admin-auth/logout', { method: 'POST' }); window.location.href = '/admin/login' }}
          className="w-full inline-flex items-center justify-center gap-1 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 hover:border-gray-300 px-2.5 py-2 rounded-lg transition-colors">
          로그아웃
        </button>
      </div>
    </aside>
  )
}
