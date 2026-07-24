'use client'

import { useRef, useState } from 'react'

const ACCEPT = '.doc,.docx,.ppt,.pptx,.pdf,.xls,.xlsx,.png,.jpg,.jpeg,.zip'

export type ExistingFile = { url: string; name: string }

// file: 이번 세션에서 새로 고른 파일 (있으면 최우선 표시)
// existingFile: 수정 화면처럼 이전에 이미 업로드되어 저장된 파일 (다운로드 링크로 표시, 교체/삭제 가능)
export function FileAttachField({ file, onChange, existingFile, onRemoveExisting }: {
  file: File | null
  onChange: (file: File | null) => void
  existingFile?: ExistingFile | null
  onRemoveExisting?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(files: FileList | null) {
    if (files && files[0]) onChange(files[0])
  }

  const input = <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={e => handleFiles(e.target.files)} />

  if (file) {
    return (
      <div>
        {input}
        <div className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="truncate text-gray-700">📎 {file.name}</span>
          <button type="button" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = '' }}
            className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0">✕</button>
        </div>
      </div>
    )
  }

  if (existingFile) {
    return (
      <div>
        {input}
        <div className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 gap-2">
          <a href={existingFile.url} target="_blank" rel="noopener noreferrer"
            className="truncate text-gray-700 hover:underline flex-1">📎 {existingFile.name}</a>
          <button type="button" onClick={() => inputRef.current?.click()}
            className="text-gray-400 hover:text-orange-500 flex-shrink-0 font-semibold">교체</button>
          <button type="button" onClick={onRemoveExisting}
            className="text-gray-400 hover:text-red-500 flex-shrink-0">✕</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {input}
      <button type="button" onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        className={`w-full text-xs font-semibold border border-dashed rounded-lg px-3 py-2.5 transition-colors ${
          dragOver ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600'
        }`}>
        📎 파일 첨부 (선택) — 클릭 또는 드래그 앤 드롭
      </button>
    </div>
  )
}
