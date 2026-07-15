import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/ai-tasks'

// Preview/로컬 환경에서만 "실제 사용하는 모습"을 바로 보여주기 위한 데모 데이터 시더.
// Production에서는 절대 실행되지 않는다 — VERCEL_ENV는 Vercel이 배포 종류에 따라
// 자동으로 채우는 값이라 사람이 실수로 잘못 설정할 수 없다.
// 데모 비밀번호는 공통으로 "demo1234".
const DEMO_PASSWORD = 'demo1234'

const TASK1_ID = '00000000-0000-4000-a000-000000000001' // 채용공고 자동화 (진행중 · 자체 해결)
const TASK2_ID = '00000000-0000-4000-a000-000000000002' // 신규입사자 안내 메일 자동화 (완료 · 자체 해결)
const TASK3_ID = '00000000-0000-4000-a000-000000000003' // 면접 질문 자동 생성 (진행중 · 도움 필요)

export async function POST() {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ seeded: false, reason: 'production' })
  }

  const password_hash = await hashPassword(DEMO_PASSWORD)
  const nowIso = new Date().toISOString()

  const { error: taskErr } = await supabase.from('ai_tasks').upsert([
    {
      id: TASK1_ID, title: '채용공고 자동화', team: '인사팀', author: '안소정',
      resolution_type: 'self', status: 'in_progress',
      current_work: '매주 채용공고를 작성하고 있습니다.',
      ai_usage: 'ChatGPT를 활용하여\n채용공고 초안을 자동 생성할 예정입니다.',
      password_hash, priority: 'high',
      created_at: nowIso, updated_at: nowIso,
    },
    {
      id: TASK2_ID, title: '신규입사자 안내 메일 자동화', team: '인사팀', author: '안소정',
      resolution_type: 'self', status: 'done',
      ai_usage: 'Claude를 활용하여\n입사 안내 메일 초안을 자동 작성했습니다.',
      result_content: '기존 20분 걸리던 업무를\n3분으로 단축했습니다.',
      completed_at: nowIso.slice(0, 10),
      password_hash, priority: 'urgent',
      created_at: nowIso, updated_at: nowIso,
    },
    {
      id: TASK3_ID, title: '면접 질문 자동 생성', team: '인재팀', author: '최다인',
      resolution_type: 'help', status: 'in_progress',
      ai_usage: 'Claude를 사용하려고 하는데\n프롬프트 작성이 어렵습니다.',
      password_hash, priority: 'medium',
      created_at: nowIso, updated_at: nowIso,
    },
  ], { onConflict: 'id', ignoreDuplicates: true })
  if (taskErr) {
    console.error('[AI 해커톤] 예시 데이터 시딩 실패(ai_tasks):', taskErr.message)
    return NextResponse.json({ seeded: false, error: taskErr.message }, { status: 500 })
  }

  const { error: commentErr } = await supabase.from('ai_comments').upsert([
    { id: '00000000-0000-4000-a000-000000000011', task_id: TASK1_ID, author: '김민수', content: '좋은 아이디어네요.', password_hash, is_accepted: false },
    { id: '00000000-0000-4000-a000-000000000012', task_id: TASK1_ID, author: '박지은', content: '완료되면 프롬프트도 공유 부탁드립니다.', password_hash, is_accepted: false },
    { id: '00000000-0000-4000-a000-000000000021', task_id: TASK2_ID, author: '이수진', content: '저희 팀도 적용했습니다.', password_hash, is_accepted: true },
    { id: '00000000-0000-4000-a000-000000000022', task_id: TASK2_ID, author: '김현우', content: '프롬프트 공유 가능할까요?', password_hash, is_accepted: false },
    { id: '00000000-0000-4000-a000-000000000023', task_id: TASK2_ID, author: '박소영', content: '좋은 사례 감사합니다.', password_hash, is_accepted: false },
    { id: '00000000-0000-4000-a000-000000000031', task_id: TASK3_ID, author: '김철수', content: '제가 사용하는 프롬프트 공유드릴게요.', password_hash, is_accepted: true },
  ], { onConflict: 'id', ignoreDuplicates: true })
  if (commentErr) {
    console.error('[AI 해커톤] 예시 데이터 시딩 실패(ai_comments):', commentErr.message)
    return NextResponse.json({ seeded: false, error: commentErr.message }, { status: 500 })
  }

  return NextResponse.json({ seeded: true })
}
