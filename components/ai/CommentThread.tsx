'use client'

import { supabase } from '@/lib/supabase'
import { sortComments, type AiComment } from '@/lib/ai-tasks'

/** 관리자용 댓글 모더레이션 뷰 — 비밀번호 없이 바로 삭제 가능 */
export function CommentThread({ comments, onDeleted }: {
  comments: AiComment[]; onDeleted: () => void
}) {
  async function handleDelete(id: string) {
    if (!confirm('이 댓글을 삭제하시겠습니까?')) return
    await supabase.from('ai_comments').delete().eq('id', id)
    onDeleted()
  }

  const sorted = sortComments(comments)

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto">
      {sorted.length === 0 && <p className="text-xs text-gray-400">등록된 댓글이 없습니다.</p>}
      {sorted.map(c => (
        <div key={c.id} className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-0.5 gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-700">{c.author}</span>
              {c.is_accepted && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded px-1.5 py-0.5">✓ 채택됨</span>
              )}
              <span className="text-xs text-gray-400">{c.created_at.slice(0, 16).replace('T', ' ')}</span>
            </div>
            <button onClick={() => handleDelete(c.id)} className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0">삭제</button>
          </div>
          <p className="text-xs text-gray-600 whitespace-pre-wrap">{c.content}</p>
        </div>
      ))}
    </div>
  )
}
