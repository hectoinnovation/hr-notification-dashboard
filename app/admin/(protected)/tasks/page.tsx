'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  STATUS_LABEL, RESOLUTION_LABEL, TASK_CATEGORY_LABEL, TASK_CATEGORY_ORDER, sortTasksByPriority, isExampleTask,
  type AiTask, type TaskStatus, type ResolutionType, type TaskCategory,
} from '@/lib/ai-tasks'
import { StatusBadge } from '@/components/ai/StatusBadge'
import { ResolutionBadge } from '@/components/ai/ResolutionBadge'
import { PriorityBadge } from '@/components/ai/PriorityBadge'
import { TaskCategoryBadge } from '@/components/ai/TaskCategoryBadge'
import { FilterChip } from '@/components/ui/FilterChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { TaskDetailModal } from '@/components/ai/TaskDetailModal'

function AdminTasksContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const statusF     = (searchParams.get('status') ?? '전체') as '전체' | TaskStatus
  const resolutionF = (searchParams.get('resolution') ?? '전체') as '전체' | ResolutionType
  const categoryF   = (searchParams.get('category') ?? '전체') as '전체' | TaskCategory
  const q           = searchParams.get('q') ?? ''
  const selectedId  = searchParams.get('id')

  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(q)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('ai_tasks').select('*').order('created_at', { ascending: false })
    if (error) console.error('[전체 과제] ai_tasks 조회 실패:', error.message)
    setTasks(sortTasksByPriority((data ?? []) as AiTask[]))
    setLoading(false)
  }, [])
  useEffect(() => { (async () => { await load() })() }, [load])

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === '전체') params.delete(key); else params.set(key, value)
    router.replace(`/admin/tasks?${params.toString()}`)
  }

  function openTask(id: string) { updateParam('id', id) }
  function closeTask() { updateParam('id', '') }

  const filtered = tasks.filter(t => {
    if (statusF !== '전체' && t.status !== statusF) return false
    if (resolutionF !== '전체' && t.resolution_type !== resolutionF) return false
    if (categoryF !== '전체' && t.task_category !== categoryF) return false
    const term = search.trim().toLowerCase()
    if (term) {
      const text = [t.title, t.author, t.team].filter(Boolean).join(' ').toLowerCase()
      if (!text.includes(term)) return false
    }
    return true
  })

  const selectedTask = tasks.find(t => t.id === selectedId) ?? null

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">전체 과제</h1>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-2.5">
        <input value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') updateParam('q', search) }}
          onBlur={() => updateParam('q', search)}
          placeholder="제목, 작성자, 팀 검색..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">진행 상태</span>
          <FilterChip label="전체" active={statusF === '전체'} onClick={() => updateParam('status', '전체')} />
          <FilterChip label={STATUS_LABEL.in_progress} active={statusF === 'in_progress'} onClick={() => updateParam('status', 'in_progress')} />
          <FilterChip label={STATUS_LABEL.done} active={statusF === 'done'} onClick={() => updateParam('status', 'done')} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">해결 방식</span>
          <FilterChip label="전체" active={resolutionF === '전체'} onClick={() => updateParam('resolution', '전체')} />
          <FilterChip label={RESOLUTION_LABEL.self} active={resolutionF === 'self'} onClick={() => updateParam('resolution', 'self')} />
          <FilterChip label={RESOLUTION_LABEL.help} active={resolutionF === 'help'} onClick={() => updateParam('resolution', 'help')} />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-400">과제 대분류</span>
          <FilterChip label="전체" active={categoryF === '전체'} onClick={() => updateParam('category', '전체')} />
          {TASK_CATEGORY_ORDER.map(c => (
            <FilterChip key={c} label={TASK_CATEGORY_LABEL[c]} active={categoryF === c} onClick={() => updateParam('category', c)} />
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">{filtered.length}건</p>

      {loading ? <LoadingState />
        : filtered.length === 0 ? (
          tasks.length === 0
            ? <EmptyState label="등록된 AI 과제가 없습니다." description="AI 과제를 등록하면 이곳에 표시됩니다." />
            : <EmptyState label="조건에 맞는 과제가 없습니다." description="검색어나 필터를 조정해보세요." />
        )
        : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-4 py-2.5 font-medium">제목</th>
                  <th className="px-4 py-2.5 font-medium">팀</th>
                  <th className="px-4 py-2.5 font-medium">작성자</th>
                  <th className="px-4 py-2.5 font-medium">진행 상태</th>
                  <th className="px-4 py-2.5 font-medium">해결 방식</th>
                  <th className="px-4 py-2.5 font-medium">대분류</th>
                  <th className="px-4 py-2.5 font-medium">담당자</th>
                  <th className="px-4 py-2.5 font-medium">우선순위</th>
                  <th className="px-4 py-2.5 font-medium">좋아요</th>
                  <th className="px-4 py-2.5 font-medium">등록일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id} onClick={() => openTask(t.id)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-gray-800">
                      <div className="flex items-center gap-1.5">
                        {isExampleTask(t) && (
                          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded flex-shrink-0">예시</span>
                        )}
                        <span>{t.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{t.team}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t.author}</td>
                    <td className="px-4 py-2.5"><StatusBadge status={t.status} /></td>
                    <td className="px-4 py-2.5"><ResolutionBadge type={t.resolution_type} /></td>
                    <td className="px-4 py-2.5"><TaskCategoryBadge category={t.task_category} /></td>
                    <td className="px-4 py-2.5 text-gray-600">{t.assignee ?? '-'}</td>
                    <td className="px-4 py-2.5">
                      {t.resolution_type === 'help' ? <PriorityBadge priority={t.priority} /> : <span className="text-xs text-gray-300">-</span>}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">❤️ {t.likes_count ?? 0}</td>
                    <td className="px-4 py-2.5 text-gray-400">{t.created_at.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {selectedTask && (
        <TaskDetailModal
          key={selectedTask.id}
          task={selectedTask}
          onClose={closeTask}
          onSaved={() => { closeTask(); load() }}
          onDeleted={() => { closeTask(); load() }}
        />
      )}
    </div>
  )
}

export default function AdminTasksPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AdminTasksContent />
    </Suspense>
  )
}
