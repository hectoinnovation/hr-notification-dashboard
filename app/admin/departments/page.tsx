'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { DEPARTMENTS, aggregateByDepartment, type AiTask } from '@/lib/ai-tasks'
import { StatusBadge } from '@/components/ai/StatusBadge'
import { ResolutionBadge } from '@/components/ai/ResolutionBadge'
import { FilterChip } from '@/components/ui/FilterChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { DepartmentChart } from '@/components/ai/DepartmentChart'

export default function AdminDepartmentsPage() {
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [dept, setDept] = useState('전체')

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('ai_tasks').select('*').order('created_at', { ascending: false })
      setTasks((data ?? []) as AiTask[])
      setLoading(false)
    })()
  }, [])

  const filtered = dept === '전체' ? tasks : tasks.filter(t => t.department === dept)
  const deptCounts = aggregateByDepartment(tasks)

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">부서별 현황</h1>

      {!loading && <DepartmentChart data={deptCounts} />}

      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChip label="전체" active={dept === '전체'} onClick={() => setDept('전체')} count={tasks.length} />
        {DEPARTMENTS.map(d => (
          <FilterChip key={d} label={d} active={dept === d} onClick={() => setDept(d)}
            count={deptCounts.find(c => c.department === d)?.count ?? 0} />
        ))}
      </div>

      {loading ? <p className="text-sm text-gray-400">불러오는 중...</p>
        : filtered.length === 0 ? <EmptyState label="등록된 과제가 없습니다" />
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
