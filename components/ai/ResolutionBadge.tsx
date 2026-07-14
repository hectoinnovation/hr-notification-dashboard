import { RESOLUTION_LABEL, type ResolutionType } from '@/lib/ai-tasks'

/** 해결 방식 배지 (자체 해결/도움 필요) — 진행 상태(StatusBadge)와 혼동하지 말 것 */
export function ResolutionBadge({ type }: { type: ResolutionType }) {
  const cls = type === 'self'
    ? 'bg-purple-50 text-purple-700 border-purple-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${cls}`}>
      {RESOLUTION_LABEL[type]}
    </span>
  )
}
