'use client'

import { useState } from 'react'
import { uploadTaskFile, type AiFile } from '@/lib/ai-tasks'

export function FileUploadField({ taskId, files, onFilesChange }: {
  taskId: string
  files: Pick<AiFile, 'file_name' | 'file_url'>[]
  onFilesChange: (files: Pick<AiFile, 'file_name' | 'file_url'>[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const { file_url } = await uploadTaskFile(taskId, file)
      onFilesChange([...files, { file_name: file.name, file_url }])
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 block mb-1.5">첨부파일</label>
      <div className="space-y-1.5">
        {files.map((f, i) => (
          <div key={i} className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">
            <a href={f.file_url} target="_blank" rel="noreferrer" className="text-xs text-orange-600 hover:underline truncate">{f.file_name}</a>
            <button type="button" onClick={() => onFilesChange(files.filter((_, idx) => idx !== i))}
              className="text-xs text-gray-400 hover:text-red-500 flex-shrink-0">✕</button>
          </div>
        ))}
      </div>
      <label className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors">
        {uploading ? '업로드 중…' : '+ 파일 추가'}
        <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
      </label>
      {error && <p className="text-xs text-red-500 mt-1">업로드 실패: {error}</p>}
    </div>
  )
}
