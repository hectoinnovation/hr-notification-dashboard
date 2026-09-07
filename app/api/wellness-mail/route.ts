import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sendWellnessMailWithAttachment } from '@/lib/mail'
import { buildWellnessExcelRows, buildXlsxWorkbook, type WellnessMailEntryInput } from '@/lib/wellness-mail'

// 웰니스포인트 탭 "메일 보내기" 전용 라우트 — 사용자가 버튼을 직접 눌렀을 때만 호출된다.
// scheduled_mails / cron / 온보딩 자동메일과는 완전히 분리되어 있으며, 기존 /api/send-mail
// 라우트도 건드리지 않는다. sendWellnessMailWithAttachment()(lib/mail.ts)만 공유.
//
// xlsx는 클라이언트에서 base64로 인코딩해 보내지 않는다 — 브라우저 번들 xlsx가 base64를
// 만드는 경로 자체를 제거하기 위해, 화면에서 체크한 entries(원본 데이터)만 전달받아
// 여기(Node 서버)에서 @/lib/wellness-mail의 buildWellnessExcelRows()를 그대로 호출해
// XLSX Buffer를 직접 생성한다. 화면 엑셀 다운로드가 쓰는 것과 완전히 동일한 함수라 계산
// 결과가 항상 일치한다.
// nodemailer는 Node.js 전용 (net/tls 모듈 사용) — Edge runtime에서 실행 시 500 발생
export const runtime = 'nodejs'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function POST(req: NextRequest) {
  const { to, cc, subject, html, entries, sentKeys, attachmentFilename } = await req.json() as {
    to: string[]; cc?: string[]; subject: string; html: string
    entries?: WellnessMailEntryInput[]; sentKeys?: string[]; attachmentFilename?: string
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: '메일로 보낼 대상자가 없습니다.' }, { status: 400 })
  }
  if (!attachmentFilename || !attachmentFilename.trim()) {
    return NextResponse.json({ error: '첨부파일명이 지정되지 않았습니다.' }, { status: 400 })
  }

  const sentMap = Object.fromEntries((sentKeys ?? []).map(k => [k, true]))
  const rows = buildWellnessExcelRows(entries, sentMap)
  if (rows.length === 0) {
    return NextResponse.json({ error: '첨부파일 생성에 실패했습니다.' }, { status: 400 })
  }

  let content: Buffer
  try {
    content = XLSX.write(buildXlsxWorkbook(rows, '정산내역'), { type: 'buffer', bookType: 'xlsx' }) as Buffer
  } catch (err) {
    console.error('[api/wellness-mail] xlsx 생성 실패 →', err instanceof Error ? err.message : String(err))
    return NextResponse.json({ error: '첨부파일 생성에 실패했습니다.' }, { status: 500 })
  }
  if (!content || content.length === 0) {
    return NextResponse.json({ error: '첨부파일 생성에 실패했습니다.' }, { status: 400 })
  }

  const filename = attachmentFilename.trim()
  // 디버그 체크포인트: sendWellnessMailWithAttachment() 호출 직전 — 개인정보/엑셀 내용은 남기지 않음
  console.log('[api/wellness-mail] sendWellnessMailWithAttachment 호출 직전 →', {
    filename, byteLength: content.length, contentType: XLSX_CONTENT_TYPE,
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
