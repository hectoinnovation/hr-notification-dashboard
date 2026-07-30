'use client'

import Link from 'next/link'
import { useState } from 'react'
import { toggleLike, hasLikedTask, isExampleTask, isEffectivelyDone, type AiTask } from '@/lib/ai-tasks'
import { ResolutionBadge } from './ResolutionBadge'

export function TaskCard({ task, commentCount }: { task: AiTask; commentCount: number }) {
  const done = isEffectivelyDone(task)
  const isExample = isExampleTask(task)
  const [likes, setLikes] = useState(task.likes_count ?? 0)
  // 카드는 부모 목록이 클라이언트에서 데이터를 가져온 뒤에만 렌더링되므로(SSR 시점엔 목록이
  // 비어 있음) 마운트 시점에 localStorage를 바로 읽어도 하이드레이션 불일치가 없다.
  const [liked, setLiked] = useState(() => hasLikedTask(task.id))
  const [liking, setLiking] = useState(false)

  async function handleLike(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (liking) return
    setLiking(true)
    try {
      const result = await toggleLike(task.id, likes)
      setLikes(result.likes)
      setLiked(result.liked)
    } catch (err) {
      console.error('[등록된 과제] 좋아요 실패:', err instanceof Error ? err.message : err)
    } finally {
      setLiking(false)
    }
  }

  return (
    <Link href={`/ai/tasks/${task.id}`}
      className={`group block bg-white rounded-2xl border border-gray-200 border-l-4 shadow-sm p-5 space-y-3 hover:shadow-md transition-all duration-150 ${
        isExample ? 'border-l-amber-400' : done ? 'border-l-emerald-400' : 'border-l-blue-300'
      }`}>
      {isExample && (
        <span className="inline-flex items-center text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
          📌 예시(참고용)
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-bold text-gray-900 line-clamp-2 group-hover:text-orange-600 transition-colors">
          🤖 {task.title}
        </h3>
        {done ? (
          <span className="flex-shrink-0 text-[11px] font-bold text-white bg-emerald-500 px-2 py-1 rounded-lg">✅ 완료</span>
        ) : (
          <span className="flex-shrink-0 text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg">🟡 진행중</span>
        )}
      </div>
      <p className="text-xs text-gray-400">{task.team} · {task.author}</p>
      <ResolutionBadge type={task.resolution_type} />
      {done && task.result_content && (
        <div className="rounded-lg bg-emerald-50/70 border border-emerald-100 px-2.5 py-2">
          <p className="text-[11px] font-bold text-emerald-700 mb-0.5">🔗 결과물 보기</p>
          <p className="text-xs text-gray-600 line-clamp-2 break-all">{task.result_content}</p>
        </div>
      )}
      <div className="flex items-center justify-between pt-1 border-t border-gray-50 text-xs">
        <div className="flex items-center gap-3 text-gray-500">
          <span className="inline-flex items-center gap-1">💬 <span className="font-semibold">{commentCount}</span></span>
          <button type="button" onClick={handleLike} disabled={liking}
            className={`inline-flex items-center gap-1 font-semibold transition-colors disabled:opacity-50 ${
              liked ? 'text-red-500' : 'hover:text-red-500'
            }`}>
            {liked ? '❤️' : '🤍'} {likes}
          </button>
        </div>
        <span className="text-gray-400">📅 {task.created_at.slice(0, 10).replace(/-/g, '.')}</span>
      </div>
    </Link>
  )
}
