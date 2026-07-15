'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hashPassword, type ResolutionType, type AiFile } from '@/lib/ai-tasks'
import { FormSection } from '@/components/ai/FormSection'
import { FileUploadField } from '@/components/ai/FileUploadField'

export default function AiRegisterPage() {
  const router = useRouter()
  const taskId = useMemo(() => crypto.randomUUID(), [])

  const [resolutionType, setResolutionType] = useState<ResolutionType | null>(null)
  const [title, setTitle] = useState('')
  const [team, setTeam] = useState('')
  const [author, setAuthor] = useState('')
  const [currentWork, setCurrentWork] = useState('')
  const [aiUsage, setAiUsage] = useState('')
  const [resultContent, setResultContent] = useState('')
  const [files, setFiles] = useState<Pick<AiFile, 'file_name' | 'file_url'>[]>([])
  const [password, setPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = resolutionType !== null && title.trim() && team.trim() && author.trim() && password.trim().length >= 4

  async function handleSubmit() {
    if (!canSubmit || !resolutionType) return
    setSubmitting(true)
    setError(null)
    try {
      const password_hash = await hashPassword(password.trim())
      const { error: err } = await supabase.from('ai_tasks').insert({
        id: taskId,
        title: title.trim(),
        team: team.trim(),
        author: author.trim(),
        resolution_type: resolutionType,
        current_work: currentWork.trim() || null,
        ai_usage: aiUsage.trim() || null,
        result_content: resultContent.trim() || null,
        password_hash,
      })
      if (err) { setError(err.message); return }

      for (const f of files) {
        await supabase.from('ai_files').insert({ task_id: taskId, file_name: f.file_name, file_url: f.file_url, uploaded_by: author.trim() })
      }

      router.push(`/ai/tasks/${taskId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">AI 과제 등록</h1>
        <p className="text-sm text-gray-400 mt-0.5">AI를 활용해 해결했거나, 도움이 필요한 업무를 공유해주세요.</p>
      </div>

      <FormSection step={1} title="해결 방식">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button type="button" onClick={() => setResolutionType('self')}
            className={`relative text-left px-4 py-4 rounded-xl border-2 transition-colors ${
              resolutionType === 'self' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-200'
            }`}>
            {resolutionType === 'self' && <span className="absolute top-3 right-3 text-orange-500">✓</span>}
            <p className="text-sm font-bold text-gray-900">🤖 자체 해결</p>
            <p className="text-xs text-gray-500 mt-1">AI를 활용하여 해결했습니다.</p>
          </button>
          <button type="button" onClick={() => setResolutionType('help')}
            className={`relative text-left px-4 py-4 rounded-xl border-2 transition-colors ${
              resolutionType === 'help' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-200'
            }`}>
            {resolutionType === 'help' && <span className="absolute top-3 right-3 text-orange-500">✓</span>}
            <p className="text-sm font-bold text-gray-900">🙋 도움 필요</p>
            <p className="text-xs text-gray-500 mt-1">다른 직원의 도움이 필요합니다.</p>
          </button>
        </div>
      </FormSection>

      <FormSection step={2} title="기본 정보">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">제목<span className="text-red-400 ml-0.5">*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예) 채용공고 자동 생성"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">팀<span className="text-red-400 ml-0.5">*</span></label>
              <input value={team} onChange={e => setTeam(e.target.value)} placeholder="예) 인사팀"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">작성자<span className="text-red-400 ml-0.5">*</span></label>
              <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="예) 안소정"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
            </div>
          </div>
        </div>
      </FormSection>

      <FormSection step={3} title="업무 내용">
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">현재 업무</label>
            <textarea value={currentWork} onChange={e => setCurrentWork(e.target.value)} rows={2}
              placeholder="예) 매주 채용공고 작성"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">AI 활용 내용</label>
            <textarea value={aiUsage} onChange={e => setAiUsage(e.target.value)} rows={3}
              placeholder="예) ChatGPT를 활용하여 채용공고 초안을 자동으로 생성했습니다."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">해결 결과</label>
            <textarea value={resultContent} onChange={e => setResultContent(e.target.value)} rows={2}
              placeholder="예) 공고 작성 시간을 30분에서 5분으로 단축했습니다. (아직 진행 중이면 비워두셔도 됩니다)"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
          </div>
        </div>
      </FormSection>

      <FormSection step={4} title="첨부파일">
        <FileUploadField taskId={taskId} files={files} onFilesChange={setFiles} />
      </FormSection>

      <FormSection step={5} title="수정 비밀번호">
        <div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="4자 이상 입력 (수정·삭제·완료 처리 시 필요합니다)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
        </div>
      </FormSection>

      {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">등록 실패: {error}</p>}

      <button onClick={handleSubmit} disabled={!canSubmit || submitting}
        className="w-full text-sm font-bold py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40">
        {submitting ? '등록 중...' : '🤖 AI 과제 등록하기'}
      </button>
    </div>
  )
}
