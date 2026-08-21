'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import {
  CLASSIFICATION_LABEL, CLASSIFICATION_ORDER, RESOLUTION_LABEL,
  TASK_CATEGORY_LABEL, TASK_CATEGORY_ORDER, isExampleTask,
  type AiTask, type ClassificationType, type TaskCategory,
} from '@/lib/ai-tasks'
import { ClassificationBadge } from '@/components/ai/ClassificationBadge'
import { TaskCategoryBadge } from '@/components/ai/TaskCategoryBadge'
import { FilterChip } from '@/components/ui/FilterChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'

type ClassificationFilter = '전체' | ClassificationType | 'unclassified'
type CategoryFilter = '전체' | TaskCategory | 'unclassified'

export default function TaskAnalysisPage() {
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [classificationFilter, setClassificationFilter] = useState<ClassificationFilter>('전체')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('전체')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null)
  const [reasonDraft, setReasonDraft] = useState('')
  const [savingReason, setSavingReason] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('ai_tasks').select('*').order('created_at', { ascending: false })
    if (error) console.error('[과제 분석] ai_tasks 조회 실패:', error.message)
    setTasks(((data ?? []) as AiTask[]).filter(t => !isExampleTask(t)))
    setLoading(false)
  }, [])
  useEffect(() => { (async () => { await load() })() }, [load])

  const classificationSummary = useMemo(() => {
    const counts: Record<ClassificationType, number> = { automation: 0, efficiency: 0, advancement: 0, new_usage: 0, needs_review: 0 }
    let unclassified = 0
    for (const t of tasks) {
      if (t.classification_type) counts[t.classification_type]++
      else unclassified++
    }
    return { counts, unclassified }
  }, [tasks])

  const categorySummary = useMemo(() => {
    const counts = {} as Record<TaskCategory, number>
    for (const c of TASK_CATEGORY_ORDER) counts[c] = 0
    let unclassified = 0
    for (const t of tasks) {
      if (t.task_category) counts[t.task_category]++
      else unclassified++
    }
    return { counts, unclassified }
  }, [tasks])

  const filtered = tasks.filter(t => {
    if (classificationFilter !== '전체') {
      const excluded = classificationFilter === 'unclassified' ? !!t.classification_type : t.classification_type !== classificationFilter
      if (excluded) return false
    }
    if (categoryFilter !== '전체') {
      const excluded = categoryFilter === 'unclassified' ? !!t.task_category : t.task_category !== categoryFilter
      if (excluded) return false
    }
    return true
  })

  async function overrideClassification(taskId: string, value: ClassificationType) {
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, classification_type: value, classification_by: 'admin', classified_at: new Date().toISOString() }
      : t))
    const { error } = await supabase.from('ai_tasks').update({
      classification_type: value,
      classification_by: 'admin',
      classified_at: new Date().toISOString(),
    }).eq('id', taskId)
    if (error) setSaveError(`개선 방식 수정 저장 실패: ${error.message}`)
  }

  async function overrideCategory(taskId: string, value: TaskCategory) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, task_category: value } : t))
    const { error } = await supabase.from('ai_tasks').update({ task_category: value }).eq('id', taskId)
    if (error) setSaveError(`과제 대분류 수정 저장 실패: ${error.message}`)
  }

  function startEditReason(t: AiTask) {
    setSaveError(null)
    setEditingReasonId(t.id)
    setReasonDraft(t.classification_reason ?? '')
  }

  function cancelEditReason() {
    setEditingReasonId(null)
    setReasonDraft('')
  }

  async function saveReason(taskId: string) {
    const value = reasonDraft.trim()
    setSavingReason(true)
    const nowIso = new Date().toISOString()
    const { error } = await supabase.from('ai_tasks').update({
      classification_reason: value || null,
      classification_by: 'admin',
      classified_at: nowIso,
    }).eq('id', taskId)
    setSavingReason(false)
    if (error) { setSaveError(`판단 근거 저장 실패: ${error.message}`); return }
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, classification_reason: value || undefined, classification_by: 'admin', classified_at: nowIso }
      : t))
    setEditingReasonId(null)
    setReasonDraft('')
  }

  // 첨부파일 2개 슬롯(개선방향/결과물)을 한 셀에 "라벨: 값" 형태로 합쳐 정보 손실 없이 표시.
  function joinAttachments(t: AiTask, pick: 'name' | 'url'): string {
    const parts: string[] = []
    const aiUsageVal = pick === 'name' ? t.ai_usage_file_name : t.ai_usage_file_url
    const resultVal = pick === 'name' ? t.result_file_name : t.result_file_url
    if (t.ai_usage_file_url && aiUsageVal) parts.push(`개선방향: ${aiUsageVal}`)
    if (t.result_file_url && resultVal) parts.push(`결과물: ${resultVal}`)
    return parts.join(' / ')
  }

  function handleDownloadAnalysis() {
    const rows = tasks.map(t => ({
      '과제 ID': t.id,
      '팀명': t.team,
      '작성자': t.author,
      '과제명': t.title,
      '개선하고 싶은 업무/프로세스': t.current_work ?? '',
      'AI 활용/개선 방향': t.ai_usage ?? '',
      '해결 방식': RESOLUTION_LABEL[t.resolution_type],
      '첨부파일명': joinAttachments(t, 'name'),
      '첨부파일 URL': joinAttachments(t, 'url'),
      '개선 방식': t.classification_type ? CLASSIFICATION_LABEL[t.classification_type] : '',
      '과제 대분류': t.task_category ? TASK_CATEGORY_LABEL[t.task_category] : '',
      '판단 근거': t.classification_reason ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '과제 분석')
    const todayStr = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `AI과제_분석자료_${todayStr}.xlsx`)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">과제 분석</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          과제별 개선 방식·대분류 현황입니다. 개선 방식, 과제 대분류, 판단 근거 모두 이 화면에서 직접 입력·수정할 수 있습니다.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-gray-700">
              전체 {tasks.length}건 | 자동화 {classificationSummary.counts.automation} | 효율화 {classificationSummary.counts.efficiency} | 고도화 {classificationSummary.counts.advancement} | 신규 활용 {classificationSummary.counts.new_usage} | 판단 필요 {classificationSummary.counts.needs_review}
              {classificationSummary.unclassified > 0 && <span className="text-gray-400 font-normal"> (미분류 {classificationSummary.unclassified})</span>}
            </p>
            <p className="text-xs text-gray-500">
              {TASK_CATEGORY_ORDER.map(c => `${TASK_CATEGORY_LABEL[c]} ${categorySummary.counts[c]}`).join(' | ')}
              {categorySummary.unclassified > 0 && <span className="text-gray-400"> | 미분류 {categorySummary.unclassified}</span>}
            </p>
          </div>
          <button onClick={handleDownloadAnalysis} disabled={loading || tasks.length === 0}
            className="text-sm font-semibold px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-40">
            분석자료 다운로드
          </button>
        </div>

        {saveError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>}

        <div className="space-y-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400 mr-1">개선 방식</span>
            <FilterChip label="전체" active={classificationFilter === '전체'} onClick={() => setClassificationFilter('전체')} />
            {CLASSIFICATION_ORDER.map(c => (
              <FilterChip key={c} label={CLASSIFICATION_LABEL[c]} active={classificationFilter === c} onClick={() => setClassificationFilter(c)} />
            ))}
            <FilterChip label="미분류" active={classificationFilter === 'unclassified'} onClick={() => setClassificationFilter('unclassified')} />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400 mr-1">과제 대분류</span>
            <FilterChip label="전체" active={categoryFilter === '전체'} onClick={() => setCategoryFilter('전체')} />
            {TASK_CATEGORY_ORDER.map(c => (
              <FilterChip key={c} label={TASK_CATEGORY_LABEL[c]} active={categoryFilter === c} onClick={() => setCategoryFilter(c)} />
            ))}
            <FilterChip label="미분류" active={categoryFilter === 'unclassified'} onClick={() => setCategoryFilter('unclassified')} />
          </div>
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
                  <th className="px-4 py-2.5 font-medium">개선 방식</th>
                  <th className="px-4 py-2.5 font-medium">과제 대분류</th>
                  <th className="px-4 py-2.5 font-medium min-w-[20rem]">판단 근거</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const isEditing = editingReasonId === t.id
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
                            className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400">
                            <option value="" disabled>수정</option>
                            {CLASSIFICATION_ORDER.map(c => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}
                          </select>
                        </div>
                        {t.classification_by === 'admin' && (
                          <span className="text-[11px] text-gray-400 mt-1 block">관리자 수정</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <TaskCategoryBadge category={t.task_category} />
                          <select
                            value={t.task_category ?? ''}
                            onChange={e => overrideCategory(t.id, e.target.value as TaskCategory)}
                            className="text-xs border border-gray-200 rounded-lg px-1.5 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-400">
                            <option value="" disabled>수정</option>
                            {TASK_CATEGORY_ORDER.map(c => <option key={c} value={c}>{TASK_CATEGORY_LABEL[c]}</option>)}
                          </select>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {isEditing ? (
                          <div className="space-y-1.5">
                            <textarea
                              value={reasonDraft}
                              onChange={e => setReasonDraft(e.target.value)}
                              rows={3}
                              autoFocus
                              placeholder="판단 근거를 입력하세요"
                              className="w-full min-w-[18rem] text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-y"
                            />
                            <div className="flex items-center gap-2">
                              <button onClick={() => saveReason(t.id)} disabled={savingReason}
                                className="text-xs font-semibold px-3 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-lg transition-colors">
                                저장
                              </button>
                              <button onClick={cancelEditReason} disabled={savingReason}
                                className="text-xs font-semibold px-3 py-1.5 border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-lg transition-colors">
                                취소
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => startEditReason(t)}
                            className="group flex items-start justify-between gap-2 cursor-pointer rounded-lg px-1 py-0.5 -mx-1 hover:bg-gray-50 transition-colors">
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {t.classification_reason ?? <span className="text-gray-300">판단 근거 없음 — 클릭해서 입력</span>}
                            </p>
                            <span className="text-[11px] font-semibold text-gray-300 group-hover:text-orange-500 flex-shrink-0 whitespace-nowrap transition-colors">
                              수정
                            </span>
                          </div>
                        )}
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
