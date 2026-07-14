import { STATUS_LABEL, type TaskStatus } from '@/lib/ai-tasks'

/** 진행 상태 배지 (진행중/완료) — 해결 방식(ResolutionBadge)과 혼동하지 말 것 */
export function StatusBadge({ status }: { status: TaskStatus }) {
  const cls = status === 'done'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-blue-50 text-blue-700 border-blue-200'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${cls}`}>
      {STATUS_LABEL[status]}
    </span>
  )
}
