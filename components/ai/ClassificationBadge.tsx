import { CLASSIFICATION_LABEL, CLASSIFICATION_ORDER, type ClassificationType } from '@/lib/ai-tasks'

const COLOR_CLASS: Record<ClassificationType, string> = {
  automation: 'bg-blue-50 text-blue-700 border-blue-200',
  efficiency: 'bg-teal-50 text-teal-700 border-teal-200',
  advancement: 'bg-purple-50 text-purple-700 border-purple-200',
  new_usage: 'bg-pink-50 text-pink-700 border-pink-200',
  needs_review: 'bg-amber-50 text-amber-700 border-amber-200',
}
const UNCLASSIFIED_CLASS = 'bg-gray-50 text-gray-400 border-gray-200'

/**
 * 개선 방식(자동화/효율화/고도화/신규 활용/판단 필요) 배지 — StatusBadge(진행 상태)와는 다른 축이니 혼동 금지.
 * onSelect를 넘기면 배지 자체가 클릭 가능한 선택 메뉴로 동작하고, 선택 즉시 onSelect가 호출된다
 * (읽기 전용으로 쓸 곳에서는 onSelect를 생략하면 기존처럼 일반 배지로 표시된다).
 */
export function ClassificationBadge({ type, onSelect }: {
  type: ClassificationType | null | undefined
  onSelect?: (value: ClassificationType | null) => void
}) {
  const colorClass = type ? COLOR_CLASS[type] : UNCLASSIFIED_CLASS

  if (onSelect) {
    return (
      <select
        value={type ?? ''}
        onChange={e => onSelect((e.target.value || null) as ClassificationType | null)}
        className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-400 ${colorClass}`}>
        <option value="">미분류</option>
        {CLASSIFICATION_ORDER.map(c => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}
      </select>
    )
  }

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${colorClass}`}>
      {type ? CLASSIFICATION_LABEL[type] : '미분류'}
    </span>
  )
}
