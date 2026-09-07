import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sendMail } from '@/lib/mail'

// 임시 진단 전용 라우트 — 웰니스 메일 첨부 누락 원인(코드 vs SMTP 릴레이/게이트웨이)을
// 좁히기 위한 것으로, 원인 확인 후 삭제한다. scheduled_mails/cron/온보딩 자동메일과는
// 무관하며, 기존 /api/wellness-mail, /api/send-mail도 건드리지 않는다.
// 이 라우트는 proxy.ts의 PUBLIC_PATHS에 포함되지 않았으므로 기존 세션 로그인(hr-session)이
// 있어야만 호출 가능 — 나머지 대시보드 API와 동일한 보호를 그대로 상속받는다.
// to는 요청자가 직접 지정한 주소로만 발송된다(하드코딩된 수신자 없음).
export const runtime = 'nodejs'

type Variant = 'txt' | 'xlsx-ascii' | 'xlsx-kr'

function buildTestXlsxBase64(): string {
  const ws = XLSX.utils.json_to_sheet([{ 이름: '테스트', 금액: '10,000원' }])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'test')
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string
}

function buildAttachment(variant: Variant): { filename: string; content: Buffer; contentType: string } {
  if (variant === 'txt') {
    return {
      filename: 'wellness_test.txt',
      content: Buffer.from('첨부파일 테스트입니다.\n웰니스포인트 테스트\n', 'utf-8'),
      contentType: 'text/plain; charset=utf-8',
    }
  }
  const base64 = buildTestXlsxBase64()
  const content = Buffer.from(base64, 'base64')
  const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  return variant === 'xlsx-ascii'
    ? { filename: 'wellness_test.xlsx', content, contentType }
    : { filename: '웰니스포인트_테스트.xlsx', content, contentType }
}

export async function POST(req: NextRequest) {
  const { to, variant } = await req.json() as { to?: string; variant?: Variant }

  if (!to || !to.trim()) {
    return NextResponse.json({ error: 'to(수신자)를 지정해주세요.' }, { status: 400 })
  }
  if (variant !== 'txt' && variant !== 'xlsx-ascii' && variant !== 'xlsx-kr') {
    return NextResponse.json({ error: "variant는 'txt' | 'xlsx-ascii' | 'xlsx-kr' 중 하나여야 합니다." }, { status: 400 })
  }

  const attachment = buildAttachment(variant)
  console.log('[api/debug/attachment-test] 호출 →', {
    variant, filename: attachment.filename, byteLength: attachment.content.length, contentType: attachment.contentType,
  })

  const err = await sendMail({
    to: [to.trim()],
    subject: `[첨부 진단] ${variant} 테스트`,
    html: `<div>첨부 진단 테스트 메일입니다. variant=${variant}</div>`,
    attachments: [attachment],
  })
  if (err) {
    console.error('[api/debug/attachment-test] sendMail 오류 →', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }
  return NextResponse.json({ ok: true, variant, filename: attachment.filename, byteLength: attachment.content.length })
}
