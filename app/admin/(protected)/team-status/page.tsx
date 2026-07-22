'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { sortTeams, type AiTeam, type AiTask } from '@/lib/ai-tasks'
import { StatusBadge } from '@/components/ai/StatusBadge'
import { FilterChip } from '@/components/ui/FilterChip'
import { EmptyState } from '@/components/ui/EmptyState'
import { LoadingState } from '@/components/ui/LoadingState'

type Filter = '전체' | '등록 완료' | '미등록'

type Row = {
  key: string
  team: string
  task: AiTask | null
}

export default function AdminTeamStatusPage() {
  const router = useRouter()
  const [teams, setTeams] = useState<AiTeam[]>([])
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('전체')

  async function load() {
    setLoading(true)
    const [teamsRes, tasksRes] = await Promise.all([
      supabase.from('ai_teams').select('*').eq('is_active', true),
      supabase.from('ai_tasks').select('*'),
    ])
    if (teamsRes.error) console.error('[팀 참여 현황] ai_teams 조회 실패:', teamsRes.error.message)
    if (tasksRes.error) console.error('[팀 참여 현황] ai_tasks 조회 실패:', tasksRes.error.message)
    setTeams(sortTeams((teamsRes.data ?? []) as AiTeam[]))
    setTasks((tasksRes.data ?? []) as AiTask[])
    setLoading(false)
  }
  useEffect(() => { (async () => { await load() })() }, [])

  // 팀별 행 구성 — 과제를 등록한 팀은 과제마다 한 행(✅), 미등록 팀은 한 행(❌)
  const rows: Row[] = teams.flatMap((t): Row[] => {
    const teamTasks = tasks
      .filter(task => task.team === t.name)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
    if (teamTasks.length === 0) return [{ key: t.id, team: t.name, task: null }]
    return teamTasks.map(task => ({ key: task.id, team: t.name, task }))
  })

  const totalTeams = teams.length
  const registeredTeamCount = teams.filter(t => tasks.some(task => task.team === t.name)).length
  const unregisteredTeamCount = totalTeams - registeredTeamCount
  const rate = totalTeams === 0 ? 0 : Math.round((registeredTeamCount / totalTeams) * 100)

  const filteredRows = rows.filter(r => {
    if (filter === '등록 완료') return r.task !== null
    if (filter === '미등록') return r.task === null
    return true
  })

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-gray-900">팀 참여 현황</h1>

      {loading ? <LoadingState /> : (
        <>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-gray-400">전체 팀</p>
                <p className="text-xl font-bold text-gray-900">{totalTeams}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">등록 완료</p>
                <p className="text-xl font-bold text-emerald-600">{registeredTeamCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">미등록</p>
                <p className="text-xl font-bold text-red-500">{unregisteredTeamCount}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">등록률</p>
                <p className="text-xl font-bold text-orange-600">{rate}%</p>
              </div>
            </div>
            <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 transition-all" style={{ width: `${rate}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <FilterChip label="전체" active={filter === '전체'} onClick={() => setFilter('전체')} count={rows.length} />
            <FilterChip label="등록 완료" active={filter === '등록 완료'} onClick={() => setFilter('등록 완료')} count={registeredTeamCount} />
            <FilterChip label="미등록" active={filter === '미등록'} onClick={() => setFilter('미등록')} count={unregisteredTeamCount} />
          </div>

          {teams.length === 0 ? (
            <EmptyState label="등록된 팀이 없습니다." description="참여팀 관리 화면에서 팀을 먼저 등록해주세요." />
          ) : filteredRows.length === 0 ? (
            <EmptyState label="조건에 맞는 팀이 없습니다." />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                    <th className="px-4 py-2.5 font-medium">상태</th>
                    <th className="px-4 py-2.5 font-medium">팀명</th>
                    <th className="px-4 py-2.5 font-medium">과제명</th>
                    <th className="px-4 py-2.5 font-medium">등록자</th>
                    <th className="px-4 py-2.5 font-medium">등록일</th>
                    <th className="px-4 py-2.5 font-medium">진행상태</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(r => (
                    <tr key={r.key}
                      onClick={r.task ? () => router.push(`/admin/tasks?id=${r.task!.id}`) : undefined}
                      className={`border-b border-gray-50 last:border-0 transition-colors ${
                        r.task ? 'hover:bg-gray-50 cursor-pointer' : ''
                      }`}>
                      <td className="px-4 py-2.5">{r.task ? '✅' : '❌'}</td>
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{r.team}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.task?.title ?? '-'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.task?.author ?? '-'}</td>
                      <td className="px-4 py-2.5 text-gray-400">{r.task ? r.task.created_at.slice(0, 10) : '-'}</td>
                      <td className="px-4 py-2.5">{r.task ? <StatusBadge status={r.task.status} /> : <span className="text-xs text-gray-400">미등록</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
