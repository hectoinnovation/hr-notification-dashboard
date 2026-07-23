'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hashPassword, sortTeams, type ResolutionType, type AiTask, type AiTeam } from '@/lib/ai-tasks'
import { FormSection } from '@/components/ai/FormSection'
import { TeamCombobox } from '@/components/ai/TeamCombobox'

export default function AiRegisterPage() {
  const router = useRouter()

  const [teams, setTeams] = useState<AiTeam[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)

  const [resolutionType, setResolutionType] = useState<ResolutionType | null>(null)
  const [title, setTitle] = useState('')
  const [team, setTeam] = useState('')
  const [author, setAuthor] = useState('')
  const [currentWork, setCurrentWork] = useState('')
  const [aiUsage, setAiUsage] = useState('')
  const [password, setPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase.from('ai_teams').select('*').eq('is_active', true)
      if (err) console.error('[AI 과제 등록] ai_teams 조회 실패:', err.message)
      setTeams(sortTeams((data ?? []) as AiTeam[]))
      setTeamsLoading(false)
    })()
  }, [])

  const canSubmit = resolutionType !== null && title.trim() && team.trim() && author.trim() && password.trim().length >= 4

  async function handleSubmit() {
    if (!canSubmit || !resolutionType) return
    setSubmitting(true)
    setError(null)
    try {
      const password_hash = await hashPassword(password.trim())
      const { data, error: err } = await supabase.from('ai_tasks').insert({
        title: title.trim(),
        team: team.trim(),
        author: author.trim(),
        resolution_type: resolutionType,
        current_work: currentWork.trim() || null,
        ai_usage: aiUsage.trim() || null,
        password_hash,
      }).select().single()
      if (err || !data) { setError(err?.message ?? '등록에 실패했습니다.'); return }

      router.push(`/ai/tasks/${(data as AiTask).id}`)
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
        <p className="text-sm text-gray-400 mt-0.5">앞으로 AI를 활용해 해결하려는 업무를 등록해주세요. 완료되면 결과를 공유할 수 있어요.</p>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-1.5">
        <p className="text-sm font-bold text-orange-700">📢 등록 전 꼭 확인해주세요</p>
        <ul className="text-xs text-orange-700 leading-relaxed list-disc list-inside space-y-0.5">
          <li>AI 과제는 모든 팀이 최소 1건 이상 반드시 등록해야 합니다.</li>
          <li>한 팀에서 여러 개의 과제를 등록해도 됩니다.</li>
          <li>팀원 중 1명이 대표로 등록하여 함께 진행하면 됩니다.</li>
          <li>반드시 본인의 실제 소속 팀을 선택한 후 등록해 주세요.</li>
          <li>과제가 완료되면 등록한 과제에서 &apos;과제 링크 / 결과물&apos;을 제출한 후 완료 처리해 주세요.</li>
        </ul>
      </div>

      <FormSection step={1} title="해결 방식">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button type="button" onClick={() => setResolutionType('self')}
            className={`relative text-left px-4 py-4 rounded-xl border-2 transition-colors ${
              resolutionType === 'self' ? 'border-orange-400 bg-orange-50' : 'border-gray-200 bg-white hover:border-orange-200'
            }`}>
            {resolutionType === 'self' && <span className="absolute top-3 right-3 text-orange-500">✓</span>}
            <p className="text-sm font-bold text-gray-900">🤖 자체 해결</p>
            <p className="text-xs text-gray-500 mt-1">AI를 활용하여 스스로 해결할 계획입니다.</p>
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
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="예) 반복 업무 자동화 대시보드 개발"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">팀<span className="text-red-400 ml-0.5">*</span></label>
              {teamsLoading ? (
                <div className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-gray-300 bg-gray-50">불러오는 중...</div>
              ) : teams.length === 0 ? (
                <div className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 text-gray-400 bg-gray-50">등록된 팀이 없습니다. 관리자에게 문의해주세요.</div>
              ) : (
                <TeamCombobox teams={teams} value={team} onChange={setTeam} />
              )}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">작성자<span className="text-red-400 ml-0.5">*</span></label>
              <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="예) 김헥토"
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
              placeholder="예) 반복적으로 데이터를 취합하고 진행 현황을 수작업으로 관리하고 있습니다."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">AI 활용 계획</label>
            <textarea value={aiUsage} onChange={e => setAiUsage(e.target.value)} rows={3}
              placeholder="예) Claude를 활용한 바이브코딩으로 반복 업무를 자동화하고, 결과를 조회·관리할 수 있는 웹페이지를 개발할 예정입니다."
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none placeholder:text-gray-300" />
          </div>
        </div>
      </FormSection>

      <FormSection step={4} title="등록">
        <div>
          <label className="text-xs font-semibold text-gray-500 block mb-1.5">수정 비밀번호<span className="text-red-400 ml-0.5">*</span></label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="4자 이상 입력 (수정·삭제·완료 처리 시 필요합니다)"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
        </div>

        {error && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">등록 실패: {error}</p>}

        <button onClick={handleSubmit} disabled={!canSubmit || submitting}
          className="w-full text-sm font-bold py-3.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-40">
          {submitting ? '등록 중...' : '🤖 AI 과제 등록하기'}
        </button>
      </FormSection>
    </div>
  )
}
