import { TASK_CATEGORY_LABEL, TASK_CATEGORY_ORDER, type TaskCategory } from '@/lib/ai-tasks'

const CLASSIFIED_CLASS = 'bg-indigo-50 text-indigo-700 border-indigo-200'
const UNCLASSIFIED_CLASS = 'bg-gray-50 text-gray-400 border-gray-200'

/**
 * 과제 대분류(Agent·업무봇 등) 배지 — ClassificationBadge(개선 방식)와는 다른 축이니 혼동 금지.
 * onSelect를 넘기면 배지 자체가 클릭 가능한 선택 메뉴로 동작하고, 선택 즉시 onSelect가 호출된다
 * (읽기 전용으로 쓸 곳에서는 onSelect를 생략하면 기존처럼 일반 배지로 표시된다).
 */
export function TaskCategoryBadge({ category, onSelect }: {
  category: TaskCategory | null | undefined
  onSelect?: (value: TaskCategory | null) => void
}) {
  const colorClass = category ? CLASSIFIED_CLASS : UNCLASSIFIED_CLASS

  if (onSelect) {
    return (
      <select
        value={category ?? ''}
        onChange={e => onSelect((e.target.value || null) as TaskCategory | null)}
        className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-orange-400 ${colorClass}`}>
        <option value="">미분류</option>
        {TASK_CATEGORY_ORDER.map(c => <option key={c} value={c}>{TASK_CATEGORY_LABEL[c]}</option>)}
      </select>
    )
  }

  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${colorClass}`}>
      {category ? TASK_CATEGORY_LABEL[category] : '미분류'}
    </span>
  )
}
