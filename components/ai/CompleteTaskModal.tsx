'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { FileAttachField } from './FileAttachField'

export type CompleteTaskData = { result_content: string; result_file: File | null }

export function CompleteTaskModal({ onClose, onSubmit }: {
  onClose: () => void
  onSubmit: (data: CompleteTaskData) => Promise<void>
}) {
  const [description, setDescription] = useState('')
  const [link, setLink] = useState('')
  const [resultFile, setResultFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 결과 설명 / 링크 / 파일 중 최소 하나만 있으면 제출 가능하다.
  const canSubmit = description.trim().length > 0 || link.trim().length > 0 || resultFile !== null

  async function submit() {
    if (!canSubmit) return
    setSaving(true)
    setError(null)
    try {
      // DB에는 기존과 동일하게 result_content 한 컬럼에 저장한다 — 설명과 링크를 줄바꿈으로 이어붙이면
      // 상세 화면의 기존 표시 로직(줄 단위 URL 자동 링크화)이 그대로 재사용된다.
      const combined = [description.trim(), link.trim()].filter(Boolean).join('\n\n')
      await onSubmit({ result_content: combined, result_file: resultFile })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  return (
    <Modal title="🎉 과제 완료하기" onClose={onClose}>
      <div className="space-y-3">
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-1.5">
          <p className="text-sm font-bold text-orange-700">💡 완료 결과를 다른 팀원도 이해할 수 있도록 작성해 주세요.</p>
          <p className="text-xs text-orange-700 leading-relaxed">아래 내용을 포함하여 최대한 구체적으로 작성해 주세요.</p>
          <ul className="text-xs text-orange-700 leading-relaxed list-disc list-inside space-y-0.5">
            <li>어떤 결과물을 만들었나요?</li>
            <li>기존 업무와 비교하여 무엇이 달라졌나요?</li>
            <li>실제로 어떻게 사용하는지 설명해 주세요.</li>
            <li>시간 절감, 정확도 향상 등 기대 효과가 있다면 함께 작성해 주세요.</li>
            <li>GitHub, Notion, Apps Script, Figma 등의 결과물이 있다면 함께 첨부해 주세요.</li>
          </ul>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">결과 설명</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={5} autoFocus
            placeholder={'예) 어떤 결과물을 만들었나요?\n기존 업무와 비교하여 무엇이 달라졌는지,\n사용 방법과 기대 효과를 함께 작성해주세요.'}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">📎 결과물 첨부 (선택)</label>
          <FileAttachField file={resultFile} onChange={setResultFile} />
          <p className="text-xs text-gray-400">개발 산출물, 발표자료, 사용 가이드, 화면 캡처, Word·PowerPoint·PDF 등을 첨부할 수 있습니다.</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">🔗 결과물 링크 (선택)</label>
          <textarea value={link} onChange={e => setLink(e.target.value)} rows={3}
            placeholder={'예) GitHub Repository, Notion, Figma, Google Drive,\nApps Script URL, 시연 영상 또는 결과물을 확인할 수 있는 링크를 입력해주세요.'}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
          <p className="text-xs text-gray-400">링크가 없는 경우에는 결과를 설명하는 내용만 작성해도 됩니다.</p>
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
