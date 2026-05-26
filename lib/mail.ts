// nodemailer v8: named import 사용 (default import가 ESM 환경에서 undefined로 평가되는 경우 방어)
import { createTransport } from 'nodemailer'

export interface MailPayload {
  to: string[]
  cc?: string[]
  subject: string
  html: string
}

export async function sendMail({ to, cc, subject, html }: MailPayload): Promise<string | null> {
  const host = process.env.SMTP_HOST
  const port = parseInt(process.env.SMTP_PORT ?? '587')
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.MAIL_FROM ?? user

  if (!host || !user || !pass) {
    return 'SMTP 환경변수가 설정되지 않았습니다.'
  }

  // createTransport 생성부터 try-catch 안에 포함
  // 기존: createTransport가 try 바깥 → 예외 발생 시 unhandled exception → plain 500 (JSON 없음)
  // 수정: 전체를 try-catch로 감싸 → 에러 문자열 반환 → route가 { error } JSON 500으로 응답
  try {
    const transporter = createTransport({
      host,
      port,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
    })
    await transporter.sendMail({ from, to, cc, subject, html })
    return null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[sendMail] 오류 →', msg)
    return msg
  }
}
