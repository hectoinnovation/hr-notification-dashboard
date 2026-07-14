import { PRIORITY_LABEL, type Priority } from '@/lib/ai-tasks'

export function PriorityBadge({ priority }: { priority?: Priority }) {
  if (!priority) return <span className="text-xs text-gray-300">-</span>
  const cls = priority === 'high' ? 'bg-red-50 text-red-700 border-red-200'
            : priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-gray-50 text-gray-500 border-gray-200'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${cls}`}>
      {PRIORITY_LABEL[priority]}
    </span>
  )
}
