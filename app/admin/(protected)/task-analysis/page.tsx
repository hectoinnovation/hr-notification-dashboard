'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { CLASSIFICATION_LABEL, isExampleTask, type AiTask, type ClassificationType } from '@/lib/ai-tasks'
import { ClassificationBadge } from '@/components/ai/ClassificationBadge'
import { FilterChip } from '@/components/ui/FilterChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'

type FilterValue = '전체' | ClassificationType | 'unclassified'

async function classifyTask(taskId: string): Promise<
  | { ok: true; classification_type: ClassificationType; classification_reason: string }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch('/api/ai-tasks/classify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId }),
    })
    const data = await res.json()
    if (!res.ok) return { ok: false, error: data.error ?? '분류 요청이 실패했습니다.' }
    return { ok: true, classification_type: data.classification_type, classification_reason: data.classification_reason }
  } catch {
    return { ok: false, error: '네트워크 오류로 분류 요청이 실패했습니다.' }
  }
}

export default function TaskAnalysisPage() {
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterValue>('전체')
  const [runningAll, setRunningAll] = useState(false)
  const [runningIds, setRunningIds] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('ai_tasks').select('*').order('created_at', { ascending: false })
    if (error) console.error('[과제 분석] ai_tasks 조회 실패:', error.message)
    setTasks(((data ?? []) as AiTask[]).filter(t => !isExampleTask(t)))
    setLoading(false)
  }, [])
  useEffect(() => { (async () => { await load() })() }, [load])

  const summary = useMemo(() => {
    const counts = { automation: 0, efficiency: 0, needs_review: 0, unclassified: 0 }
    for (const t of tasks) {
      if (t.classification_type) counts[t.classification_type]++
      else counts.unclassified++
    }
    return { total: tasks.length, ...counts }
  }, [tasks])

  const filtered = tasks.filter(t => {
    if (filter === '전체') return true
    if (filter === 'unclassified') return !t.classification_type
    return t.classification_type === filter
  })

  function applyResult(taskId: string, classification_type: ClassificationType, classification_reason: string) {
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, classification_type, classification_reason, classification_by: 'ai', classified_at: new Date().toISOString() }
      : t))
  }

  async function reanalyzeOne(taskId: string) {
    setRunningIds(prev => new Set(prev).add(taskId))
    const result = await classifyTask(taskId)
    setRunningIds(prev => { const next = new Set(prev); next.delete(taskId); return next })
    if (!result.ok) { setRunError(`"${tasks.find(t => t.id === taskId)?.title}" 분류 실패: ${result.error}`); return }
    setRunError(null)
    applyResult(taskId, result.classification_type, result.classification_reason)
  }

  async function runAllUnclassified() {
    const targets = tasks.filter(t => !t.classification_type)
    if (targets.length === 0) return
    setRunningAll(true)
    setRunError(null)
    setProgress({ done: 0, total: targets.length })
    let failCount = 0
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]
      setRunningIds(prev => new Set(prev).add(t.id))
      const result = await classifyTask(t.id)
      setRunningIds(prev => { const next = new Set(prev); next.delete(t.id); return next })
      if (result.ok) {
        applyResult(t.id, result.classification_type, result.classification_reason)
      } else {
        failCount++
      }
      setProgress({ done: i + 1, total: targets.length })
    }
    setRunningAll(false)
    setProgress(null)
    if (failCount > 0) setRunError(`${failCount}건 분류에 실패했습니다. 해당 과제는 개별 "재분석"으로 다시 시도해주세요.`)
  }

  async function overrideClassification(taskId: string, value: ClassificationType) {
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, classification_type: value, classification_by: 'admin', classified_at: new Date().toISOString() }
      : t))
    const { error } = await supabase.from('ai_tasks').update({
      classification_type: value,
      classification_by: 'admin',
      classified_at: new Date().toISOString(),
    }).eq('id', taskId)
    if (error) setRunError(`분류 수정 저장 실패: ${error.message}`)
  }

  const unclassifiedCount = summary.unclassified

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">과제 분석</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Claude(Anthropic API)가 과제 본문과 이미지/PDF 첨부파일을 읽고 자동화/효율화 여부를 1차 분류합니다. 결과는 DB에 저장되어 다시 접속해도 유지됩니다.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm font-semibold text-gray-700">
            전체 {summary.total}건 | 자동화 {summary.automation}건 | 효율화 {summary.efficiency}건 | 판단 필요 {summary.needs_review}건
            {unclassifiedCount > 0 && <span className="text-gray-400 font-normal"> (미분류 {unclassifiedCount}건)</span>}
          </p>
          <button onClick={runAllUnclassified} disabled={runningAll || unclassifiedCount === 0}
            className="text-sm font-semibold px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
            {runningAll ? `분류 실행 중... (${progress?.done ?? 0}/${progress?.total ?? 0})` : unclassifiedCount === 0 ? '미분류 과제 없음' : `AI 분류 실행 (미분류 ${unclassifiedCount}건)`}
          </button>
        </div>

        {runError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{runError}</p>}

        <div className="flex items-center gap-1.5 flex-wrap">
          <FilterChip label="전체" active={filter === '전체'} onClick={() => setFilter('전체')} />
          <FilterChip label={CLASSIFICATION_LABEL.automation} active={filter === 'automation'} onClick={() => setFilter('automation')} />
          <FilterChip label={CLASSIFICATION_LABEL.efficiency} active={filter === 'efficiency'} onClick={() => setFilter('efficiency')} />
          <FilterChip label={CLASSIFICATION_LABEL.needs_review} active={filter === 'needs_review'} onClick={() => setFilter('needs_review')} />
          <FilterChip label="미분류" active={filter === 'unclassified'} onClick={() => setFilter('unclassified')} />
        </div>
      </div>

      {loading ? <LoadingState />
        : filtered.length === 0 ? (
          <EmptyState label="조건에 맞는 과제가 없습니다." description="필터를 조정해보세요." />
        )
        : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-4 py-2.5 font-medium">팀</th>
                  <th className="px-4 py-2.5 font-medium">과제명</th>
                  <th className="px-4 py-2.5 font-medium">AI 분류</th>
                  <th className="px-4 py-2.5 font-medium">판단 근거</th>
                  <th className="px-4 py-2.5 font-medium w-20"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const isRunning = runningIds.has(t.id)
                  return (
                    <tr key={t.id} className="border-b border-gray-50 last:border-0 align-top">
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{t.team}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800 max-w-xs">{t.title}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <ClassificationBadge type={t.classification_type} />
                          <select
                            value={t.classification_type ?? ''}
                            onChange={e => overrideClassification(t.id, e.target.value as ClassificationType)}
                            disabled={isRunning}
                            className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-40">
                            <option value="" disabled>수정</option>
                            <option value="automation">{CLASSIFICATION_LABEL.automation}</option>
                            <option value="efficiency">{CLASSIFICATION_LABEL.efficiency}</option>
                            <option value="needs_review">{CLASSIFICATION_LABEL.needs_review}</option>
                          </select>
                        </div>
                        {t.classification_by === 'admin' && (
                          <span className="text-[11px] text-gray-400 mt-1 block">관리자 수정</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-md">
                        {t.classification_reason ?? <span className="text-gray-300">-</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => reanalyzeOne(t.id)} disabled={isRunning || runningAll}
                          className="text-xs font-semibold text-gray-400 hover:text-orange-600 disabled:opacity-40 transition-colors whitespace-nowrap">
                          {isRunning ? '분석 중...' : '재분석'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
