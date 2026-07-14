import { supabase } from './supabase'

// ─── 두 축을 혼동하지 말 것 ────────────────────────────────────────────────────
// status          = 진행 상태  (진행중 / 완료)
// resolution_type = 해결 방식  (자체 해결 / 도움 필요)

export type TaskStatus = 'in_progress' | 'done'
export type ResolutionType = 'self' | 'help'
export type Priority = 'urgent' | 'high' | 'medium' | 'low'
export type GuideCategory = '영상' | '문서' | '블로그' | '프롬프트' | '기타'

export const DEPARTMENTS = ['Wallet사업부', 'SP사업부', 'AI사업부', '경영지원', '인재협업팀', '개발실', '기타'] as const
export type Department = typeof DEPARTMENTS[number]

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
  department: Department
  author: string
  resolution_type: ResolutionType
  status: TaskStatus
  current_work?: string
  problem_definition?: string
  expected_effect?: string
  ai_plan?: string
  result_content?: string
  ai_used?: string
  completed_at?: string
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

/** 공개 운영 메모 — RLS가 allow_all(anon key 전체 CRUD)이라 비공개를 보장할 수 없다. 민감정보 입력 금지. */
export type AiComment = {
  id: string
  task_id: string
  author: string
  content: string
  created_at: string
}

export type AiFile = {
  id: string
  task_id: string
  file_name: string
  file_url: string
  file_size?: number
  uploaded_by?: string
  created_at: string
}

// ─── 파일 업로드 (서버 API 라우트 없음 — 브라우저에서 Storage 직접 호출) ───────
export async function uploadTaskFile(taskId: string, file: File): Promise<{ file_url: string; file_size: number }> {
  const path = `${taskId}/${Date.now()}_${file.name}`
  const { error } = await supabase.storage.from('ai-task-files').upload(path, file)
  if (error) throw error
  const { data } = supabase.storage.from('ai-task-files').getPublicUrl(path)
  return { file_url: data.publicUrl, file_size: file.size }
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

export function aggregateByDepartment(tasks: AiTask[]): { department: Department; count: number }[] {
  return DEPARTMENTS.map(dep => ({ department: dep, count: tasks.filter(t => t.department === dep).length }))
}

export type DepartmentStats = {
  department: Department
  total: number
  inProgress: number
  done: number
  help: number
  self: number
}

// 부서별 등록 건수 / 진행중 / 완료 / 도움 필요 / 자체 해결 통계
export function aggregateDepartmentStats(tasks: AiTask[]): DepartmentStats[] {
  return DEPARTMENTS.map(dep => {
    const deptTasks = tasks.filter(t => t.department === dep)
    return {
      department: dep,
      total: deptTasks.length,
      inProgress: deptTasks.filter(t => t.status === 'in_progress').length,
      done: deptTasks.filter(t => t.status === 'done').length,
      help: deptTasks.filter(t => t.resolution_type === 'help').length,
      self: deptTasks.filter(t => t.resolution_type === 'self').length,
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
