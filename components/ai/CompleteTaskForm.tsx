'use client'

import type { AiFile } from '@/lib/ai-tasks'
import { FileUploadField } from './FileUploadField'

export type CompleteFormData = {
  result_content: string
  ai_used: string
  completed_at: string
  files: Pick<AiFile, 'file_name' | 'file_url'>[]
}

export const EMPTY_COMPLETE_FORM: CompleteFormData = {
  result_content: '', ai_used: '', completed_at: new Date().toISOString().slice(0, 10), files: [],
}

/** 완료 처리 시 입력 폼 (개발 결과 / 사용한 AI / 첨부파일 / 완료일) */
export function CompleteTaskForm({ taskId, form, onChange }: {
  taskId: string; form: CompleteFormData; onChange: (f: CompleteFormData) => void
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">개발 결과<span className="text-red-400 ml-0.5">*</span></label>
        <textarea value={form.result_content} onChange={e => onChange({ ...form, result_content: e.target.value })} rows={4}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none" />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">사용한 AI<span className="text-red-400 ml-0.5">*</span></label>
        <input value={form.ai_used} onChange={e => onChange({ ...form, ai_used: e.target.value })}
          placeholder="ChatGPT / Claude / Cursor 등"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">완료일<span className="text-red-400 ml-0.5">*</span></label>
        <input type="date" value={form.completed_at} onChange={e => onChange({ ...form, completed_at: e.target.value })}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400" />
      </div>
      <FileUploadField taskId={taskId} files={form.files} onFilesChange={files => onChange({ ...form, files })} />
    </div>
  )
}
