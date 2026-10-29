import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { hectoCoinDetailFilename, type HectoCoinDetailRow, type HectoCoinDetailSummary } from '@/lib/hecto-coin'

// exceljs는 Node.js 전용 파일시스템/버퍼 API를 사용 — Edge runtime에서 실행 시 오류
export const runtime = 'nodejs'

// 지급용 엑셀(fillWellnessCoinTemplate)과 달리 고정 템플릿이 없는 새 workbook을
// 만든다 — "실제 지급 시스템 업로드용"이 아니라 "월 전체 정산 내역 검토/보관용"이라
// 화면에 보이는 행(고객아이디 미매칭/동명이인/휴직 등 포함) 전부를 담고, 스타일도
// 기본 서식(헤더 bold+배경, freeze pane, autofilter, 숫자 천단위)만 적용한다.
// 지급용 엑셀 로직/템플릿은 이 라우트가 전혀 건드리지 않는다.
//
// 2026-10부터 1차/추가 2단계 지급이 없어져 "최종 포인트"/"최종 지급액" 하나만 남았다
// (lib/hecto-coin.ts HectoCoinDetailRow 참고) — 2026-09까지의 과거 정산월을 이 엑셀로
// 다시 내려받아도 1차/추가 세부 breakdown 컬럼은 더 이상 나오지 않고, 이미 두 단계가
// 합산된 최종 지급액(finalAmount = 기존 totalAmount)만 보인다.

const NUM_FMT = '#,##0'
const HEADER_FILL: { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } } = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF0' },
}

const DETAIL_HEADERS = [
  '이름', '고객아이디', '입사일', '퇴사일', '휴직일', '복귀일', '월 누적 걸음수', '지급대상 일수',
  '지급 상한', '최종 포인트', '최종 지급액', '상태',
  '지급액 수동수정 여부', '자동 계산액', '포인트 데이터 수동입력 여부',
] as const
const DETAIL_COL_WIDTHS = [12, 24, 12, 12, 12, 12, 14, 12, 12, 12, 12, 30, 18, 14, 18]
// 천 단위 쉼표(#,##0)를 적용할 컬럼 번호(1-based) — 월누적걸음수/지급대상일수/지급상한/
// 최종포인트/최종지급액/자동계산액
const NUMERIC_COLS = [7, 8, 9, 10, 11, 14]

function numOrDash(v: number | null): number | string {
  return v ?? '-'
}
/** 2026-09까지의 과거 정산월에서 최종 파일 자체에 이 사람이 없는 경우
 *  (pointsMatchStatus==='first_only') 화면과 동일하게 '미정산' 표시 — 2026-10부터는
 *  구조적으로 발생하지 않는 상태다(1차 파일 자체가 없어 first_only가 생길 수 없음). */
function pointsOrDash(v: number | null, pointsMatchStatus: string): number | string {
  if (v != null) return v
  return pointsMatchStatus === 'first_only' ? '미정산' : '-'
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as {
    settlementMonth?: string; summary?: HectoCoinDetailSummary; rows?: HectoCoinDetailRow[]
  } | null
  const settlementMonth = body?.settlementMonth
  const summary = body?.summary
  const rows = body?.rows
  if (!settlementMonth || !summary || !Array.isArray(rows)) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: '다운로드할 정산 데이터가 없습니다.' }, { status: 400 })
  }

  const workbook = new ExcelJS.Workbook()

  // ── Sheet 1: 정산요약 ──────────────────────────────────────────────────────
  const summarySheet = workbook.addWorksheet('정산요약')
  summarySheet.columns = [{ width: 28 }, { width: 20 }]
  summarySheet.getCell('A1').value = `헥토코인 정산 요약 (${summary.settlementMonth})`
  summarySheet.getCell('A1').font = { bold: true, size: 14 }
  summarySheet.mergeCells('A1:B1')

  const summaryRows: Array<[string, number | string]> = [
    ['정산월', summary.settlementMonth],
    ['최종 지급 대상 인원', summary.finalCount],
    ['최종 지급 총액', summary.finalTotal],
    ['고객아이디 매칭 완료 인원', summary.customerIdMatchedCount],
    ['고객아이디 미매칭 인원', summary.customerIdUnmatchedCount],
    ['정산 제외 인원', summary.excludedCount],
  ]
  summaryRows.forEach(([label, value], i) => {
    const r = i + 3
    const labelCell = summarySheet.getCell(`A${r}`)
    labelCell.value = label
    labelCell.font = { bold: true }
    const valueCell = summarySheet.getCell(`B${r}`)
    valueCell.value = value
    if (typeof value === 'number') valueCell.numFmt = NUM_FMT
  })

  // ── Sheet 2: 정산상세 ──────────────────────────────────────────────────────
  const detailSheet = workbook.addWorksheet('정산상세')
  detailSheet.columns = DETAIL_COL_WIDTHS.map(width => ({ width }))

  const headerRow = detailSheet.getRow(1)
  DETAIL_HEADERS.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = { bold: true }
    cell.fill = HEADER_FILL
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } } }
  })
  headerRow.commit()
  detailSheet.views = [{ state: 'frozen', ySplit: 1 }]
  detailSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: DETAIL_HEADERS.length } }

  rows.forEach((r, i) => {
    const row = detailSheet.getRow(i + 2)
    row.getCell(1).value = r.name
    row.getCell(2).value = r.customerId ?? '-'
    row.getCell(3).value = r.displayJoinDate ?? '-'
    row.getCell(4).value = r.displayExitDate ?? '-'
    row.getCell(5).value = r.displayLeaveDate ?? '-'
    row.getCell(6).value = r.displayReturnDate ?? '-'
    row.getCell(7).value = numOrDash(r.steps)
    row.getCell(8).value = numOrDash(r.payableDays)
    row.getCell(9).value = numOrDash(r.payCap)
    row.getCell(10).value = pointsOrDash(r.finalPoints, r.pointsMatchStatus)
    row.getCell(11).value = numOrDash(r.finalAmount)
    row.getCell(12).value = r.statusText
    row.getCell(13).value = r.finalOverrideAmount != null ? 'Y' : 'N'
    row.getCell(14).value = numOrDash(r.finalAutoAmount)
    row.getCell(15).value = r.finalDataIsManual ? 'Y' : 'N'
    NUMERIC_COLS.forEach(c => {
      const cell = row.getCell(c)
      if (typeof cell.value === 'number') cell.numFmt = NUM_FMT
    })
    row.commit()
  })

  const raw = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)

  const filename = hectoCoinDetailFilename(settlementMonth)
  const encodedFilename = encodeURIComponent(filename)

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="hecto-coin-detail.xlsx"; filename*=UTF-8''${encodedFilename}`,
    },
  })
}
