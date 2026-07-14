'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { AiGuide } from '@/lib/ai-tasks'
import { GuideCard } from '@/components/ai/GuideCard'
import { GuideForm, EMPTY_GUIDE_FORM, type GuideFormData } from '@/components/ai/GuideForm'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'

export default function AdminGuidesPage() {
  const [guides, setGuides] = useState<AiGuide[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<AiGuide | null>(null)
  const [form, setForm] = useState<GuideFormData>(EMPTY_GUIDE_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase.from('ai_guides').select('*').order('sort_order', { ascending: true })
    if (err) console.error('[AI 활용 방법 관리] ai_guides 조회 실패:', err.message)
    setGuides((data ?? []) as AiGuide[])
    setLoading(false)
  }
  useEffect(() => { (async () => { await load() })() }, [])

  function openAdd() { setEditTarget(null); setForm(EMPTY_GUIDE_FORM); setShowForm(true); setError(null) }
  function openEdit(g: AiGuide) {
    setEditTarget(g)
    setForm({ title: g.title, category: g.category, description: g.description ?? '', url: g.url })
    setShowForm(true)
    setError(null)
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.url.trim()) return
    setSaving(true)
    setError(null)
    const nowIso = new Date().toISOString()
    const payload = {
      title: form.title.trim(), category: form.category,
      description: form.description || null, url: form.url.trim(),
      updated_at: nowIso,
    }
    const { error: err } = editTarget
      ? await supabase.from('ai_guides').update(payload).eq('id', editTarget.id)
      : await supabase.from('ai_guides').insert({ ...payload, sort_order: guides.length })
    setSaving(false)
    if (err) { setError(err.message); return }
    setShowForm(false)
    load()
  }

  async function handleDelete(id: string, title: string) {
    if (!confirm(`"${title}" 자료를 삭제하시겠습니까?`)) return
    const { error: err } = await supabase.from('ai_guides').delete().eq('id', id)
    if (err) { setError(err.message); return }
    load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">AI 활용 방법 관리</h1>
        <button onClick={openAdd}
          className="text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
          + 자료 등록
        </button>
      </div>

      {error && !showForm && <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      {loading ? <LoadingState />
        : guides.length === 0 ? (
          <EmptyState label="등록된 자료가 없습니다." description="위의 '+ 자료 등록' 버튼으로 첫 자료를 등록해보세요." />
        )
        : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {guides.map(g => (
              <div key={g.id} className="relative group">
                <GuideCard guide={g} />
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={e => { e.preventDefault(); openEdit(g) }}
                    className="w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-500 hover:text-gray-800 text-xs">✎</button>
                  <button onClick={e => { e.preventDefault(); handleDelete(g.id, g.title) }}
                    className="w-6 h-6 flex items-center justify-center rounded bg-white border border-gray-200 text-gray-400 hover:text-red-500 text-xs">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

      {showForm && (
        <Modal title={editTarget ? '자료 수정' : '자료 등록'} onClose={() => setShowForm(false)}>
          <div className="space-y-4">
            <GuideForm form={form} onChange={setForm} />
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={handleSubmit} disabled={saving || !form.title.trim() || !form.url.trim()}
                className="text-sm px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-40 transition-colors">
                {saving ? '저장 중...' : editTarget ? '수정 완료' : '등록'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
