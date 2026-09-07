import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { sendWellnessMailWithAttachment } from '@/lib/mail'
import { buildXlsxWorkbook } from '@/lib/wellness-mail'

// 임시 진단 전용 — 웰니스 XLSX 첨부가 계속 누락되는 문제의 원인을 좁히기 위한 라우트.
// TXT 첨부(variant 미지정 시 기본값, 이미 실제 수신 성공 확인됨)와 소형 XLSX 첨부를
// 완전히 동일한 발송 경로(sendWellnessMailWithAttachment, lib/mail.ts)로 보내 비교한다.
// 두 variant 모두 /api/wellness-mail과 100% 같은 함수를 호출 — transporter/mailOptions/
// contentDisposition 등 발송 코드는 이미 하나로 통일되어 있어 여기서 새로 만들지 않는다.
// XLSX 관련 계산/row builder(lib/wellness-mail.ts)는 buildXlsxWorkbook만 재사용하고
// 수정하지 않는다. 원인 확인 후 이 라우트는 삭제한다.
//
// proxy.ts의 PUBLIC_PATHS에 포함하지 않았으므로 기존 세션 로그인(hr-session)이 있어야만
// 호출 가능 — 다른 대시보드 API와 동일한 보호를 그대로 상속받는다. 임의 공개 발송
// endpoint가 아니다. 수신자는 호출자가 지정한 to로만 발송(하드코딩 없음).
export const runtime = 'nodejs'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type Variant = 'txt' | 'xlsx-small'

function buildAttachment(variant: Variant): { filename: string; content: Buffer; contentType: string } {
  if (variant === 'xlsx-small') {
    // 실제 웰니스 데이터/계산과 무관한 최소 1행짜리 xlsx — "XLSX라는 형식/확장자 자체" 문제인지
    // 격리하기 위한 것이라 buildWellnessExcelRows는 쓰지 않는다(계산 로직 변경 아님).
    const wb = buildXlsxWorkbook([{ 이름: '테스트', 금액: '10,000원' }], '정산내역')
    const content = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
    return { filename: 'wellness_settlement_test.xlsx', content, contentType: XLSX_CONTENT_TYPE }
  }
  return { filename: 'test.txt', content: Buffer.from('attachment test', 'utf8'), contentType: 'text/plain; charset=utf-8' }
}

export async function POST(req: NextRequest) {
  const { to, cc, variant } = await req.json() as { to?: string; cc?: string[]; variant?: Variant }

  if (!to || !to.trim()) {
    return NextResponse.json({ error: 'to(수신자)를 지정해주세요.' }, { status: 400 })
  }
  const v: Variant = variant === 'xlsx-small' ? 'xlsx-small' : 'txt'
  const attachment = buildAttachment(v)

  const err = await sendWellnessMailWithAttachment({
    to: [to.trim()],
    cc,
    subject: `[첨부 진단] ${v} attachment test`,
    html: '<div>SMTP 경로에서 첨부파일 자체가 전달되는지 확인하는 진단 메일입니다.</div>',
    attachment,
  })
  if (err) {
    return NextResponse.json({ error: err }, { status: 500 })
  }
  return NextResponse.json({ ok: true, variant: v, filename: attachment.filename, byteLength: attachment.content.length })
}
