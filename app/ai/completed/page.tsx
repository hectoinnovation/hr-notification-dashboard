'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { AiTask, AiFile } from '@/lib/ai-tasks'
import { ResolutionBadge } from '@/components/ai/ResolutionBadge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'

export default function AiCompletedPage() {
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AiTask | null>(null)
  const [files, setFiles] = useState<AiFile[]>([])

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('ai_tasks').select('*').eq('status', 'done').order('completed_at', { ascending: false })
      setTasks((data ?? []) as AiTask[])
      setLoading(false)
    })()
  }, [])

  async function openDetail(task: AiTask) {
    setSelected(task)
    const { data } = await supabase.from('ai_files').select('*').eq('task_id', task.id).order('created_at', { ascending: true })
    setFiles((data ?? []) as AiFile[])
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">완료 과제</h1>

      {loading ? <p className="text-sm text-gray-400">불러오는 중...</p>
        : tasks.length === 0 ? <EmptyState label="완료된 과제가 없습니다" />
        : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                  <th className="px-4 py-2.5 font-medium">제목</th>
                  <th className="px-4 py-2.5 font-medium">작성자</th>
                  <th className="px-4 py-2.5 font-medium">부서</th>
                  <th className="px-4 py-2.5 font-medium">해결 방식</th>
                  <th className="px-4 py-2.5 font-medium">사용한 AI</th>
                  <th className="px-4 py-2.5 font-medium">완료일</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map(t => (
                  <tr key={t.id} onClick={() => openDetail(t)}
                    className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-gray-800">{t.title}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t.author}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t.department}</td>
                    <td className="px-4 py-2.5"><ResolutionBadge type={t.resolution_type} /></td>
                    <td className="px-4 py-2.5 text-gray-600">{t.ai_used ?? '-'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t.completed_at ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <div className="space-y-3">
            <p className="text-xs text-gray-400">{selected.department} · {selected.author} · 완료일 {selected.completed_at ?? '-'}</p>
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1">개발 결과</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                {selected.result_content || '등록된 결과가 없습니다'}
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
