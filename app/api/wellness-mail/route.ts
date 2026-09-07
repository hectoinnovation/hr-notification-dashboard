import { NextRequest, NextResponse } from 'next/server'
import { sendWellnessMailWithAttachment } from '@/lib/mail'
import { type WellnessMailEntryInput } from '@/lib/wellness-mail'
import { buildWellnessCoinRows, fillWellnessCoinTemplate } from '@/lib/wellness-coin'

// 웰니스포인트 탭 "메일 보내기" 전용 라우트 — 사용자가 버튼을 직접 눌렀을 때만 호출된다.
// scheduled_mails / cron / 온보딩 자동메일과는 완전히 분리되어 있으며, 기존 /api/send-mail
// 라우트도 건드리지 않는다. sendWellnessMailWithAttachment()(lib/mail.ts)만 공유.
//
// 첨부 파일은 화면 "웰니스코인 엑셀 다운로드"(app/api/wellness-coin-excel)가 쓰는 것과
// 완전히 동일한 고정 템플릿(lib/templates/wellness-coin-template.xlsx — 상단 도움말/
// 병합셀/스타일/열 너비/행 높이 그대로)에 buildWellnessCoinRows()로 계산한 값을 채워
// 생성한다(fillWellnessCoinTemplate, lib/wellness-coin.ts 공유) — 워크북 생성 로직을
// 이 라우트에서 새로 만들지 않는다. 계산도 새로 하지 않고 웰니스코인 다운로드가 쓰는
// buildWellnessCoinRows()를 그대로 재사용 — 전적자/정산 미확정 퇴사자 등 제외 규칙도
// 다운로드와 동일하게 적용된다.
// nodemailer는 Node.js 전용 (net/tls 모듈 사용) — Edge runtime에서 실행 시 500 발생
export const runtime = 'nodejs'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function POST(req: NextRequest) {
  const { to, cc, subject, html, entries, attachmentFilename } = await req.json() as {
    to: string[]; cc?: string[]; subject: string; html: string
    entries?: WellnessMailEntryInput[]; sentKeys?: string[]; attachmentFilename?: string
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: '메일로 보낼 대상자가 없습니다.' }, { status: 400 })
  }
  if (!attachmentFilename || !attachmentFilename.trim()) {
    return NextResponse.json({ error: '첨부파일명이 지정되지 않았습니다.' }, { status: 400 })
  }

  // 화면 "웰니스코인 엑셀 다운로드"와 완전히 동일한 대상자 판정/금액 계산(재계산 없음)
  const { included, excluded } = buildWellnessCoinRows(entries)
  if (included.length === 0) {
    return NextResponse.json({
      error: `웰니스코인 지급 대상자가 없습니다(${excluded.map(e => `${e.emp.name}: ${e.reason}`).join(', ') || '전적자/정산 기준 미확정 등 제외 규칙 확인 필요'}).`,
    }, { status: 400 })
  }
  const missingCustomerId = included.filter(r => !r.emp.customer_id?.trim())
  if (missingCustomerId.length > 0) {
    return NextResponse.json({
      error: `고객아이디가 등록되지 않은 대상자가 있습니다: ${missingCustomerId.map(r => r.emp.name).join(', ')}`,
    }, { status: 400 })
  }

  let content: Buffer
  try {
    content = await fillWellnessCoinTemplate(
      included.map(r => ({ name: r.emp.name, customerId: r.emp.customer_id, amount: r.amount })),
    )
  } catch (err) {
    console.error('[api/wellness-mail] xlsx 생성 실패 →', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: err instanceof Error ? err.message : '첨부파일 생성에 실패했습니다.' }, { status: 500 })
  }
  if (!content || content.length === 0) {
    return NextResponse.json({ error: '첨부파일 생성에 실패했습니다.' }, { status: 400 })
  }

  const filename = attachmentFilename.trim()
  // 디버그 체크포인트: sendWellnessMailWithAttachment() 호출 직전 — 클라이언트에서 받은 값이
  // 그대로 전달되는지 확인(개인정보 보호를 위해 html 본문 내용 자체는 길이만 기록)
  console.log('[api/wellness-mail] sendWellnessMailWithAttachment 호출 직전 →', {
    to, cc, subject, htmlLength: html.length,
    filename, byteLength: content.length, contentIsBuffer: Buffer.isBuffer(content), contentType: XLSX_CONTENT_TYPE,
  })

  const err = await sendWellnessMailWithAttachment({
    to, cc, subject, html,
    attachment: { filename, content, contentType: XLSX_CONTENT_TYPE },
  })
  if (err) {
    console.error('[api/wellness-mail] 발송 오류 →', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }
  console.log('[api/wellness-mail] 발송 완료')
  return NextResponse.json({ ok: true })
}
