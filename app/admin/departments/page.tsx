'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { DEPARTMENTS, aggregateByDepartment, aggregateDepartmentStats, type AiTask } from '@/lib/ai-tasks'
import { StatusBadge } from '@/components/ai/StatusBadge'
import { ResolutionBadge } from '@/components/ai/ResolutionBadge'
import { FilterChip } from '@/components/ui/FilterChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { DepartmentChart } from '@/components/ai/DepartmentChart'

export default function AdminDepartmentsPage() {
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [dept, setDept] = useState('전체')

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('ai_tasks').select('*').order('created_at', { ascending: false })
      if (error) console.error('[부서별 현황] ai_tasks 조회 실패:', error.message)
      setTasks((data ?? []) as AiTask[])
      setLoading(false)
    })()
  }, [])

  const filtered = dept === '전체' ? tasks : tasks.filter(t => t.department === dept)
  const deptCounts = aggregateByDepartment(tasks)
  const deptStats = aggregateDepartmentStats(tasks)

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">부서별 현황</h1>

      {!loading && tasks.length > 0 && <DepartmentChart data={deptCounts} />}

      {!loading && tasks.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                <th className="px-4 py-2.5 font-medium">부서</th>
                <th className="px-4 py-2.5 font-medium">등록 건수</th>
                <th className="px-4 py-2.5 font-medium">진행중</th>
                <th className="px-4 py-2.5 font-medium">완료</th>
                <th className="px-4 py-2.5 font-medium">도움 필요</th>
                <th className="px-4 py-2.5 font-medium">자체 해결</th>
              </tr>
            </thead>
            <tbody>
              {deptStats.map(s => (
                <tr key={s.department} className="border-b border-gray-50 last:border-0">
                  <td className="px-4 py-2.5 font-semibold text-gray-800">{s.department}</td>
                  <td className="px-4 py-2.5 text-gray-600">{s.total}</td>
                  <td className="px-4 py-2.5 text-blue-600">{s.inProgress}</td>
                  <td className="px-4 py-2.5 text-emerald-600">{s.done}</td>
                  <td className="px-4 py-2.5 text-amber-600">{s.help}</td>
                  <td className="px-4 py-2.5 text-purple-600">{s.self}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterChip label="전체" active={dept === '전체'} onClick={() => setDept('전체')} count={tasks.length} />
          {DEPARTMENTS.map(d => (
            <FilterChip key={d} label={d} active={dept === d} onClick={() => setDept(d)}
              count={deptCounts.find(c => c.department === d)?.count ?? 0} />
          ))}
        </div>
      )}

      {loading ? <LoadingState />
        : filtered.length === 0 ? (
          <EmptyState label="등록된 AI 과제가 없습니다." description="AI 과제를 등록하면 이곳에 표시됩니다." />
        )
        : (
          <div className="space-y-2">
            {filtered.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                  <span className="text-sm font-bold text-gray-900">{t.title}</span>
                  <StatusBadge status={t.status} />
                  <ResolutionBadge type={t.resolution_type} />
                </div>
                <p className="text-xs text-gray-400">{t.department} · {t.author} · {t.created_at.slice(0, 10)}</p>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}
