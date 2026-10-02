import { NextRequest, NextResponse } from 'next/server'
import { sendWellnessMailWithAttachment } from '@/lib/mail'
import { fillWellnessReclaimCoinTemplate, type WellnessReclaimEntry } from '@/lib/wellness-reclaim'

// 웰니스포인트 탭 "웰니스코인 환수" → "XLSX 첨부 메일 보내기" 전용 라우트.
// 기존 /api/wellness-mail(지급)과 완전히 분리된 별도 경로이며 그 라우트/로직은 전혀
// 건드리지 않는다. 첨부 엑셀은 화면 "웰니스코인 환수 엑셀 다운로드"(app/api/
// wellness-reclaim-coin-excel)가 쓰는 것과 완전히 동일한 고정 템플릿(lib/wellness-reclaim.ts
// fillWellnessReclaimCoinTemplate — 지급 쪽과 같은 .xlsx 템플릿 파일을 공유하되 환수 전용
// 검증으로 독립적으로 채움)으로 생성한다.
// nodemailer는 Node.js 전용(net/tls 모듈 사용) — Edge runtime에서 실행 시 500 발생
export const runtime = 'nodejs'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function POST(req: NextRequest) {
  const { to, cc, subject, html, entries, attachmentFilename } = await req.json() as {
    to: string[]; cc?: string[]; subject: string; html: string
    entries?: WellnessReclaimEntry[]; attachmentFilename?: string
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: '메일로 보낼 환수 대상자가 없습니다.' }, { status: 400 })
  }
  if (!attachmentFilename || !attachmentFilename.trim()) {
    return NextResponse.json({ error: '첨부파일명이 지정되지 않았습니다.' }, { status: 400 })
  }
  const missingCustomerId = entries.filter(e => !e.emp.customer_id?.trim())
  if (missingCustomerId.length > 0) {
    return NextResponse.json({
      error: `고객아이디가 등록되지 않은 대상자가 있습니다: ${missingCustomerId.map(e => e.emp.name).join(', ')}`,
    }, { status: 400 })
  }

  let content: Buffer
  try {
    content = await fillWellnessReclaimCoinTemplate(
      entries.map(e => ({ name: e.emp.name, customerId: e.emp.customer_id, amount: e.amount })),
    )
  } catch (err) {
    console.error('[api/wellness-reclaim-mail] xlsx 생성 실패 →', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: err instanceof Error ? err.message : '첨부파일 생성에 실패했습니다.' }, { status: 400 })
  }
  if (!content || content.length === 0) {
    return NextResponse.json({ error: '첨부파일 생성에 실패했습니다.' }, { status: 400 })
  }

  const filename = attachmentFilename.trim()
  const err = await sendWellnessMailWithAttachment({
    to, cc, subject, html,
    attachment: { filename, content, contentType: XLSX_CONTENT_TYPE },
  })
  if (err) {
    console.error('[api/wellness-reclaim-mail] 발송 오류 →', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
