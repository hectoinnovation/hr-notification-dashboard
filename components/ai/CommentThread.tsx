'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { AiComment } from '@/lib/ai-tasks'

/** 관리자 공개 운영 메모 스레드 — RLS가 allow_all이라 비공개 보장 불가. 민감정보 입력 금지. */
export function CommentThread({ taskId, comments, onAdded }: {
  taskId: string; comments: AiComment[]; onAdded: () => void
}) {
  const [author, setAuthor] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!content.trim()) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('ai_comments').insert({
      task_id: taskId, author: author.trim() || '관리자', content: content.trim(),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    setContent('')
    onAdded()
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        ⚠️ 이 메모는 비공개가 보장되지 않는 <b>공개 운영 메모</b>입니다. 개인정보·인사평가성 내용은 적지 마세요.
      </p>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {comments.length === 0 && <p className="text-xs text-gray-400">등록된 메모가 없습니다.</p>}
        {comments.map(c => (
          <div key={c.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-xs font-semibold text-gray-700">{c.author}</span>
              <span className="text-xs text-gray-400">{c.created_at.slice(0, 16).replace('T', ' ')}</span>
            </div>
            <p className="text-xs text-gray-600 whitespace-pre-wrap">{c.content}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="작성자"
          className="col-span-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
        <input value={content} onChange={e => setContent(e.target.value)} placeholder="메모 입력"
          onKeyDown={e => { if (e.key === 'Enter') submit() }}
          className="col-span-2 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
      </div>
      <div className="flex justify-end">
        <button onClick={submit} disabled={saving || !content.trim()}
          className="text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors">
          {saving ? '저장 중…' : '메모 추가'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
