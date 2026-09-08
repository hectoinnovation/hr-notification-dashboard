'use client'

import { useRef, useState } from 'react'
import { ACCEPT } from './FileAttachField'

export type ExistingFile = { url: string; name: string }

// 결과물 첨부 전용 — 여러 파일을 동시에 추가할 수 있고, 이미 저장된 파일(existingFiles)과
// 이번에 새로 고른 파일(files)을 각각 개별적으로 제거할 수 있다. 기존 파일은 명시적으로
// ✕를 누르기 전까지 그대로 유지된다 — 제출한다고 임의로 덮어쓰거나 삭제하지 않는다.
export function MultiFileAttachField({ files, onFilesChange, existingFiles, onRemoveExisting }: {
  files: File[]
  onFilesChange: (files: File[]) => void
  existingFiles: ExistingFile[]
  onRemoveExisting: (index: number) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return
    onFilesChange([...files, ...Array.from(list)])
  }

  function removeNewFile(index: number) {
    onFilesChange(files.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-1.5">
      <input ref={inputRef} type="file" accept={ACCEPT} multiple className="hidden"
        onChange={e => { addFiles(e.target.files); if (inputRef.current) inputRef.current.value = '' }} />

      {existingFiles.map((f, i) => (
        <div key={`existing-${f.url}`} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 gap-2">
          <a href={f.url} target="_blank" rel="noopener noreferrer" className="truncate text-gray-700 hover:underline flex-1">📎 {f.name}</a>
          <button type="button" onClick={() => onRemoveExisting(i)} className="text-gray-400 hover:text-red-500 flex-shrink-0">✕</button>
        </div>
      ))}

      {files.map((f, i) => (
        <div key={`new-${i}-${f.name}`} className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <span className="truncate text-gray-700">📎 {f.name}</span>
          <button type="button" onClick={() => removeNewFile(i)} className="text-gray-400 hover:text-red-500 ml-2 flex-shrink-0">✕</button>
        </div>
      ))}

      <button type="button" onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files) }}
        className={`w-full text-xs font-semibold border border-dashed rounded-lg px-3 py-2.5 transition-colors ${
          dragOver ? 'border-orange-400 bg-orange-50 text-orange-600' : 'border-gray-300 text-gray-500 hover:border-orange-300 hover:text-orange-600'
        }`}>
        📎 파일 첨부 (선택, 여러 개 가능) — 클릭 또는 드래그 앤 드롭
      </button>
    </div>
  )
}
