'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { sortTeams, type AiTeam } from '@/lib/ai-tasks'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'

const DELETE_BLOCKED_MESSAGE = '해당 팀에는 등록된 과제가 있습니다.\n과제를 삭제하거나 다른 팀으로 변경한 후 삭제해주세요.'

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<AiTeam[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<AiTeam | null>(null)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase.from('ai_teams').select('*')
    if (err) console.error('[참여팀 관리] ai_teams 조회 실패:', err.message)
    setTeams(sortTeams((data ?? []) as AiTeam[]))
    setLoading(false)
  }
  useEffect(() => { (async () => { await load() })() }, [])

  function openAdd() { setEditTarget(null); setName(''); setFormError(null); setShowForm(true) }
  function openEdit(t: AiTeam) { setEditTarget(t); setName(t.name); setFormError(null); setShowForm(true) }

  async function handleSubmit() {
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setFormError(null)
    const nowIso = new Date().toISOString()

    if (editTarget) {
      const oldName = editTarget.name
      if (trimmed !== oldName) {
        const { error: renameErr } = await supabase.from('ai_teams')
          .update({ name: trimmed, updated_at: nowIso }).eq('id', editTarget.id)
        if (renameErr) { setSaving(false); setFormError(renameErr.message); return }

        // 팀명 변경 시 기존 과제의 팀명도 함께 갱신 (트리거를 쓰지 않는 기존 관례 — 앱 코드에서 동기화)
        const { error: cascadeErr } = await supabase.from('ai_tasks')
          .update({ team: trimmed, updated_at: nowIso }).eq('team', oldName)
        if (cascadeErr) { setSaving(false); setFormError(`팀명은 변경되었지만 기존 과제 반영에 실패했습니다: ${cascadeErr.message}`); return }
      }
    } else {
      const maxOrder = teams.reduce((max, t) => Math.max(max, t.sort_order), -1)
      const { error: insErr } = await supabase.from('ai_teams').insert({ name: trimmed, sort_order: maxOrder + 1 })
      if (insErr) { setSaving(false); setFormError(insErr.message); return }
    }

    setSaving(false)
    setShowForm(false)
    load()
  }

  async function handleDelete(t: AiTeam) {
    setError(null)
    const { count, error: countErr } = await supabase.from('ai_tasks')
      .select('id', { count: 'exact', head: true }).eq('team', t.name)
    if (countErr) { setError(countErr.message); return }
    if ((count ?? 0) > 0) { setError(DELETE_BLOCKED_MESSAGE); return }

    if (!confirm(`"${t.name}" 팀을 삭제하시겠습니까?`)) return
    const { error: delErr } = await supabase.from('ai_teams').delete().eq('id', t.id)
    if (delErr) { setError(delErr.message); return }
    load()
  }

  async function toggleActive(t: AiTeam) {
    setError(null)
    const { error: err } = await supabase.from('ai_teams')
      .update({ is_active: !t.is_active, updated_at: new Date().toISOString() }).eq('id', t.id)
    if (err) { setError(err.message); return }
    load()
  }

  async function move(t: AiTeam, direction: 'up' | 'down') {
    const sorted = sortTeams(teams)
    const idx = sorted.findIndex(x => x.id === t.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return
    const other = sorted[swapIdx]
    setError(null)
    const nowIso = new Date().toISOString()
    const [r1, r2] = await Promise.all([
      supabase.from('ai_teams').update({ sort_order: other.sort_order, updated_at: nowIso }).eq('id', t.id),
      supabase.from('ai_teams').update({ sort_order: t.sort_order, updated_at: nowIso }).eq('id', other.id),
    ])
    if (r1.error || r2.error) { setError(r1.error?.message ?? r2.error?.message ?? '순서 변경에 실패했습니다.'); return }
    load()
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">참여팀 관리</h1>
          <p className="text-xs text-gray-400 mt-0.5">과제 등록 화면의 팀 Dropdown에 노출할 팀 목록입니다. 비활성 팀은 신규 등록 시에만 숨겨지고, 기존 과제는 그대로 유지됩니다.</p>
        </div>
        <button onClick={openAdd}
          className="text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors flex-shrink-0">
          + 팀 추가
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-line">{error}</p>
      )}

      {loading ? <LoadingState />
        : teams.length === 0 ? (
          <EmptyState label="등록된 팀이 없습니다." description="위의 '+ 팀 추가' 버튼으로 첫 팀을 등록해보세요." />
        )
        : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {teams.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={() => move(t, 'up')} disabled={i === 0}
                    className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-20 disabled:hover:bg-transparent text-xs">▲</button>
                  <button onClick={() => move(t, 'down')} disabled={i === teams.length - 1}
                    className="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-20 disabled:hover:bg-transparent text-xs">▼</button>
                </div>

                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900 truncate">{t.name}</span>
                  {!t.is_active && (
                    <span className="text-xs font-semibold bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded flex-shrink-0">비활성</span>
                  )}
                </div>

                <button onClick={() => toggleActive(t)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors flex-shrink-0 ${
                    t.is_active
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
                  }`}>
                  {t.is_active ? '활성' : '비활성'}
                </button>
                <button onClick={() => openEdit(t)} title="팀명 수정"
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-gray-800 text-xs flex-shrink-0">✎</button>
                <button onClick={() => handleDelete(t)} title="삭제"
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-400 hover:text-red-500 text-xs flex-shrink-0">✕</button>
              </div>
            ))}
          </div>
        )}

      {showForm && (
        <Modal title={editTarget ? '팀명 수정' : '팀 추가'} onClose={() => setShowForm(false)} maxWidth="max-w-sm">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">팀명<span className="text-red-400 ml-0.5">*</span></label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="예) 인사팀"
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
              {editTarget && (
                <p className="text-xs text-gray-400 mt-1.5">팀명을 변경하면 이미 등록된 과제의 팀명도 함께 변경됩니다.</p>
              )}
            </div>
            {formError && <p className="text-xs text-red-500 whitespace-pre-line">{formError}</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button onClick={() => setShowForm(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
              <button onClick={handleSubmit} disabled={saving || !name.trim()}
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
