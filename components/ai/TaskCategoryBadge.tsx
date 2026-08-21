import { TASK_CATEGORY_LABEL, type TaskCategory } from '@/lib/ai-tasks'

/** 과제 대분류(Agent·업무봇 등) 배지 — ClassificationBadge(개선 방식)와는 다른 축이니 혼동 금지 */
export function TaskCategoryBadge({ category }: { category: TaskCategory | null | undefined }) {
  if (!category) {
    return (
      <span className="text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 bg-gray-50 text-gray-400 border-gray-200">
        미분류
      </span>
    )
  }
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 bg-indigo-50 text-indigo-700 border-indigo-200">
      {TASK_CATEGORY_LABEL[category]}
    </span>
  )
}
