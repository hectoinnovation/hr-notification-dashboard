'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { AiTask, AiFile } from '@/lib/ai-tasks'
import { StatusBadge } from '@/components/ai/StatusBadge'
import { ResolutionBadge } from '@/components/ai/ResolutionBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'
import { Modal } from '@/components/ui/Modal'
import { CompleteTaskForm, EMPTY_COMPLETE_FORM, type CompleteFormData } from '@/components/ai/CompleteTaskForm'

function AiMyTasksContent() {
  const searchParams = useSearchParams()
  const [name, setName] = useState(searchParams.get('author') ?? '')
  const [searched, setSearched] = useState(false)
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(false)

  const [completingTask, setCompletingTask] = useState<AiTask | null>(null)
  const [form, setForm] = useState<CompleteFormData>(EMPTY_COMPLETE_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [detailTask, setDetailTask] = useState<AiTask | null>(null)
  const [files, setFiles] = useState<AiFile[]>([])

  const search = useCallback(async (searchName?: string) => {
    const target = (searchName ?? name).trim()
    if (!target) return
    setLoading(true)
    setSearched(true)
    const { data, error: err } = await supabase.from('ai_tasks').select('*').ilike('author', target).order('created_at', { ascending: false })
    if (err) console.error('[내 과제] ai_tasks 조회 실패:', err.message)
    setTasks((data ?? []) as AiTask[])
    setLoading(false)
  }, [name])

  // 과제 등록 후 /ai/my?author=... 로 넘어온 경우, 이름을 자동으로 채워 바로 조회
  useEffect(() => {
    const authorParam = searchParams.get('author')
    if (authorParam) { (async () => { await search(authorParam) })() }
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

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
    search()
  }

  async function openDetail(task: AiTask) {
    setDetailTask(task)
    const { data, error: err } = await supabase.from('ai_files').select('*').eq('task_id', task.id).order('created_at', { ascending: true })
    if (err) console.error('[내 과제] ai_files 조회 실패:', err.message)
    setFiles((data ?? []) as AiFile[])
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">내 과제</h1>
      <p className="text-xs text-gray-400">과제 등록 시 입력한 작성자 이름으로 본인이 등록한 과제를 조회합니다.</p>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search() }}
          placeholder="작성자 이름 입력"
          className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
        <button onClick={() => search()} disabled={!name.trim()}
          className="text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-colors">
          조회
        </button>
      </div>

      {!searched ? null
        : loading ? <LoadingState />
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
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
                <button onClick={() => t.status === 'done' && openDetail(t)} disabled={t.status !== 'done'}
                  className={`min-w-0 text-left ${t.status === 'done' ? 'cursor-pointer' : 'cursor-default'}`}>
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-bold text-gray-900 truncate">{t.title}</span>
                    <StatusBadge status={t.status} />
                    <ResolutionBadge type={t.resolution_type} />
                  </div>
                  <p className="text-xs text-gray-400">{t.department} · {t.created_at.slice(0, 10)}</p>
                </button>
                {t.status === 'in_progress' && t.resolution_type === 'self' && (
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

      {detailTask && (
        <Modal title={detailTask.title} onClose={() => setDetailTask(null)}>
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{detailTask.department} · 완료일 {detailTask.completed_at ?? '-'}</p>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">개발 결과</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                {detailTask.result_content || '등록된 결과가 없습니다'}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">첨부파일</p>
              {files.length === 0 ? <p className="text-xs text-gray-400">첨부파일이 없습니다</p> : (
                <div className="space-y-1.5">
                  {files.map(f => (
                    <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer"
                      className="block text-xs text-orange-600 hover:underline bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
                      {f.file_name}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default function AiMyTasksPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AiMyTasksContent />
    </Suspense>
  )
}
