'use client'

import { useState, type ReactNode } from 'react'
import type { AiTask } from '@/lib/ai-tasks'
import { StatusBadge } from './StatusBadge'
import { ResolutionBadge } from './ResolutionBadge'
import { PriorityBadge } from './PriorityBadge'

export function TaskCard({ task, onClick, expandedContent, showPriority = false }: {
  task: AiTask
  onClick?: () => void
  expandedContent?: ReactNode
  showPriority?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const toggle = () => {
    if (onClick) { onClick(); return }
    if (expandedContent) setExpanded(p => !p)
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <button onClick={toggle} className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-bold text-gray-900">{task.title}</span>
          <StatusBadge status={task.status} />
          <ResolutionBadge type={task.resolution_type} />
          {showPriority && <PriorityBadge priority={task.priority} />}
        </div>
        <p className="text-xs text-gray-400">
          {task.department} · {task.author} · {task.created_at.slice(0, 10)}
        </p>
      </button>
      {expanded && expandedContent && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          {expandedContent}
        </div>
      )}
    </div>
  )
}
