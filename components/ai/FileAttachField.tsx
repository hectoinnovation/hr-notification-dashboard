'use client'

import { useRef, useState } from 'react'

const ACCEPT = '.doc,.docx,.ppt,.pptx,.pdf,.xls,.xlsx,.png,.jpg,.jpeg,.zip'

export function FileAttachField({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function handleFiles(files: FileList | null) {
    if (files && files[0]) onChange(files[0])
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={e => handleFiles(e.target.files)} />
      {file ? (
        <div className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="truncate text-gray-700">📎 {file.name}</span>
          <button type="button" onClick={() => { onChange(null); if (inputRef.current) inputRef.current.value = '' }}
            className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0">✕</button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
          className={`w-full text-xs font-semibold border border-dashed rounded-lg px-3 py-2.5 transition-colors ${
            dragOver ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600'
          }`}>
          📎 파일 첨부 (선택) — 클릭 또는 드래그 앤 드롭
        </button>
      )}
    </div>
  )
}
