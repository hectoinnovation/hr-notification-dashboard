// nodemailer v8: named import 사용 (default import가 ESM 환경에서 undefined로 평가되는 경우 방어)
import { createTransport, type Transporter } from 'nodemailer'
import type SMTPTransport from 'nodemailer/lib/smtp-transport'

// smtp.worksmobile.com(네이버웍스) 등 일부 서버는 SNI 없이 연결 거부 — servername 명시 필요.
// sendMail()/sendWellnessMailWithAttachment() 둘 다 동일한 SMTP 설정을 공유(중복 방지).
function createSmtpTransporter(): { transporter: Transporter<SMTPTransport.SentMessageInfo>; from: string } | { error: string } {
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT ?? '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!host || !user || !pass) {
    return { error: 'SMTP 환경변수가 설정되지 않았습니다.' }
  }
  const from = process.env.MAIL_FROM ?? user

  // 포트에 따라 TLS 방식 자동 선택
  //   465 → secure: true  (SSL/TLS 직접 연결)
  //   587 → secure: false + requireTLS: true  (STARTTLS)
  const useSSL = port === 465
  const transporter = createTransport({
    host,
    port,
    secure: useSSL,
    ...(useSSL ? {} : { requireTLS: true }),
    auth: { user, pass },
    tls: {
      // SNI 명시 — 네이버웍스(smtp.worksmobile.com) 등 일부 서버는 SNI 없이 연결 거부
      servername: host,
    },
  })
  return { transporter, from }
}

export interface MailPayload {
  to: string[]
  cc?: string[]
  subject: string
  html: string
}

/**
 * 자동메일/온보딩 메일/기존 /api/send-mail 전용 — 첨부파일 개념 없는 원래 형태 그대로 유지.
 * 웰니스 수동 첨부메일은 아래 sendWellnessMailWithAttachment()로 완전히 분리했다.
 */
export async function sendMail({ to, cc, subject, html }: MailPayload): Promise<string | null> {
  const t = createSmtpTransporter()
  if ('error' in t) return t.error
  try {
    await t.transporter.sendMail({ from: t.from, to, cc, subject, html })
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sendMail] 오류 →', msg)
    return msg
  }
}

export interface WellnessMailAttachment {
  filename: string
  content: Buffer
  contentType: string
}

export interface WellnessMailPayload {
  to: string[]
  cc?: string[]
  subject: string
  html: string
  attachment: WellnessMailAttachment
}

/**
 * 웰니스포인트 탭 "메일 보내기"(수동 즉시 발송) 전용 — 첨부파일이 있는 메일만 이 함수를 쓴다.
 * 기존 sendMail()(자동메일/온보딩 메일/scheduled_mails 경로)과 완전히 분리되어 있어
 * 이 함수를 아무리 바꿔도 자동메일 쪽에는 영향이 없다. transporter.sendMail()에 전달하는
 * attachments 객체 필드(filename/content/contentType/contentDisposition)를 전부 명시적으로
 * 지정 — cid, encoding 등 불필요한 옵션은 사용하지 않는다.
 */
export async function sendWellnessMailWithAttachment(
  { to, cc, subject, html, attachment }: WellnessMailPayload,
): Promise<string | null> {
  if (!attachment.content || attachment.content.length === 0) {
    console.error('[sendWellnessMailWithAttachment] 첨부파일 content가 비어있어 발송을 중단함 →', {
      filename: attachment.filename, byteLength: attachment.content?.length ?? 0,
    })
    return '첨부파일 내용이 비어있어 발송을 중단했습니다.'
  }

  const t = createSmtpTransporter()
  if ('error' in t) return t.error

  // 디버그 체크포인트: transporter.sendMail() 호출 직전 첨부파일 상태(개인정보/엑셀 내용 없이 크기만)
  console.log('[sendWellnessMailWithAttachment] transporter.sendMail 호출 직전 →', {
    attachmentCount: 1,
    filename: attachment.filename,
    byteLength: attachment.content.length,
    contentType: attachment.contentType,
  })

  try {
    const info = await t.transporter.sendMail({
      from: t.from, to, cc, subject, html,
      attachments: [{
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
        contentDisposition: 'attachment',
      }],
    })
    console.log('[sendWellnessMailWithAttachment] 발송 결과 →', {
      accepted: info.accepted, rejected: info.rejected, response: info.response,
    })
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sendWellnessMailWithAttachment] 오류 →', msg)
    return msg
  }
}
