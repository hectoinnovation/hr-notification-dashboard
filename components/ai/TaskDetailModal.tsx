'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  STATUS_LABEL, RESOLUTION_LABEL, PRIORITY_LABEL,
  type AiTask, type AiComment, type AiFile, type TaskStatus, type ResolutionType, type Priority,
} from '@/lib/ai-tasks'
import { Modal } from '@/components/ui/Modal'
import { FileUploadField } from './FileUploadField'
import { CommentThread } from './CommentThread'

function Field({ label, value, onChange, textarea }: {
  label: string; value: string; onChange: (v: string) => void; textarea?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 block mb-1.5">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} rows={2}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
      ) : (
        <input value={value} onChange={e => onChange(e.target.value)}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
      )}
    </div>
  )
}

export function TaskDetailModal({ task, onClose, onSaved, onDeleted }: {
  task: AiTask; onClose: () => void; onSaved: () => void; onDeleted: () => void
}) {
  const [form, setForm] = useState<AiTask>(task)
  const [files, setFiles] = useState<Pick<AiFile, 'file_name' | 'file_url'>[]>([])
  const [comments, setComments] = useState<AiComment[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadExtras() {
    const [{ data: fileRows, error: fileErr }, { data: commentRows, error: commentErr }] = await Promise.all([
      supabase.from('ai_files').select('*').eq('task_id', task.id).order('created_at', { ascending: true }),
      supabase.from('ai_comments').select('*').eq('task_id', task.id).order('created_at', { ascending: false }),
    ])
    if (fileErr) console.error('[과제 관리] ai_files 조회 실패:', fileErr.message)
    if (commentErr) console.error('[과제 관리] ai_comments 조회 실패:', commentErr.message)
    setFiles((fileRows ?? []) as AiFile[])
    setComments((commentRows ?? []) as AiComment[])
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { (async () => { await loadExtras() })() }, [task.id])

  function set<K extends keyof AiTask>(key: K, value: AiTask[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // 진행 상태 변경 시 완료일 자동 저장/제거: 완료로 바뀌면 오늘 날짜를 채우고, 진행중으로 되돌리면 완료일을 비운다.
  function setStatus(next: TaskStatus) {
    setForm(prev => ({
      ...prev,
      status: next,
      completed_at: next === 'done' ? (prev.completed_at || new Date().toISOString().slice(0, 10)) : undefined,
    }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const nowIso = new Date().toISOString()

    const assignmentChanged = form.assignee !== task.assignee || form.priority !== task.priority

    const { error: updErr } = await supabase.from('ai_tasks').update({
      title: form.title, team: form.team, author: form.author,
      current_work: form.current_work || null, ai_usage: form.ai_usage || null,
      resolution_type: form.resolution_type, status: form.status,
      result_content: form.result_content || null,
      completed_at: form.completed_at || null,
      assignee: form.assignee || null, priority: form.priority || 'medium',
      updated_at: nowIso,
    }).eq('id', task.id)

    if (updErr) { setError(updErr.message); setSaving(false); return }

    if (assignmentChanged) {
      await supabase.from('ai_assignments').insert({
        task_id: task.id, assignee: form.assignee || null,
        priority: form.priority || 'medium', changed_by: '관리자',
      })
    }

    setSaving(false)
    onSaved()
  }

  async function handleDelete() {
    if (!confirm(`"${task.title}" 과제를 삭제하시겠습니까? 되돌릴 수 없습니다.`)) return
    const { error: delErr } = await supabase.from('ai_tasks').delete().eq('id', task.id)
    if (delErr) { setError(delErr.message); return }
    onDeleted()
  }

  return (
    <Modal title="과제 관리" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">진행 상태</label>
            <select value={form.status} onChange={e => setStatus(e.target.value as TaskStatus)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white">
              {(['in_progress', 'done'] as TaskStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">해결 방식</label>
            <select value={form.resolution_type} onChange={e => set('resolution_type', e.target.value as ResolutionType)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white">
              {(['self', 'help'] as ResolutionType[]).map(r => <option key={r} value={r}>{RESOLUTION_LABEL[r]}</option>)}
            </select>
          </div>
        </div>

        <Field label="제목" value={form.title} onChange={v => set('title', v)} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="팀" value={form.team} onChange={v => set('team', v)} />
          <Field label="작성자" value={form.author} onChange={v => set('author', v)} />
        </div>
        <Field label="현재 업무" value={form.current_work ?? ''} onChange={v => set('current_work', v)} textarea />
        <Field label="AI 활용 내용" value={form.ai_usage ?? ''} onChange={v => set('ai_usage', v)} textarea />

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs font-bold text-gray-700">완료 처리 정보</p>
          <Field label="해결 결과" value={form.result_content ?? ''} onChange={v => set('result_content', v)} textarea />
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">완료일</label>
            <input type="date" value={form.completed_at ?? ''} onChange={e => set('completed_at', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
          </div>
          <FileUploadField taskId={task.id} files={files} onFilesChange={async next => {
            setFiles(next)
            const added = next.slice(files.length)
            for (const f of added) {
              await supabase.from('ai_files').insert({ task_id: task.id, file_name: f.file_name, file_url: f.file_url })
            }
          }} />
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs font-bold text-gray-700">담당자 / 우선순위 (도움 필요 과제 운영)</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="담당자" value={form.assignee ?? ''} onChange={v => set('assignee', v)} />
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">우선순위</label>
              <select value={form.priority ?? 'medium'} onChange={e => set('priority', e.target.value as Priority)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white">
                {(['urgent', 'high', 'medium', 'low'] as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-bold text-gray-700 mb-3">댓글 (관리자는 비밀번호 없이 삭제 가능)</p>
          <CommentThread comments={comments} onDeleted={loadExtras} />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
          <button onClick={handleDelete} className="text-xs font-semibold text-red-500 hover:bg-red-50 px-3 py-2 rounded-lg transition-colors">
            과제 삭제
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
            <button onClick={handleSave} disabled={saving}
              className="text-sm px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-40 transition-colors">
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
