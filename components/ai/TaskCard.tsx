import Link from 'next/link'
import type { AiTask } from '@/lib/ai-tasks'

const STATUS_DOT: Record<AiTask['status'], string> = { in_progress: '🟡', done: '🟢' }
const STATUS_TEXT: Record<AiTask['status'], string> = { in_progress: '진행중', done: '완료' }
const RESOLUTION_DOT: Record<AiTask['resolution_type'], string> = { self: '🟢', help: '🟠' }
const RESOLUTION_TEXT: Record<AiTask['resolution_type'], string> = { self: '자체 해결', help: '도움 필요' }

export function TaskCard({ task, commentCount }: { task: AiTask; commentCount: number }) {
  return (
    <Link href={`/ai/tasks/${task.id}`}
      className="group block bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3 hover:border-orange-200 hover:shadow-md transition-all duration-150">
      <h3 className="text-sm font-bold text-gray-900 line-clamp-2 group-hover:text-orange-600 transition-colors">
        🤖 {task.title}
      </h3>
      <p className="text-xs text-gray-400">{task.team} · {task.author}</p>
      <div className="flex items-center gap-1.5 flex-wrap text-xs font-semibold">
        <span className="px-2 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-600">
          {RESOLUTION_DOT[task.resolution_type]} {RESOLUTION_TEXT[task.resolution_type]}
        </span>
        <span className="px-2 py-0.5 rounded bg-gray-50 border border-gray-200 text-gray-600">
          {STATUS_DOT[task.status]} {STATUS_TEXT[task.status]}
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-50">
        <span>💬 댓글 {commentCount}</span>
        <span>📅 {task.created_at.slice(0, 10).replace(/-/g, '.')}</span>
      </div>
    </Link>
  )
}
