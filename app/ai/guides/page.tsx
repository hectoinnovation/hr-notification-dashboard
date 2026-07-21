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

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">AI 활용 방법</h1>
      <p className="text-xs text-gray-400">과제를 등록하기 전에 참고할 수 있는 자료입니다.</p>
      {loading ? <LoadingState />
        : guides.length === 0 ? (
          <EmptyState label="등록된 자료가 없습니다." description="관리자가 자료를 등록하면 이곳에 표시됩니다." />
        )
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {guides.map(g => <GuideCard key={g.id} guide={g} />)}
          </div>
        )}
    </div>
  )
}
