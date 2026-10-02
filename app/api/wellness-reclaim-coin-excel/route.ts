import { NextRequest, NextResponse } from 'next/server'
import { fillWellnessReclaimCoinTemplate, type WellnessReclaimCoinTemplateRowInput } from '@/lib/wellness-reclaim'

// 웰니스포인트 탭 "웰니스코인 환수" → "웰니스코인 환수 엑셀 다운로드" 전용 라우트.
// 기존 /api/wellness-coin-excel(지급)과 완전히 분리된 별도 경로이며 그 라우트/로직은
// 전혀 건드리지 않는다. 체크한 직원만 포함된 엑셀을 지급 쪽과 동일한 고정 템플릿으로
// 생성한다(lib/wellness-reclaim.ts fillWellnessReclaimCoinTemplate).
// exceljs는 Node.js 전용 파일시스템/버퍼 API를 사용 — Edge runtime에서 실행 시 오류
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { rows?: WellnessReclaimCoinTemplateRowInput[] } | null
  const rows = body?.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '다운로드할 대상자가 없습니다.' }, { status: 400 })
  }

  let buffer: Buffer
  try {
    // 우회 방지: 클라이언트 검증을 신뢰하지 않고 서버(fillWellnessReclaimCoinTemplate 내부)에서
    // 이름/고객아이디/환수금액 유효성과 1,000명 상한을 다시 확인한다.
    buffer = await fillWellnessReclaimCoinTemplate(rows)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '엑셀 생성에 실패했습니다.' }, { status: 400 })
  }

  const now = new Date()
  const filename = `웰니스코인_환수_${now.getFullYear()}년_${String(now.getMonth() + 1).padStart(2, '0')}월.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="wellness-reclaim-coin.xlsx"; filename*=UTF-8''${encodedFilename}`,
    },
  })
}
