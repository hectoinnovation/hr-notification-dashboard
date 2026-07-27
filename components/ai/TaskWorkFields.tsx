'use client'

import { FileAttachField, type ExistingFile } from './FileAttachField'

// 등록/수정 화면이 동일한 UI를 쓰도록 STEP3(업무 내용) 블록을 공용 컴포넌트로 분리했다.
export function TaskWorkFields({
  currentWork, onCurrentWorkChange,
  aiUsage, onAiUsageChange,
  aiUsageFile, onAiUsageFileChange,
  existingFile, onRemoveExistingFile,
}: {
  currentWork: string
  onCurrentWorkChange: (v: string) => void
  aiUsage: string
  onAiUsageChange: (v: string) => void
  aiUsageFile: File | null
  onAiUsageFileChange: (file: File | null) => void
  existingFile?: ExistingFile | null
  onRemoveExistingFile?: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
        <p className="text-sm font-bold text-orange-700">💡 좋은 과제는 AI를 얼마나 많이 활용했는지가 아니라, 업무의 본질을 고민하고 AI와 함께 더 가치 있는 일에 집중하는 경험을 만드는 것입니다.</p>
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">개선하고 싶은 업무 또는 프로세스</label>
        <textarea value={currentWork} onChange={e => onCurrentWorkChange(e.target.value)} rows={4}
          placeholder={'예) 현재 어떤 업무를 수행하고 있나요?\n업무는 어떤 절차로 진행되나요?\n반복되는 작업이나 시간이 많이 소요되는 부분,\n현재 느끼는 불편함을 함께 작성해주세요.'}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-gray-500 block mb-1.5">개선 방향</label>
        <textarea value={aiUsage} onChange={e => onAiUsageChange(e.target.value)} rows={4}
          placeholder={'예) AI 또는 바이브코딩으로 어떤 부분을 개선하고 싶나요?\n어떤 기능을 만들고 싶은지,\n업무가 어떻게 달라질지,\n기대하는 효과까지 함께 작성해주세요.'}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
        <FileAttachField file={aiUsageFile} onChange={onAiUsageFileChange} existingFile={existingFile} onRemoveExisting={onRemoveExistingFile} />
        <p className="text-xs text-gray-400">업무 흐름도, 화면 캡처, 엑셀 양식, 기획서(Word·PowerPoint·PDF 등)를 함께 첨부하면 과제를 더 구체적으로 검토할 수 있습니다.</p>
      </div>
    </div>
  )
}
