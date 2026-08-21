/**
 * POST /api/ai-tasks/classify
 *
 * 관리자 전용 — 과제 1건을 Claude(Anthropic API)에 보내 "자동화 / 효율화 / 판단 필요"로
 * 1차 분류한다. 개별 재분석과 "AI 분류 실행"(미분류 일괄 실행) 양쪽 모두 이 엔드포인트
 * 하나를 호출한다 (taskId 1건 단위).
 *
 * 인증: AI 과제 관리 관리자 세션(ai-admin-session, lib/admin-session.ts)
 * 필요 환경변수: ANTHROPIC_API_KEY
 */
import { NextRequest, NextResponse } from 'next/server'
import { getIronSession } from 'iron-session'
import { cookies } from 'next/headers'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@/lib/supabase'
import { AdminSessionData, getAdminSessionOptions } from '@/lib/admin-session'
import type { AiTask, ClassificationType } from '@/lib/ai-tasks'

export const runtime = 'nodejs'
export const maxDuration = 60

const MODEL: Anthropic.Model = 'claude-opus-5'

// 이미지/PDF만 Claude API가 직접 읽을 수 있다 — 그 외(doc/docx/ppt/pptx/xls/xlsx/zip)는
// 내용을 추측하지 않고 분석 대상에서 명시적으로 제외한다.
const SUPPORTED_EXT: Record<string, 'image/jpeg' | 'image/png' | 'application/pdf'> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', pdf: 'application/pdf',
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024

const CRITERIA = `당신은 사내 AI 해커톤에 등록된 과제를 "자동화" 또는 "효율화"로 1차 분류하는 역할입니다.

[분류 기준]

자동화
- 사람이 반복적으로 수행하던 업무의 전부 또는 일부를 시스템/AI가 대신 수행하는 과제
- 정기적인 데이터 수집, 모니터링, 생성, 전달, 처리 등을 자동 실행하는 경우
- 사람의 개입이나 반복 작업 자체를 줄이거나 없애는 것이 핵심인 경우

효율화
- 기존 업무를 사람이 계속 수행하지만 AI를 활용해 더 빠르고 편리하게 처리하는 과제
- 검색, 요약, 분석, 작성, 정보 탐색, 의사결정 지원 등 업무 생산성을 높이는 것이 핵심인 경우

두 성격이 모두 있는 경우에는 과제의 핵심 목적을 기준으로 주된 유형 하나를 선택하세요.
내용만으로 판단하기 어려운 경우에는 억지로 분류하지 말고 "needs_review"(판단 필요)로 분류하세요.

제목만 보고 판단하지 말고 과제명, 개선하고 싶은 업무, 개선 방향/AI 활용 계획, 기타 설명, 첨부파일(있는 경우)을
모두 종합해서 판단하세요. 분석 제외로 표시된 첨부파일의 내용은 추측하지 마세요.

classification 필드에는 "automation" | "efficiency" | "needs_review" 중 하나만 넣고,
reason 필드에는 판단 근거를 한국어 한 문장으로 작성하세요.`

async function verifyAdmin(): Promise<boolean> {
  try {
    const session = await getIronSession<AdminSessionData>(await cookies(), getAdminSessionOptions())
    return session.authenticated === true
  } catch {
    return false
  }
}

function extOf(name: string): string {
  const m = /\.([a-zA-Z0-9]+)$/.exec(name)
  return m ? m[1].toLowerCase() : ''
}

type AttachmentResult =
  | { ok: true; mediaType: 'image/jpeg' | 'image/png' | 'application/pdf'; base64: string }
  | { ok: false; reason: string }

async function fetchAttachment(url: string, displayName: string): Promise<AttachmentResult> {
  const ext = extOf(displayName)
  const mediaType = SUPPORTED_EXT[ext]
  if (!mediaType) return { ok: false, reason: `미지원 형식(.${ext || '?'})이라 분석 제외` }

  try {
    const res = await fetch(url)
    if (!res.ok) return { ok: false, reason: '첨부파일 다운로드 실패로 분석 제외' }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_ATTACHMENT_BYTES) return { ok: false, reason: '첨부파일 용량이 커서 분석 제외' }
    return { ok: true, mediaType, base64: buf.toString('base64') }
  } catch {
    return { ok: false, reason: '첨부파일 다운로드 실패로 분석 제외' }
  }
}

export async function POST(req: NextRequest) {
  if (!(await verifyAdmin())) {
    return NextResponse.json({ error: '관리자 인증이 필요합니다.' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' }, { status: 500 })
  }

  const { taskId } = await req.json() as { taskId?: string }
  if (!taskId) return NextResponse.json({ error: 'taskId가 필요합니다.' }, { status: 400 })

  const { data: taskRow, error: fetchErr } = await supabase.from('ai_tasks').select('*').eq('id', taskId).single()
  if (fetchErr || !taskRow) return NextResponse.json({ error: '과제를 찾을 수 없습니다.' }, { status: 404 })
  const task = taskRow as AiTask

  const content: Anthropic.ContentBlockParam[] = []
  const attachmentNotes: string[] = []

  for (const [url, name] of [
    [task.ai_usage_file_url, task.ai_usage_file_name] as const,
    [task.result_file_url, task.result_file_name] as const,
  ]) {
    if (!url) continue
    const label = name ?? url
    const attachment = await fetchAttachment(url, label)
    if (attachment.ok) {
      if (attachment.mediaType === 'application/pdf') {
        content.push({
          type: 'document',
          title: label,
          source: { type: 'base64', media_type: 'application/pdf', data: attachment.base64 },
        })
      } else {
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: attachment.mediaType, data: attachment.base64 },
        })
      }
      attachmentNotes.push(`- "${label}": 분석 대상에 포함됨`)
    } else {
      attachmentNotes.push(`- "${label}": ${attachment.reason}`)
    }
  }

  const taskText = [
    `[팀] ${task.team}`,
    `[과제명] ${task.title}`,
    `[개선하고 싶은 업무 또는 프로세스] ${task.current_work ?? '(작성 없음)'}`,
    `[개선 방향 / AI 활용 계획] ${task.ai_usage ?? '(작성 없음)'}`,
    `[과제 등록 시 작성한 기타 설명 / 결과물] ${task.result_content ?? '(작성 없음)'}`,
    attachmentNotes.length ? `[첨부파일]\n${attachmentNotes.join('\n')}` : '',
  ].filter(Boolean).join('\n')

  content.push({ type: 'text', text: `${CRITERIA}\n\n---\n\n아래는 실제 과제 내용입니다. 위 기준에 따라 분류해주세요.\n\n${taskText}` })

  const client = new Anthropic({ apiKey })

  let result: { classification: ClassificationType; reason: string }
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      output_config: {
        effort: 'medium',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              classification: { type: 'string', enum: ['automation', 'efficiency', 'needs_review'] },
              reason: { type: 'string' },
            },
            required: ['classification', 'reason'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content }],
    })

    if (response.stop_reason === 'refusal') {
      return NextResponse.json({ error: 'AI가 이 과제의 분류를 거부했습니다.' }, { status: 502 })
    }

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
    if (!textBlock) return NextResponse.json({ error: 'AI 응답에서 분류 결과를 찾을 수 없습니다.' }, { status: 502 })

    const raw = JSON.parse(textBlock.text) as { classification?: string; reason?: string }
    if (
      (raw.classification !== 'automation' && raw.classification !== 'efficiency' && raw.classification !== 'needs_review')
      || !raw.reason
    ) {
      return NextResponse.json({ error: 'AI 응답 형식이 올바르지 않습니다.' }, { status: 502 })
    }
    result = { classification: raw.classification, reason: raw.reason }
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 올바르지 않습니다.' }, { status: 500 })
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'AI 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }, { status: 429 })
    }
    console.error('[api/ai-tasks/classify] Claude 호출 실패:', err)
    return NextResponse.json({ error: 'AI 분류 처리 중 오류가 발생했습니다.' }, { status: 502 })
  }

  const classifiedAt = new Date().toISOString()
  const { error: updErr } = await supabase.from('ai_tasks').update({
    classification_type: result.classification,
    classification_reason: result.reason,
    classification_by: 'ai',
    classified_at: classifiedAt,
  }).eq('id', taskId)
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  return NextResponse.json({
    classification_type: result.classification,
    classification_reason: result.reason,
    classification_by: 'ai',
    classified_at: classifiedAt,
  })
}
