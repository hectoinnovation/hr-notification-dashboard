'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { aggregateByStatus, aggregateByResolutionType, aggregateByDepartment, type AiTask } from '@/lib/ai-tasks'
import { KpiCard } from '@/components/ui/KpiCard'
import { StatusChart } from './StatusChart'
import { DepartmentChart } from './DepartmentChart'
import { StatusBadge } from './StatusBadge'
import { ResolutionBadge } from './ResolutionBadge'
import { EmptyState } from '@/components/ui/EmptyState'

export function DashboardContent() {
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase.from('ai_tasks').select('*').order('created_at', { ascending: false })
      if (err) setError(err.message)
      setTasks((data ?? []) as AiTask[])
      setLoading(false)
    })()
  }, [])

  if (loading) return <p className="text-sm text-gray-400">불러오는 중...</p>
  if (error) return <p className="text-sm text-red-500">불러오기 실패: {error}</p>

  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const done = tasks.filter(t => t.status === 'done').length
  const self = tasks.filter(t => t.resolution_type === 'self').length
  const help = tasks.filter(t => t.resolution_type === 'help').length

  const recentRegistered = [...tasks].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5)
  const recentCompleted = tasks
    .filter(t => t.status === 'done' && t.completed_at)
    .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    .slice(0, 5)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard icon="📋" value={tasks.length} label="전체 과제" />
        <KpiCard icon="⏳" value={inProgress} label="진행중" color="text-blue-600" />
        <KpiCard icon="✅" value={done} label="완료" color="text-emerald-600" />
        <KpiCard icon="🙋" value={self} label="자체 해결" color="text-purple-600" />
        <KpiCard icon="🆘" value={help} label="도움 필요" color="text-amber-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <StatusChart title="진행 상태별 현황 (진행중 / 완료)" data={aggregateByStatus(tasks)} />
        <StatusChart title="해결 방식별 현황 (자체 해결 / 도움 필요)" data={aggregateByResolutionType(tasks)} />
      </div>

      <DepartmentChart data={aggregateByDepartment(tasks)} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">최근 등록 과제</p>
          {recentRegistered.length === 0 ? <EmptyState label="등록된 과제가 없습니다" /> : (
            <div className="space-y-2">
              {recentRegistered.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400">{t.department} · {t.author}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0"><StatusBadge status={t.status} /><ResolutionBadge type={t.resolution_type} /></div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-600 mb-3">최근 완료 과제</p>
          {recentCompleted.length === 0 ? <EmptyState label="완료된 과제가 없습니다" /> : (
            <div className="space-y-2">
              {recentCompleted.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-2 border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 truncate">{t.title}</p>
                    <p className="text-xs text-gray-400">{t.department} · {t.author} · {t.completed_at}</p>
                  </div>
                  <ResolutionBadge type={t.resolution_type} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
