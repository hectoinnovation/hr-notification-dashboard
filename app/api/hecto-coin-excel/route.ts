import { NextRequest, NextResponse } from 'next/server'
import { fillHectoCoinTemplate, hectoCoinFilename, type HectoCoinPayoutRow } from '@/lib/hecto-coin'

// exceljs는 Node.js 전용 파일시스템/버퍼 API를 사용 — Edge runtime에서 실행 시 오류
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    rows?: HectoCoinPayoutRow[]; settlementMonth?: string; kind?: 'first' | 'additional'
  } | null
  const rows = body?.rows
  const settlementMonth = body?.settlementMonth
  const kind = body?.kind
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '다운로드할 대상자가 없습니다.' }, { status: 400 })
  }
  if (!settlementMonth || (kind !== 'first' && kind !== 'additional')) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  let buffer: Buffer
  try {
    // 우회 방지: 클라이언트 검증을 신뢰하지 않고 서버(fillHectoCoinTemplate 내부)에서
    // 이름/지급금액 유효성과 1,000명 상한을 다시 확인한다.
    buffer = await fillHectoCoinTemplate(rows)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '엑셀 생성에 실패했습니다.' }, { status: 400 })
  }

  const filename = hectoCoinFilename(settlementMonth, kind)
  const encodedFilename = encodeURIComponent(filename)

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="hecto-coin.xlsx"; filename*=UTF-8''${encodedFilename}`,
    },
  })
}
