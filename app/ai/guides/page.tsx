'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { sortGuides, type AiGuide } from '@/lib/ai-tasks'
import { GuideCard } from '@/components/ai/GuideCard'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'

export default function AiGuidesPage() {
  const [guides, setGuides] = useState<AiGuide[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('ai_guides').select('*')
      if (error) console.error('[AI 활용 방법] ai_guides 조회 실패:', error.message)
      setGuides(sortGuides((data ?? []) as AiGuide[]))
      setLoading(false)
    })()
  }, [])

  const requiredGuides = guides.filter(g => g.is_required)
  const otherGuides = guides.filter(g => !g.is_required)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">AI 활용 방법</h1>
        <p className="text-xs text-gray-400">과제를 등록하기 전에 참고할 수 있는 자료입니다.</p>
      </div>

      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl flex-shrink-0 leading-none">📚</span>
        <div className="space-y-1">
          <p className="text-sm font-bold text-orange-700">AI 해커톤 참여 전, 필독 자료를 먼저 확인해주세요.</p>
          <p className="text-sm text-orange-700 leading-relaxed">
            AI 해커톤의 목적과 진행 방향을 이해하는 데 도움이 되는 자료입니다.
            <br />
            &apos;필독&apos; 자료를 먼저 확인한 후 다른 교육 자료와 활용 사례를 살펴보시기 바랍니다.
            <br />
            👇 아래 &apos;필독&apos; 자료부터 확인한 후 다른 교육 자료를 살펴보세요.
          </p>
        </div>
      </div>

      {loading ? <LoadingState />
        : guides.length === 0 ? (
          <EmptyState label="등록된 자료가 없습니다." description="관리자가 자료를 등록하면 이곳에 표시됩니다." />
        )
        : (
          <>
            {requiredGuides.length > 0 && (
              <div className="space-y-3 pt-2">
                <h2 className="text-sm font-bold text-gray-800">🔥 필독 자료</h2>
                <div className="space-y-4 max-w-xl">
                  {requiredGuides.map(g => <GuideCard key={g.id} guide={g} highlightRequired />)}
                </div>
              </div>
            )}

            {otherGuides.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <h2 className="text-sm font-bold text-gray-800">📚 교육자료 및 활용 사례</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {otherGuides.map(g => <GuideCard key={g.id} guide={g} highlightRequired />)}
                </div>
              </div>
            )}
          </>
        )}
    </div>
  )
}
