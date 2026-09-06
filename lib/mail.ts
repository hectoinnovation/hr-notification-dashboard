// nodemailer v8: named import 사용 (default import가 ESM 환경에서 undefined로 평가되는 경우 방어)
import { createTransport } from 'nodemailer'

export interface MailAttachment {
  filename: string
  content: Buffer
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
    await transporter.sendMail({ from, to, cc, subject, html, attachments })
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sendMail] 오류 →', msg)
    return msg
  }
}
