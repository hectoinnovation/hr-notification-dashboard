import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { hashPassword } from '@/lib/ai-tasks'

// Preview/로컬 환경에서만 "실제 사용하는 모습"을 바로 보여주기 위한 데모 데이터 시더.
// Production에서는 절대 실행되지 않는다 — VERCEL_ENV는 Vercel이 배포 종류에 따라
// 자동으로 채우는 값이라 사람이 실수로 잘못 설정할 수 없다.
// 데모 비밀번호는 공통으로 "demo1234".
const DEMO_PASSWORD = 'demo1234'
const TASK_ID = '00000000-0000-4000-a000-000000000001' // 채용공고 자동화 (진행중 · 자체 해결)

export async function POST() {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ seeded: false, reason: 'production' })
  }

  const password_hash = await hashPassword(DEMO_PASSWORD)
  const nowIso = new Date().toISOString()

  const { error: taskErr } = await supabase.from('ai_tasks').upsert([
    {
      id: TASK_ID, title: '채용공고 자동화', team: '인사팀', author: '안소정',
      resolution_type: 'self', status: 'in_progress',
      current_work: '매주 채용공고를 작성하고 있습니다.',
      ai_usage: 'ChatGPT를 활용하여\n채용공고 초안을 자동 생성할 예정입니다.',
      password_hash, priority: 'high',
      created_at: nowIso, updated_at: nowIso,
    },
  ], { onConflict: 'id', ignoreDuplicates: true })
  if (taskErr) {
    console.error('[AI 해커톤] 예시 데이터 시딩 실패(ai_tasks):', taskErr.message)
    return NextResponse.json({ seeded: false, error: taskErr.message }, { status: 500 })
  }

  const { error: commentErr } = await supabase.from('ai_comments').upsert([
    { id: '00000000-0000-4000-a000-000000000011', task_id: TASK_ID, author: '김민수', content: '좋은 아이디어네요.', password_hash, is_accepted: false },
    { id: '00000000-0000-4000-a000-000000000012', task_id: TASK_ID, author: '박지은', content: '완료되면 프롬프트도 공유 부탁드립니다.', password_hash, is_accepted: false },
  ], { onConflict: 'id', ignoreDuplicates: true })
  if (commentErr) {
    console.error('[AI 해커톤] 예시 데이터 시딩 실패(ai_comments):', commentErr.message)
    return NextResponse.json({ seeded: false, error: commentErr.message }, { status: 500 })
  }

  return NextResponse.json({ seeded: true })
}
