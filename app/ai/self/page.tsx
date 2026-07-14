'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { AiTask, TaskStatus } from '@/lib/ai-tasks'
import { STATUS_LABEL } from '@/lib/ai-tasks'
import { StatusBadge } from '@/components/ai/StatusBadge'
import { FilterChip } from '@/components/ui/FilterChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { CompleteTaskForm, EMPTY_COMPLETE_FORM, type CompleteFormData } from '@/components/ai/CompleteTaskForm'

export default function AiSelfResolvePage() {
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [statusF, setStatusF] = useState<'전체' | TaskStatus>('전체')
  const [completingTask, setCompletingTask] = useState<AiTask | null>(null)
  const [form, setForm] = useState<CompleteFormData>(EMPTY_COMPLETE_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('ai_tasks').select('*').eq('resolution_type', 'self').order('created_at', { ascending: false })
    if (error) console.error('[자체 해결] ai_tasks 조회 실패:', error.message)
    setTasks((data ?? []) as AiTask[])
    setLoading(false)
  }
  useEffect(() => { (async () => { await load() })() }, [])

  const filtered = tasks.filter(t => statusF === '전체' || t.status === statusF)

  function openComplete(task: AiTask) {
    setCompletingTask(task)
    setForm(EMPTY_COMPLETE_FORM)
    setError(null)
  }

  async function submitComplete() {
    if (!completingTask) return
    if (!form.result_content.trim() || !form.ai_used.trim() || !form.completed_at) {
      setError('개발 결과 / 사용한 AI / 완료일은 필수입니다.')
      return
    }
    setSaving(true)
    setError(null)
    const nowIso = new Date().toISOString()
    const { error: updErr } = await supabase.from('ai_tasks').update({
      status: 'done',
      result_content: form.result_content.trim(),
      ai_used: form.ai_used.trim(),
      completed_at: form.completed_at,
      updated_at: nowIso,
    }).eq('id', completingTask.id)

    if (updErr) { setError(updErr.message); setSaving(false); return }

    for (const f of form.files) {
      await supabase.from('ai_files').insert({ task_id: completingTask.id, file_name: f.file_name, file_url: f.file_url })
    }

    setSaving(false)
    setCompletingTask(null)
    load()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">자체 해결</h1>

      <div className="flex items-center gap-1.5 flex-wrap">
        <FilterChip label="전체" active={statusF === '전체'} onClick={() => setStatusF('전체')} count={tasks.length} />
        <FilterChip label={STATUS_LABEL.in_progress} active={statusF === 'in_progress'} onClick={() => setStatusF('in_progress')}
          count={tasks.filter(t => t.status === 'in_progress').length} />
        <FilterChip label={STATUS_LABEL.done} active={statusF === 'done'} onClick={() => setStatusF('done')}
          count={tasks.filter(t => t.status === 'done').length} />
      </div>

      {loading ? <LoadingState />
        : filtered.length === 0 ? (
          <EmptyState
            label="등록된 AI 과제가 없습니다."
            description="AI 과제를 등록하면 이곳에 표시됩니다."
            actionLabel="AI 과제 등록하기"
            actionHref="/ai/register"
          />
        )
        : (
          <div className="space-y-2">
            {filtered.map(t => (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-bold text-gray-900 truncate">{t.title}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-gray-400">{t.department} · {t.author} · {t.created_at.slice(0, 10)}</p>
                </div>
                {t.status === 'in_progress' && (
                  <button onClick={() => openComplete(t)}
                    className="flex-shrink-0 text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                    완료 처리
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

      {completingTask && (
        <Modal title={`"${completingTask.title}" 완료 처리`} onClose={() => setCompletingTask(null)}>
          <div className="space-y-4">
            <CompleteTaskForm taskId={completingTask.id} form={form} onChange={setForm} />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setCompletingTask(null)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={submitComplete} disabled={saving}
                className="text-sm px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-40 transition-colors">
                {saving ? '처리 중...' : '완료 처리'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
