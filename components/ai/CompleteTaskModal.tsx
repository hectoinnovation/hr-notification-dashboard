'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'

export type CompleteTaskData = { ai_usage: string; result_content: string; reflection: string }

export function CompleteTaskModal({ onClose, onSubmit, initialAiUsage }: {
  onClose: () => void
  onSubmit: (data: CompleteTaskData) => Promise<void>
  initialAiUsage?: string
}) {
  const [aiUsage, setAiUsage] = useState(initialAiUsage ?? '')
  const [resultContent, setResultContent] = useState('')
  const [reflection, setReflection] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = aiUsage.trim() && resultContent.trim()

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ ai_usage: aiUsage.trim(), result_content: resultContent.trim(), reflection: reflection.trim() })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <Modal title="🎉 과제 완료하기" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">AI 활용 내용<span className="text-red-400 ml-0.5">*</span></label>
          <textarea value={aiUsage} onChange={e => setAiUsage(e.target.value)} rows={3}
            placeholder="예) ChatGPT로 채용공고를 생성했습니다."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">해결 결과<span className="text-red-400 ml-0.5">*</span></label>
          <textarea value={resultContent} onChange={e => setResultContent(e.target.value)} rows={2}
            placeholder="예) 기존 30분 걸리던 업무를 5분으로 단축했습니다."
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">느낀 점 <span className="text-gray-300">(선택)</span></label>
          <textarea value={reflection} onChange={e => setReflection(e.target.value)} rows={2}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={submit} disabled={saving || !canSubmit}
            className="text-sm px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-semibold disabled:opacity-40 transition-colors">
            {saving ? '처리 중...' : '완료하기'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
