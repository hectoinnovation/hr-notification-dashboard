'use client'

import { useState } from 'react'
import type { AiTeam } from '@/lib/ai-tasks'

// 검색 가능한 팀 선택 Combobox — 팀 수가 많아져도(현재 30개 이상) 입력으로 빠르게
// 좁혀나갈 수 있도록 기존 <select> 대신 사용한다. 열려 있는 동안에는 입력값(query)으로
// 필터링하고, 닫혀 있을 때는 확정된 선택값(value)을 그대로 보여준다.
export function TeamCombobox({ teams, value, onChange }: {
  teams: AiTeam[]; value: string; onChange: (name: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)

  const filtered = query.trim()
    ? teams.filter(t => t.name.toLowerCase().includes(query.trim().toLowerCase()))
    : teams

  function selectTeam(name: string) {
    onChange(name)
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlighted]) selectTeam(filtered[highlighted].name)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div className="relative">
      <input
        value={open ? query : value}
        onChange={e => { setQuery(e.target.value); setHighlighted(0); if (!open) setOpen(true) }}
        onFocus={() => { setOpen(true); setQuery('') }}
        onBlur={() => { setTimeout(() => { setOpen(false); setQuery('') }, 100) }}
        onKeyDown={handleKeyDown}
        placeholder="팀명 검색..."
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white placeholder:text-gray-300"
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">검색 결과가 없습니다.</p>
          ) : (
            filtered.map((t, i) => (
              <button key={t.id} type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => selectTeam(t.name)}
                onMouseEnter={() => setHighlighted(i)}
                className={`block w-full text-left text-sm px-3 py-2 transition-colors ${
                  i === highlighted ? 'bg-orange-50 text-orange-700' : 'text-gray-700 hover:bg-gray-50'
                }`}>
                {t.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
