import nodemailer from 'nodemailer'

export interface MailPayload {
  to: string[]
  subject: string
  html: string
}

export async function sendMail({ to, subject, html }: MailPayload): Promise<string | null> {
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT ?? '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.MAIL_FROM ?? user

  if (!host || !user || !pass) {
    return 'SMTP 환경변수가 설정되지 않았습니다.'
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
  })

  try {
    await transporter.sendMail({ from, to, subject, html })
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}
