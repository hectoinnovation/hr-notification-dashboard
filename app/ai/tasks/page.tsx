'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { STATUS_LABEL, RESOLUTION_LABEL, countCommentsByTask, type AiTask, type TaskStatus, type ResolutionType } from '@/lib/ai-tasks'
import { TaskCard } from '@/components/ai/TaskCard'
import { FilterChip } from '@/components/ui/FilterChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'

type SortOption = 'latest' | 'comments'

function AiTasksContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const statusF     = (searchParams.get('status') ?? '전체') as '전체' | TaskStatus
  const resolutionF = (searchParams.get('resolution') ?? '전체') as '전체' | ResolutionType
  const sort        = (searchParams.get('sort') ?? 'latest') as SortOption
  const q           = searchParams.get('q') ?? ''

  const [tasks, setTasks] = useState<AiTask[]>([])
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(q)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: taskRows, error: taskErr }, { data: commentRows, error: commentErr }] = await Promise.all([
      supabase.from('ai_tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('ai_comments').select('task_id'),
    ])
    if (taskErr) console.error('[등록된 과제] ai_tasks 조회 실패:', taskErr.message)
    if (commentErr) console.error('[등록된 과제] ai_comments 조회 실패:', commentErr.message)
    setTasks((taskRows ?? []) as AiTask[])
    setCommentCounts(countCommentsByTask((commentRows ?? []) as { task_id: string }[]))
    setLoading(false)
  }, [])
  useEffect(() => { (async () => { await load() })() }, [load])

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (!value || value === '전체') params.delete(key); else params.set(key, value)
    router.replace(`/ai/tasks?${params.toString()}`)
  }

  const filtered = tasks.filter(t => {
    if (statusF !== '전체' && t.status !== statusF) return false
    if (resolutionF !== '전체' && t.resolution_type !== resolutionF) return false
    const term = search.trim().toLowerCase()
    if (term) {
      const text = [t.title, t.author, t.team].filter(Boolean).join(' ').toLowerCase()
      if (!text.includes(term)) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'comments') {
      const diff = (commentCounts[b.id] ?? 0) - (commentCounts[a.id] ?? 0)
      if (diff !== 0) return diff
    }
    return b.created_at.localeCompare(a.created_at)
  })

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">등록된 과제</h1>
        <p className="text-sm text-gray-400 mt-0.5">동료들이 AI로 해결했거나 도움을 구하는 업무를 둘러보세요.</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <input value={search} onChange={e => setSearch(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') updateParam('q', search) }}
          onBlur={() => updateParam('q', search)}
          placeholder="제목, 작성자, 팀 검색..."
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <FilterChip label="전체" active={statusF === '전체' && resolutionF === '전체'}
              onClick={() => { updateParam('status', '전체'); updateParam('resolution', '전체') }} />
            <FilterChip label={STATUS_LABEL.in_progress} active={statusF === 'in_progress'} onClick={() => updateParam('status', 'in_progress')} />
            <FilterChip label={STATUS_LABEL.done} active={statusF === 'done'} onClick={() => updateParam('status', 'done')} />
            <FilterChip label={RESOLUTION_LABEL.self} active={resolutionF === 'self'} onClick={() => updateParam('resolution', 'self')} />
            <FilterChip label={RESOLUTION_LABEL.help} active={resolutionF === 'help'} onClick={() => updateParam('resolution', 'help')} />
          </div>
          <select value={sort} onChange={e => updateParam('sort', e.target.value)}
            className="text-xs font-semibold border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400">
            <option value="latest">최신순</option>
            <option value="comments">댓글순</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-gray-400">{sorted.length}건</p>

      {loading ? <LoadingState />
        : sorted.length === 0 ? (
          tasks.length === 0 ? (
            <EmptyState icon="📂" label="등록된 AI 과제가 없습니다."
              description="AI 과제 등록 메뉴에서 첫 번째 과제를 등록해보세요." />
          ) : (
            <EmptyState icon="🔍" label="조건에 맞는 과제가 없습니다." description="검색어나 필터를 조정해보세요." />
          )
        )
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map(t => (
              <TaskCard key={t.id} task={t} commentCount={commentCounts[t.id] ?? 0} />
            ))}
          </div>
        )}
    </div>
  )
}

export default function AiTasksPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AiTasksContent />
    </Suspense>
  )
}
