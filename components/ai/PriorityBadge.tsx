import { PRIORITY_LABEL, type Priority } from '@/lib/ai-tasks'

export function PriorityBadge({ priority }: { priority?: Priority }) {
  const p = priority ?? 'medium'
  const cls = p === 'urgent' ? 'bg-red-50 text-red-700 border-red-200'
            : p === 'high'   ? 'bg-orange-50 text-orange-700 border-orange-200'
            : p === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 whitespace-nowrap ${cls}`}>
      {PRIORITY_LABEL[p]}
    </span>
  )
}
