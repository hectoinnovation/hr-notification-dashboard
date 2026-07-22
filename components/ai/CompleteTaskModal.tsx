'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'

export type CompleteTaskData = { result_content: string }

export function CompleteTaskModal({ onClose, onSubmit }: {
  onClose: () => void
  onSubmit: (data: CompleteTaskData) => Promise<void>
}) {
  const [resultContent, setResultContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = resultContent.trim().length > 0

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({ result_content: resultContent.trim() })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <Modal title="🎉 과제 완료하기" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">과제 링크 / 결과물<span className="text-red-400 ml-0.5">*</span></label>
          <textarea value={resultContent} onChange={e => setResultContent(e.target.value)} rows={5} autoFocus
            placeholder={'예) https://github.com/...\n\n예) https://www.notion.so/...\n\n결과물 링크 또는 제출 내용을 입력해주세요.'}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
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
