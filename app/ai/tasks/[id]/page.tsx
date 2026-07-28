'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { verifyPassword, toggleLike, hasLikedTask, uploadTaskFile, isExampleTask, type AiTask, type AiComment, type ResolutionType } from '@/lib/ai-tasks'
import { StatusBadge } from '@/components/ai/StatusBadge'
import { ResolutionBadge } from '@/components/ai/ResolutionBadge'
import { CommentSection } from '@/components/ai/CommentSection'
import { PasswordPrompt } from '@/components/ai/PasswordPrompt'
import { CompleteTaskModal, type CompleteTaskData } from '@/components/ai/CompleteTaskModal'
import { TaskWorkFields } from '@/components/ai/TaskWorkFields'
import { LoadingState } from '@/components/ui/LoadingState'
import { EmptyState } from '@/components/ui/EmptyState'

type PendingAction = 'edit' | 'delete' | 'complete'

type EditForm = {
  title: string
  team: string
  author: string
  resolution_type: ResolutionType
  current_work: string
  ai_usage: string
  result_content: string
}

function toEditForm(t: AiTask): EditForm {
  return {
    title: t.title, team: t.team, author: t.author, resolution_type: t.resolution_type,
    current_work: t.current_work ?? '', ai_usage: t.ai_usage ?? '', result_content: t.result_content ?? '',
  }
}

// 순수 URL 한 줄인 경우에만 클릭 가능한 링크로 렌더링하고, 나머지 줄은 일반 텍스트로 표시한다.
function ResultContentDisplay({ content }: { content: string }) {
  return (
    <p className="text-sm text-gray-700 break-all">
      {content.split('\n').map((line, i, arr) => (
        <span key={i}>
          {/^https?:\/\/\S+$/i.test(line.trim()) ? (
            <a href={line.trim()} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {line.trim()}
            </a>
          ) : line}
          {i < arr.length - 1 && <br />}
        </span>
      ))}
    </p>
  )
}

export default function AiTaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [task, setTask] = useState<AiTask | null>(null)
  const [comments, setComments] = useState<AiComment[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [completing, setCompleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EditForm | null>(null)
  const [editAiUsageFile, setEditAiUsageFile] = useState<File | null>(null)
  const [editRemoveAiUsageFile, setEditRemoveAiUsageFile] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [liking, setLiking] = useState(false)
  const [liked, setLiked] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: taskRow, error: taskErr }, { data: commentRows }] = await Promise.all([
      supabase.from('ai_tasks').select('*').eq('id', id).maybeSingle(),
      supabase.from('ai_comments').select('*').eq('task_id', id),
    ])
    if (taskErr) console.error('[과제 상세] ai_tasks 조회 실패:', taskErr.message)
    if (!taskRow) { setNotFound(true); setLoading(false); return }
    setTask(taskRow as AiTask)
    setComments((commentRows ?? []) as AiComment[])
    setLiked(hasLikedTask(id))
    setLoading(false)
  }, [id])
  useEffect(() => { (async () => { await load() })() }, [load])

  async function verifyTaskPassword(password: string): Promise<boolean> {
    if (!task) return false
    return verifyPassword(password, task.password_hash)
  }

  async function handleVerified(password: string): Promise<boolean> {
    if (!task || !pending) return false
    const ok = await verifyTaskPassword(password)
    if (!ok) return false

    if (pending === 'edit') {
      setForm(toEditForm(task))
      setEditAiUsageFile(null)
      setEditRemoveAiUsageFile(false)
      setEditing(true)
    } else if (pending === 'delete') {
      const { error: delErr } = await supabase.from('ai_tasks').delete().eq('id', task.id)
      if (delErr) { setError(delErr.message); setPending(null); return true }
      router.push('/ai/tasks')
    } else if (pending === 'complete') {
      setCompleting(true)
    }
    setPending(null)
    return true
  }

  async function submitComplete(data: CompleteTaskData) {
    if (!task) return
    const nowIso = new Date().toISOString()
    const fileMeta = data.result_file ? await uploadTaskFile(data.result_file) : null
    const { error: updErr } = await supabase.from('ai_tasks').update({
      status: 'done',
      completed_at: nowIso.slice(0, 10),
      result_content: data.result_content,
      result_file_url: fileMeta?.url ?? task.result_file_url ?? null,
      result_file_name: fileMeta?.name ?? task.result_file_name ?? null,
      updated_at: nowIso,
    }).eq('id', task.id)
    if (updErr) throw new Error(updErr.message)
    setCompleting(false)
    await load()
  }

  async function handleLike() {
    if (!task || liking) return
    setLiking(true)
    try {
      const result = await toggleLike(task.id, task.likes_count ?? 0)
      setTask({ ...task, likes_count: result.likes })
      setLiked(result.liked)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLiking(false)
    }
  }

  async function saveEdit() {
    if (!task || !form) return
    setSaving(true)
    setError(null)
    try {
      const fileMeta = editAiUsageFile ? await uploadTaskFile(editAiUsageFile) : null
      const ai_usage_file_url = fileMeta ? fileMeta.url : (editRemoveAiUsageFile ? null : task.ai_usage_file_url ?? null)
      const ai_usage_file_name = fileMeta ? fileMeta.name : (editRemoveAiUsageFile ? null : task.ai_usage_file_name ?? null)
      const { error: updErr } = await supabase.from('ai_tasks').update({
        title: form.title.trim(), team: form.team.trim(), author: form.author.trim(),
        resolution_type: form.resolution_type,
        current_work: form.current_work.trim() || null,
        ai_usage: form.ai_usage.trim() || null,
        ai_usage_file_url, ai_usage_file_name,
        result_content: form.result_content.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', task.id)
      if (updErr) { setError(updErr.message); return }
      setEditing(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState />
  if (notFound || !task) {
    return <EmptyState icon="🔍" label="등록된 과제를 찾을 수 없습니다." description="삭제되었거나 잘못된 주소일 수 있습니다."
      actionLabel="등록된 과제로 돌아가기" actionHref="/ai/tasks" />
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <button onClick={() => router.push('/ai/tasks')} className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
        ← 등록된 과제 목록
      </button>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        {editing && form ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setForm({ ...form, resolution_type: 'self' })}
                className={`text-sm font-semibold px-3 py-2.5 rounded-lg border-2 transition-colors ${
                  form.resolution_type === 'self' ? 'border-orange-400 bg-orange-50' : 'border-gray-200'
                }`}>🤖 자체 해결</button>
              <button onClick={() => setForm({ ...form, resolution_type: 'help' })}
                className={`text-sm font-semibold px-3 py-2.5 rounded-lg border-2 transition-colors ${
                  form.resolution_type === 'help' ? 'border-orange-400 bg-orange-50' : 'border-gray-200'
                }`}>🙋 도움 필요</button>
            </div>
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="제목"
              className="w-full text-sm font-bold border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.team} onChange={e => setForm({ ...form, team: e.target.value })} placeholder="팀"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
              <input value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} placeholder="작성자"
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
            </div>
            <TaskWorkFields
              currentWork={form.current_work} onCurrentWorkChange={v => setForm({ ...form, current_work: v })}
              aiUsage={form.ai_usage} onAiUsageChange={v => setForm({ ...form, ai_usage: v })}
              aiUsageFile={editAiUsageFile} onAiUsageFileChange={setEditAiUsageFile}
              existingFile={!editRemoveAiUsageFile && task.ai_usage_file_url
                ? { url: task.ai_usage_file_url, name: task.ai_usage_file_name ?? '첨부파일' } : null}
              onRemoveExistingFile={() => setEditRemoveAiUsageFile(true)}
            />
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1">🔗 과제 링크 / 결과물</label>
              <textarea value={form.result_content} onChange={e => setForm({ ...form, result_content: e.target.value })} rows={3}
                placeholder="예) GitHub, Notion, Figma, Google Drive, Apps Script URL 또는 결과물 설명"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setEditing(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={saveEdit} disabled={saving}
                className="text-sm px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-40 transition-colors">
                {saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {isExampleTask(task) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
                <span className="text-sm leading-none">📌</span>
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-amber-700">예시(참고용) 게시글</p>
                  <p className="text-xs text-amber-700 leading-relaxed">이 게시글은 과제 작성 방법을 참고하기 위한 예시입니다. 실제 과제 등록 시 참고해 주세요.</p>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-gray-900">🤖 {task.title}</h1>
              <p className="text-xs text-gray-400">{task.team} · {task.author} · {task.created_at.slice(0, 10).replace(/-/g, '.')}</p>
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <ResolutionBadge type={task.resolution_type} />
                <StatusBadge status={task.status} />
                <button type="button" onClick={handleLike} disabled={liking}
                  className={`text-xs font-semibold border rounded-lg px-2.5 py-0.5 transition-colors disabled:opacity-50 ${
                    liked ? 'text-red-500 border-red-200 bg-red-50' : 'text-gray-500 border-gray-200 hover:text-red-500'
                  }`}>
                  {liked ? '❤️' : '🤍'} {task.likes_count ?? 0}
                </button>
              </div>
            </div>

            {task.current_work && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">개선하고 싶은 업무 또는 프로세스</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.current_work}</p>
              </div>
            )}
            {(task.ai_usage || task.ai_usage_file_url) && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">개선 방향</p>
                {task.ai_usage && <p className="text-sm text-gray-700 whitespace-pre-wrap">{task.ai_usage}</p>}
                {task.ai_usage_file_url && (
                  <a href={task.ai_usage_file_url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-lg mt-1.5 transition-colors">
                    📎 {task.ai_usage_file_name ?? '첨부파일'}
                  </a>
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">🔗 과제 링크 / 결과물</p>
              {task.result_content ? <ResultContentDisplay content={task.result_content} /> : null}
              {task.result_file_url && (
                <a href={task.result_file_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 px-2.5 py-1.5 rounded-lg mt-1.5 transition-colors">
                  📎 {task.result_file_name ?? '첨부파일'}
                </a>
              )}
              {!task.result_content && !task.result_file_url && (
                <p className="text-sm text-gray-400">아직 등록된 결과물이 없습니다.</p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
              {task.status === 'in_progress' ? (
                <button onClick={() => setPending('complete')}
                  className="text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg transition-colors">
                  🟢 완료하기
                </button>
              ) : (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
                  ✅ 완료
                </span>
              )}
              <button onClick={() => setPending('edit')}
                className="text-xs font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 px-3 py-1.5 rounded-lg transition-colors">
                수정
              </button>
              <button onClick={() => setPending('delete')}
                className="text-xs font-semibold text-red-500 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                삭제
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <CommentSection taskId={task.id} comments={comments} onChanged={load} verifyTaskPassword={verifyTaskPassword} />
      </div>

      {pending && (
        <PasswordPrompt
          title={pending === 'delete' ? '과제 삭제' : pending === 'complete' ? '완료하기' : '과제 수정'}
          onVerify={handleVerified}
          onClose={() => setPending(null)}
        />
      )}

      {completing && (
        <CompleteTaskModal
          onClose={() => setCompleting(false)}
          onSubmit={submitComplete}
        />
      )}
    </div>
  )
}
