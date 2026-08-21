import { CLASSIFICATION_LABEL, type ClassificationType } from '@/lib/ai-tasks'

/** 과제 분석(자동화/효율화/판단 필요) 배지 — StatusBadge(진행 상태)와는 다른 축이니 혼동 금지 */
export function ClassificationBadge({ type }: { type: ClassificationType | null | undefined }) {
  if (!type) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 bg-gray-50 text-gray-400 border-gray-200">
        미분류
      </span>
    )
  }
  const cls = type === 'automation'
    ? 'bg-blue-50 text-blue-700 border-blue-200'
    : type === 'efficiency'
    ? 'bg-teal-50 text-teal-700 border-teal-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${cls}`}>
      {CLASSIFICATION_LABEL[type]}
    </span>
  )
}
