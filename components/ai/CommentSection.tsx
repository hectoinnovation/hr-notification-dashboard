'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { hashPassword, verifyPassword, sortComments, type AiComment } from '@/lib/ai-tasks'
import { PasswordPrompt } from './PasswordPrompt'

type PendingAction =
  | { type: 'edit'; comment: AiComment }
  | { type: 'delete'; comment: AiComment }
  | { type: 'accept'; comment: AiComment }

export function CommentSection({ taskId, comments, onChanged, verifyTaskPassword }: {
  taskId: string
  comments: AiComment[]
  onChanged: () => void
  verifyTaskPassword: (password: string) => Promise<boolean>
}) {
  const [author, setAuthor] = useState('')
  const [content, setContent] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [pending, setPending] = useState<PendingAction | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')

  const hasAccepted = comments.some(c => c.is_accepted)

  async function submit() {
    if (!author.trim() || !content.trim() || !password.trim()) return
    setSaving(true)
    setError(null)
    const password_hash = await hashPassword(password.trim())
    const { error: err } = await supabase.from('ai_comments').insert({
      task_id: taskId, author: author.trim(), content: content.trim(), password_hash,
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setContent(''); setPassword('')
    onChanged()
  }

  async function handleVerified(password: string): Promise<boolean> {
    if (!pending) return false
    const ok = pending.type === 'accept'
      ? await verifyTaskPassword(password)
      : await verifyPassword(password, pending.comment.password_hash)
    if (!ok) return false

    if (pending.type === 'delete') {
      await supabase.from('ai_comments').delete().eq('id', pending.comment.id)
      onChanged()
    } else if (pending.type === 'edit') {
      setEditingId(pending.comment.id)
      setEditContent(pending.comment.content)
    } else if (pending.type === 'accept') {
      // 과제당 채택 댓글 하나만 — 기존 채택 해제 후 새로 채택
      await supabase.from('ai_comments').update({ is_accepted: false }).eq('task_id', taskId).eq('is_accepted', true)
      await supabase.from('ai_comments').update({ is_accepted: true }).eq('id', pending.comment.id)
      onChanged()
    }
    setPending(null)
    return true
  }

  async function saveEdit(commentId: string) {
    if (!editContent.trim()) return
    await supabase.from('ai_comments').update({ content: editContent.trim() }).eq('id', commentId)
    setEditingId(null)
    onChanged()
  }

  const sorted = sortComments(comments)

  return (
    <div className="space-y-4">
      <h2 className="text-sm font-bold text-gray-800">💬 댓글 {comments.length}</h2>

      <div className="space-y-3">
        {sorted.length === 0 && <p className="text-xs text-gray-400">아직 댓글이 없습니다. 첫 댓글을 남겨보세요.</p>}
        {sorted.map(c => (
          <div key={c.id}
            className={`rounded-xl border px-4 py-3 transition-colors ${
              c.is_accepted ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
            }`}>
            <div className="flex items-center justify-between mb-1 gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-gray-700">{c.author}</span>
                {c.is_accepted && (
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded px-1.5 py-0.5">
                    ✓ 채택됨
                  </span>
                )}
                <span className="text-xs text-gray-400">{c.created_at.slice(0, 16).replace('T', ' ')}</span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {!c.is_accepted && !hasAccepted && (
                  <button onClick={() => setPending({ type: 'accept', comment: c })}
                    className="text-xs font-semibold text-emerald-600 hover:underline">채택</button>
                )}
                <button onClick={() => setPending({ type: 'edit', comment: c })}
                  className="text-xs text-gray-400 hover:text-gray-700">수정</button>
                <button onClick={() => setPending({ type: 'delete', comment: c })}
                  className="text-xs text-gray-400 hover:text-red-500">삭제</button>
              </div>
            </div>
            {editingId === c.id ? (
              <div className="space-y-2 mt-1.5">
                <textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
                  <button onClick={() => saveEdit(c.id)} className="text-xs px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold">저장</button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
            )}
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="작성자"
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="댓글 비밀번호"
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
        </div>
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={2} placeholder="댓글을 입력해주세요"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end">
          <button onClick={submit} disabled={saving || !author.trim() || !content.trim() || !password.trim()}
            className="text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-colors">
            {saving ? '등록 중...' : '댓글 등록'}
          </button>
        </div>
      </div>

      {pending && (
        <PasswordPrompt
          title={pending.type === 'delete' ? '댓글 삭제' : pending.type === 'edit' ? '댓글 수정' : '댓글 채택'}
          onVerify={handleVerified}
          onClose={() => setPending(null)}
        />
      )}
    </div>
  )
}
