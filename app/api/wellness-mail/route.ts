import { NextRequest, NextResponse } from 'next/server'
import { sendMail } from '@/lib/mail'

// 웰니스포인트 탭 "메일 보내기" 전용 라우트 — 사용자가 버튼을 직접 눌렀을 때만 호출된다.
// scheduled_mails / cron / 온보딩 자동메일과는 완전히 분리되어 있으며, 기존 /api/send-mail
// 라우트도 건드리지 않는다. lib/mail.ts의 sendMail()만 공유(같은 SMTP 설정 재사용).
// nodemailer는 Node.js 전용 (net/tls 모듈 사용) — Edge runtime에서 실행 시 500 발생
export const runtime = 'nodejs'

// 엑셀(.xlsx) 고정 MIME 타입 — nodemailer의 파일명 기반 자동 감지에 의존하지 않고 명시적으로 지정
const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export async function POST(req: NextRequest) {
  const { to, cc, subject, html, attachmentBase64, attachmentFilename } = await req.json() as {
    to: string[]; cc?: string[]; subject: string; html: string
    attachmentBase64?: string; attachmentFilename?: string
  }

  if (!attachmentBase64 || !attachmentFilename) {
    return NextResponse.json({ error: '첨부파일이 준비되지 않았습니다.' }, { status: 400 })
  }

  let content: Buffer
  try {
    content = Buffer.from(attachmentBase64, 'base64')
    if (content.length === 0) throw new Error('빈 첨부파일')
  } catch {
    return NextResponse.json({ error: '첨부파일 생성에 실패했습니다.' }, { status: 400 })
  }

  const attachments = [{ filename: attachmentFilename, content, contentType: XLSX_CONTENT_TYPE }]
  // 디버그 체크포인트 1/2: 라우트에서 sendMail() 호출 직전 — 개인정보/엑셀 실제 내용은 남기지 않음
  console.log('[api/wellness-mail] sendMail 호출 직전 →', {
    to, cc, subject,
    attachmentCount: attachments.length,
    filename: attachments[0].filename,
    byteLength: attachments[0].content.length,
    contentType: attachments[0].contentType,
  })
  const err = await sendMail({ to, cc, subject, html, attachments })
  if (err) {
    console.error('[api/wellness-mail] sendMail 오류 →', err)
    return NextResponse.json({ error: err }, { status: 500 })
  }
  console.log('[api/wellness-mail] 발송 완료')
  return NextResponse.json({ ok: true })
}
