'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import {
  CLASSIFICATION_LABEL, RESOLUTION_LABEL, isExampleTask, parseClassificationValue,
  type AiTask, type ClassificationType,
} from '@/lib/ai-tasks'
import { ClassificationBadge } from '@/components/ai/ClassificationBadge'
import { FilterChip } from '@/components/ui/FilterChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'

type FilterValue = '전체' | ClassificationType | 'unclassified'

// 다운로드 파일의 컬럼 헤더 — "분석자료 다운로드"와 "분류 결과 일괄 반영" 업로드가
// 같은 헤더를 공유한다. 관리자가 다운로드한 파일에 분류값/판단 근거를 채워 그대로
// 다시 업로드하면 되는 구조.
const COL_ID = '과제 ID'
const COL_CLASSIFICATION = '분류값(automation/efficiency/needs_review)'
const COL_REASON = '판단 근거'

type BulkResult = { applied: number; skipped: { id: string; reason: string }[] }

export default function TaskAnalysisPage() {
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterValue>('전체')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function overrideClassification(taskId: string, value: ClassificationType) {
    setTasks(prev => prev.map(t => t.id === taskId
      ? { ...t, classification_type: value, classification_by: 'admin', classified_at: new Date().toISOString() }
      : t))
    const { error } = await supabase.from('ai_tasks').update({
      classification_type: value,
      classification_by: 'admin',
      classified_at: new Date().toISOString(),
    }).eq('id', taskId)
    if (error) setSaveError(`분류 수정 저장 실패: ${error.message}`)
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
      [COL_ID]: t.id,
      '팀명': t.team,
      '작성자': t.author,
      '과제명': t.title,
      '개선하고 싶은 업무/프로세스': t.current_work ?? '',
      'AI 활용/개선 방향': t.ai_usage ?? '',
      '해결 방식': RESOLUTION_LABEL[t.resolution_type],
      '첨부파일명': joinAttachments(t, 'name'),
      '첨부파일 URL': joinAttachments(t, 'url'),
      [COL_CLASSIFICATION]: t.classification_type ?? '',
      [COL_REASON]: t.classification_reason ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '과제 분석')
    const todayStr = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `AI과제_분석자료_${todayStr}.xlsx`)
  }

  async function handleBulkFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setSaveError(null)
    setBulkResult(null)
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      const skipped: { id: string; reason: string }[] = []
      let applied = 0

      for (const row of rows) {
        const id = String(row[COL_ID] ?? '').trim()
        const rawClassification = String(row[COL_CLASSIFICATION] ?? '').trim()
        const reason = String(row[COL_REASON] ?? '').trim()
        if (!id) continue // 빈 행은 조용히 건너뜀
        if (!rawClassification) { skipped.push({ id, reason: '분류값 없음' }); continue }

        const classification = parseClassificationValue(rawClassification)
        if (!classification) { skipped.push({ id, reason: `분류값 인식 불가: "${rawClassification}"` }); continue }

        const target = tasks.find(t => t.id === id)
        if (!target) { skipped.push({ id, reason: '해당 ID의 과제를 찾을 수 없음' }); continue }

        const nowIso = new Date().toISOString()
        const { error } = await supabase.from('ai_tasks').update({
          classification_type: classification,
          classification_reason: reason || target.classification_reason || null,
          classification_by: 'admin',
          classified_at: nowIso,
        }).eq('id', id)

        if (error) { skipped.push({ id, reason: error.message }); continue }
        applied++
      }

      setBulkResult({ applied, skipped })
      await load()
    } catch {
      setSaveError('파일을 읽는 중 오류가 발생했습니다. xlsx 형식을 확인해주세요.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const unclassifiedCount = summary.unclassified

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">과제 분석</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          과제별 자동화/효율화 분류 현황입니다. &quot;분석자료 다운로드&quot;로 전체 과제 내용을 받아 외부에서 분류한 뒤,
          같은 파일 형식(과제 ID / 분류값 / 판단 근거)으로 &quot;분류 결과 일괄 반영&quot;하면 됩니다.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <p className="text-sm font-semibold text-gray-700">
            전체 {summary.total}건 | 자동화 {summary.automation}건 | 효율화 {summary.efficiency}건 | 판단 필요 {summary.needs_review}건
            {unclassifiedCount > 0 && <span className="text-gray-400 font-normal"> (미분류 {unclassifiedCount}건)</span>}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={handleDownloadAnalysis} disabled={loading || tasks.length === 0}
              className="text-sm font-semibold px-4 py-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 rounded-lg transition-colors disabled:opacity-40">
              분석자료 다운로드
            </button>
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              className="text-sm font-semibold px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-200 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
              {uploading ? '반영 중...' : '분류 결과 일괄 반영'}
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFile} />
          </div>
        </div>

        {saveError && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{saveError}</p>}
        {bulkResult && (
          <div className="text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 space-y-1">
            <p className="font-semibold text-gray-700">{bulkResult.applied}건 반영 완료{bulkResult.skipped.length > 0 && `, ${bulkResult.skipped.length}건 건너뜀`}</p>
            {bulkResult.skipped.length > 0 && (
              <ul className="text-gray-500 space-y-0.5">
                {bulkResult.skipped.slice(0, 10).map((s, i) => <li key={i}>- {s.id}: {s.reason}</li>)}
                {bulkResult.skipped.length > 10 && <li>... 외 {bulkResult.skipped.length - 10}건</li>}
              </ul>
            )}
          </div>
        )}

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
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}
