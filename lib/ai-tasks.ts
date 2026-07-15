import bcrypt from 'bcryptjs'

// ─── 두 축을 혼동하지 말 것 ────────────────────────────────────────────────────
// status          = 진행 상태  (진행중 / 완료)
// resolution_type = 해결 방식  (자체 해결 / 도움 필요)

export type TaskStatus = 'in_progress' | 'done'
export type ResolutionType = 'self' | 'help'
export type Priority = 'urgent' | 'high' | 'medium' | 'low'
export type GuideCategory = '영상' | '문서' | '블로그' | '프롬프트' | '기타'

export const STATUS_LABEL: Record<TaskStatus, string> = {
  in_progress: '진행중',
  done: '완료',
}

export const RESOLUTION_LABEL: Record<ResolutionType, string> = {
  self: '자체 해결',
  help: '도움 필요',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  urgent: '🔴 긴급',
  high: '🟠 높음',
  medium: '🟡 보통',
  low: '🟢 낮음',
}

// 기본 정렬 우선순위: 긴급 → 높음 → 보통 → 낮음
export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export type AiTask = {
  id: string
  title: string
  team: string
  author: string
  resolution_type: ResolutionType
  status: TaskStatus
  current_work?: string
  ai_usage?: string
  result_content?: string
  completed_at?: string
  password_hash: string
  assignee?: string
  priority?: Priority
  created_at: string
  updated_at: string
}

export type AiGuide = {
  id: string
  title: string
  category: GuideCategory
  description?: string
  url: string
  sort_order: number
  created_at: string
  updated_at: string
}

export type AiAssignment = {
  id: string
  task_id: string
  assignee?: string
  priority?: Priority
  changed_by?: string
  changed_at: string
}

/** 과제별 공개 댓글. 수정/삭제는 password_hash 확인(또는 관리자) 후에만 가능. */
export type AiComment = {
  id: string
  task_id: string
  author: string
  content: string
  password_hash: string
  is_accepted: boolean
  created_at: string
}

// ─── 비밀번호 해시 (서버 API 없이 브라우저에서 직접 해시/검증 — bcryptjs는 순수 JS 구현) ───
// 주의: RLS가 allow_all이라 password_hash 컬럼 자체는 anon key로 조회 가능하다.
// 평문 노출은 막지만, 오프라인 무차별 대입까지 막는 것은 아니다 — 사내망 IP 화이트리스트로 보완.
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// 댓글 정렬: 채택된 댓글을 맨 위로, 그 외에는 등록순(오래된 순)
export function sortComments(comments: AiComment[]): AiComment[] {
  return [...comments].sort((a, b) => {
    if (a.is_accepted !== b.is_accepted) return a.is_accepted ? -1 : 1
    return a.created_at.localeCompare(b.created_at)
  })
}

// ─── 대시보드 집계 헬퍼 (클라이언트에서 한 번의 fetch 결과로 계산) ─────────────
// 진행 상태 집계 (진행중/완료) — resolution_type과 혼동하지 않도록 별도 함수로 분리
export function aggregateByStatus(tasks: AiTask[]): { label: string; value: number }[] {
  return [
    { label: STATUS_LABEL.in_progress, value: tasks.filter(t => t.status === 'in_progress').length },
    { label: STATUS_LABEL.done,        value: tasks.filter(t => t.status === 'done').length },
  ]
}

// 해결 방식 집계 (자체 해결/도움 필요) — status와 혼동하지 않도록 별도 함수로 분리
export function aggregateByResolutionType(tasks: AiTask[]): { label: string; value: number }[] {
  return [
    { label: RESOLUTION_LABEL.self, value: tasks.filter(t => t.resolution_type === 'self').length },
    { label: RESOLUTION_LABEL.help, value: tasks.filter(t => t.resolution_type === 'help').length },
  ]
}

// 팀은 자유 텍스트라 고정 목록이 없다 — 실제 등록된 데이터에서 팀 이름을 뽑아 정렬한다.
export function getDistinctTeams(tasks: AiTask[]): string[] {
  const set = new Set(tasks.map(t => t.team).filter(Boolean))
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'))
}

export function aggregateByTeam(tasks: AiTask[]): { team: string; count: number }[] {
  return getDistinctTeams(tasks).map(team => ({ team, count: tasks.filter(t => t.team === team).length }))
}

export type TeamStats = {
  team: string
  total: number
  inProgress: number
  done: number
  help: number
  self: number
}

// 팀별 등록 건수 / 진행중 / 완료 / 도움 필요 / 자체 해결 통계
export function aggregateTeamStats(tasks: AiTask[]): TeamStats[] {
  return getDistinctTeams(tasks).map(team => {
    const teamTasks = tasks.filter(t => t.team === team)
    return {
      team,
      total: teamTasks.length,
      inProgress: teamTasks.filter(t => t.status === 'in_progress').length,
      done: teamTasks.filter(t => t.status === 'done').length,
      help: teamTasks.filter(t => t.resolution_type === 'help').length,
      self: teamTasks.filter(t => t.resolution_type === 'self').length,
    }
  })
}

// 기본 정렬: 우선순위(긴급→낮음) 우선, 동일 우선순위 내에서는 최신 등록순
export function sortTasksByPriority(tasks: AiTask[]): AiTask[] {
  return [...tasks].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority ?? 'medium']
    const pb = PRIORITY_ORDER[b.priority ?? 'medium']
    if (pa !== pb) return pa - pb
    return b.created_at.localeCompare(a.created_at)
  })
}

// task_id별 댓글 수 집계 (카드에 💬 N 표시용)
export function countCommentsByTask(comments: Pick<AiComment, 'task_id'>[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const c of comments) counts[c.task_id] = (counts[c.task_id] ?? 0) + 1
  return counts
}
