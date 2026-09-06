// nodemailer v8: named import 사용 (default import가 ESM 환경에서 undefined로 평가되는 경우 방어)
import { createTransport } from 'nodemailer'

export interface MailAttachment {
  filename: string
  content: Buffer
  contentType?: string
}

export interface MailPayload {
  to: string[]
  cc?: string[]
  subject: string
  html: string
  attachments?: MailAttachment[]
}

export async function sendMail({ to, cc, subject, html, attachments }: MailPayload): Promise<string | null> {
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT ?? '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.MAIL_FROM ?? user

  if (!host || !user || !pass) {
    return 'SMTP 환경변수가 설정되지 않았습니다.'
  }

  // 첨부파일이 지정됐는데 내용이 비어있으면 첨부 없이 조용히 발송하지 말고 즉시 중단한다.
  if (attachments?.some(a => !a.content || a.content.length === 0)) {
    console.error('[sendMail] 첨부파일 content가 비어있어 발송을 중단함 →', attachments.map(a => ({ filename: a.filename, byteLength: a.content?.length ?? 0 })))
    return '첨부파일 내용이 비어있어 발송을 중단했습니다.'
  }

  // 포트에 따라 TLS 방식 자동 선택
  //   465 → secure: true  (SSL/TLS 직접 연결)
  //   587 → secure: false + requireTLS: true  (STARTTLS)
  const useSSL = port === 465

  try {
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
    // 디버그: 실제 transporter.sendMail() 호출 직전 첨부파일 상태(개인정보/엑셀 내용 없이 크기만) 기록
    if (attachments && attachments.length > 0) {
      console.log('[sendMail] 첨부파일 포함해 발송 →', attachments.map(a => ({
        filename: a.filename, byteLength: a.content.length, contentType: a.contentType ?? '(자동 감지)',
      })))
    }
    const info = await transporter.sendMail({ from, to, cc, subject, html, attachments })
    if (attachments && attachments.length > 0) {
      console.log('[sendMail] 발송 결과 →', { accepted: info.accepted, rejected: info.rejected, response: info.response })
    }
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sendMail] 오류 →', msg)
    return msg
  }
}
