import { NextRequest, NextResponse } from 'next/server'
import { fillWellnessCoinTemplate, type WellnessCoinTemplateRowInput } from '@/lib/wellness-coin'
import { hectoCoinFilename } from '@/lib/hecto-coin'

// exceljs는 Node.js 전용 파일시스템/버퍼 API를 사용 — Edge runtime에서 실행 시 오류
export const runtime = 'nodejs'

// 헥토코인 지급 엑셀은 A=고객아이디(고정값)/B=고객명/C=고객아이디/D=빈칸/E=금액 구조로
// 웰니스코인 지급 엑셀과 완전히 동일한 형식이라, 별도 템플릿 채우기 함수를 두지 않고
// lib/wellness-coin.ts의 fillWellnessCoinTemplate을 그대로 재사용한다(같은 템플릿 파일,
// 같은 스타일 보존 로직 — 복제하지 않음).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    rows?: WellnessCoinTemplateRowInput[]; settlementMonth?: string; kind?: 'first' | 'additional'
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
    // 우회 방지: 클라이언트 검증을 신뢰하지 않고 서버(fillWellnessCoinTemplate 내부)에서
    // 이름/고객아이디/지급금액 유효성과 1,000명 상한을 다시 확인한다.
    buffer = await fillWellnessCoinTemplate(rows)
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
