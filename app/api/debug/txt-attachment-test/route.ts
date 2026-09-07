import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendWellnessMailWithAttachment } from '@/lib/mail'
import {
  buildWellnessMailXlsxBuffer, buildWellnessExcelRows, wellnessMailAttachmentFilename,
  type WellnessMailEntryInput,
} from '@/lib/wellness-mail'

// 임시 진단 전용 — 웰니스 XLSX 첨부가 계속 누락되는 문제의 원인을 좁히기 위한 라우트.
// 세 variant를 완전히 동일한 발송 경로(sendWellnessMailWithAttachment, lib/mail.ts)로 보내
// 비교한다. 원인 확인 후 이 라우트는 삭제한다.
// - txt(기본값): 이미 실제 수신 성공 확인됨
// - xlsx-small: 최소 1행짜리 테스트 xlsx, 실제 수신 성공 확인됨
// - xlsx-wellness-real: 실제 웰니스 업체 제출용 XLSX Buffer(16개 컬럼 전체, 데이터/순서/값
//   변경 없음) 그대로를 이 성공한 발송 경로로 보낸다. /api/wellness-mail의 XLSX 생성
//   코드(buildWellnessExcelRows + buildWellnessMailXlsxBuffer)를 그대로 재사용 — 새 계산/새
//   워크북 로직 없음. 대상자는 화면 체크 선택 대신 현재 웰니스 대상자 전체(app/page.tsx의
//   newHires/departures/onLeave 구성과 동일한 필터)를 서버에서 직접 조회해 사용한다.
//
// proxy.ts의 PUBLIC_PATHS에 포함하지 않았으므로 기존 세션 로그인(hr-session)이 있어야만
// 호출 가능 — 다른 대시보드 API와 동일한 보호를 그대로 상속받는다. 임의 공개 발송
// endpoint가 아니다. 수신자는 호출자가 지정한 to로만 발송(하드코딩 없음).
export const runtime = 'nodejs'

const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

type Variant = 'txt' | 'xlsx-small' | 'xlsx-wellness-real'

async function buildRealWellnessEntries(): Promise<WellnessMailEntryInput[]> {
  const { data, error } = await supabase.from('employees').select('*')
  if (error) throw new Error(error.message)
  const employees = data ?? []
  // app/page.tsx의 newHires/onLeave/departures + allWellness 구성과 동일한 필터(읽기 전용, 재사용)
  const newHires   = employees.filter(e => e.status === 'active' && e.join_reason !== '휴직')
  const onLeave    = employees.filter(e => e.status === 'active' && e.join_reason === '휴직')
  const departures = employees.filter(e => e.status === 'resigned')
  return [
    ...newHires.map(e   => ({ emp: e, empType: 'hire' as const, mailKey: `hire_wellness_${e.id}`, isTransfer: e.join_reason === '전적' })),
    ...departures.map(e => ({ emp: e, empType: 'leave' as const, mailKey: `leave_wellness_${e.id}`, isTransfer: false })),
    ...onLeave.map(e    => ({ emp: e, empType: 'leave' as const, mailKey: `leave_wellness_${e.id}`, isTransfer: false })),
  ]
}

async function buildAttachment(variant: Variant): Promise<{ filename: string; content: Buffer; contentType: string }> {
  if (variant === 'xlsx-wellness-real') {
    // /api/wellness-mail과 완전히 동일한 생성 코드 — 컬럼/순서/값 변경 없음(16개 컬럼 전체)
    const entries = await buildRealWellnessEntries()
    const rows = buildWellnessExcelRows(entries, {})
    const content = buildWellnessMailXlsxBuffer(rows)
    return { filename: wellnessMailAttachmentFilename(new Date()), content, contentType: XLSX_CONTENT_TYPE }
  }
  if (variant === 'xlsx-small') {
    // 실제 웰니스 데이터/계산과 무관한 최소 1행짜리 xlsx — /api/wellness-mail과 동일한
    // buildWellnessMailXlsxBuffer()를 그대로 호출한다.
    const content = buildWellnessMailXlsxBuffer([{ 이름: '테스트', 금액: '10,000원' }])
    return { filename: 'wellness_settlement_test.xlsx', content, contentType: XLSX_CONTENT_TYPE }
  }
  return { filename: 'test.txt', content: Buffer.from('attachment test', 'utf8'), contentType: 'text/plain; charset=utf-8' }
}

export async function POST(req: NextRequest) {
  const { to, cc, variant } = await req.json() as { to?: string; cc?: string[]; variant?: Variant }

  if (!to || !to.trim()) {
    return NextResponse.json({ error: 'to(수신자)를 지정해주세요.' }, { status: 400 })
  }
  const v: Variant = variant === 'xlsx-small' || variant === 'xlsx-wellness-real' ? variant : 'txt'

  let attachment: { filename: string; content: Buffer; contentType: string }
  try {
    attachment = await buildAttachment(v)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '첨부파일 생성에 실패했습니다.' }, { status: 500 })
  }

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
