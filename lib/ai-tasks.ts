import bcrypt from 'bcryptjs'
import { supabase } from './supabase'

// ─── 두 축을 혼동하지 말 것 ────────────────────────────────────────────────────
// status          = 진행 상태  (진행중 / 완료)
// resolution_type = 해결 방식  (자체 해결 / 도움 필요)

export type TaskStatus = 'in_progress' | 'done'
export type ResolutionType = 'self' | 'help'
export type Priority = 'urgent' | 'high' | 'medium' | 'low'
export type GuideCategory = 'AI 뉴스' | '프롬프트' | '활용 사례' | '바이브코딩' | '추천 툴' | '교육자료' | '기타'

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
  description: string
  category: GuideCategory
  url?: string
  image_url?: string
  author: string
  is_pinned: boolean
  is_required: boolean
  created_at: string
  updated_at: string
}

export type AiTeam = {
  id: string
  name: string
  sort_order: number
  is_active: boolean
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

// 자료 정렬: 필독 최우선 → 고정(Pin) → 최신 등록순
export function sortGuides(guides: AiGuide[]): AiGuide[] {
  return [...guides].sort((a, b) => {
    if (a.is_required !== b.is_required) return a.is_required ? -1 : 1
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })
}

// 팀 정렬: sort_order ASC, 동률이면 name ASC — 등록 Dropdown/팀 참여 현황도 동일 순서 사용
export function sortTeams(teams: AiTeam[]): AiTeam[] {
  return [...teams].sort((a, b) => {
    if (a.sort_order !== b.sort_order) {
      return a.sort_order - b.sort_order
    }
    return a.name.localeCompare(b.name, 'ko')
  })
}

// ─── 대표 이미지 업로드 (서버 API 라우트 없음 — 브라우저에서 Storage 직접 호출) ───
export async function uploadGuideImage(file: File): Promise<string> {
  const path = `${Date.now()}_${file.name}`
  const { error } = await supabase.storage.from('ai-guide-images').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('ai-guide-images').getPublicUrl(path)
  return data.publicUrl
}
