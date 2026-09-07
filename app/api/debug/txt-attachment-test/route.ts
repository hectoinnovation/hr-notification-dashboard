import { NextRequest, NextResponse } from 'next/server'
import { sendWellnessMailWithAttachment } from '@/lib/mail'

// 임시 진단 전용 — 웰니스 XLSX 첨부가 계속 누락되는 문제에서 XLSX/파일명 자체를 용의선상에서
// 제외하기 위해, 동일한 SMTP transporter/인증/from/발송 경로(sendWellnessMailWithAttachment,
// lib/mail.ts — XLSX 관련 코드는 전혀 건드리지 않음)로 아주 작은 .txt 첨부 1개만 보내본다.
// 원인 확인 후 이 라우트는 삭제한다.
//
// proxy.ts의 PUBLIC_PATHS에 포함하지 않았으므로 기존 세션 로그인(hr-session)이 있어야만
// 호출 가능 — 다른 대시보드 API와 동일한 보호를 그대로 상속받는다. 임의 공개 발송
// endpoint가 아니다. 수신자는 호출자가 지정한 to로만 발송(하드코딩 없음).
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const { to, cc } = await req.json() as { to?: string; cc?: string[] }

  if (!to || !to.trim()) {
    return NextResponse.json({ error: 'to(수신자)를 지정해주세요.' }, { status: 400 })
  }

  const err = await sendWellnessMailWithAttachment({
    to: [to.trim()],
    cc,
    subject: '[첨부 진단] TXT attachment test',
    html: '<div>SMTP 경로에서 첨부파일 자체가 전달되는지 확인하는 진단 메일입니다.</div>',
    attachment: {
      filename: 'test.txt',
      content: Buffer.from('attachment test', 'utf8'),
      contentType: 'text/plain; charset=utf-8',
    },
  })
  if (err) {
    return NextResponse.json({ error: err }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
