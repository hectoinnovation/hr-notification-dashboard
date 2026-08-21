import { CLASSIFICATION_LABEL, type ClassificationType } from '@/lib/ai-tasks'

const COLOR_CLASS: Record<ClassificationType, string> = {
  automation: 'bg-blue-50 text-blue-700 border-blue-200',
  efficiency: 'bg-teal-50 text-teal-700 border-teal-200',
  advancement: 'bg-purple-50 text-purple-700 border-purple-200',
  new_usage: 'bg-pink-50 text-pink-700 border-pink-200',
  needs_review: 'bg-amber-50 text-amber-700 border-amber-200',
}

/** 개선 방식(자동화/효율화/고도화/신규 활용/판단 필요) 배지 — StatusBadge(진행 상태)와는 다른 축이니 혼동 금지 */
export function ClassificationBadge({ type }: { type: ClassificationType | null | undefined }) {
  if (!type) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 bg-gray-50 text-gray-400 border-gray-200">
        미분류
      </span>
    )
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${COLOR_CLASS[type]}`}>
      {CLASSIFICATION_LABEL[type]}
    </span>
  )
}
