'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { AiTask } from '@/lib/ai-tasks'
import { StatusBadge } from '@/components/ai/StatusBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'

export default function AiHelpNeededPage() {
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('ai_tasks').select('*').eq('resolution_type', 'help').order('created_at', { ascending: false })
      if (error) console.error('[도움 필요] ai_tasks 조회 실패:', error.message)
      setTasks((data ?? []) as AiTask[])
      setLoading(false)
    })()
  }, [])

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">도움 필요</h1>
      <p className="text-xs text-gray-400">담당자·멘토·우선순위는 관리자가 관리합니다. (조회 전용)</p>

      {loading ? <LoadingState />
        : tasks.length === 0 ? (
          <EmptyState
            label="등록된 AI 과제가 없습니다."
            description="AI 과제를 등록하면 이곳에 표시됩니다."
            actionLabel="AI 과제 등록하기"
            actionHref="/ai/register"
          />
        )
        : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-bold text-gray-900">{t.title}</span>
                  <StatusBadge status={t.status} />
                </div>
                <p className="text-xs text-gray-400">{t.department} · {t.author} · {t.created_at.slice(0, 10)}</p>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
