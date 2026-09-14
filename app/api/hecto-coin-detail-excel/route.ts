import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { hectoCoinDetailFilename, type HectoCoinDetailRow, type HectoCoinDetailSummary } from '@/lib/hecto-coin'

// exceljs는 Node.js 전용 파일시스템/버퍼 API를 사용 — Edge runtime에서 실행 시 오류
export const runtime = 'nodejs'

// 지급용 엑셀(1차/추가, fillWellnessCoinTemplate)과 달리 고정 템플릿이 없는 새
// workbook을 만든다 — "실제 지급 시스템 업로드용"이 아니라 "월 전체 정산 내역
// 검토/보관용"이라 화면에 보이는 행(고객아이디 미매칭/동명이인/휴직 등 포함) 전부를
// 담고, 스타일도 기본 서식(헤더 bold+배경, freeze pane, autofilter, 숫자 천단위)만
// 적용한다. 지급용 엑셀 로직/템플릿은 이 라우트가 전혀 건드리지 않는다.

const NUM_FMT = '#,##0'
const HEADER_FILL: { type: 'pattern'; pattern: 'solid'; fgColor: { argb: string } } = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF0' },
}

const DETAIL_HEADERS = [
  '이름', '고객아이디', '입사일', '퇴사일', '휴직일', '복귀일', '월 누적 걸음수', '지급대상 일수',
  '지급 상한', '1차 포인트', '1차 지급액', '최종 포인트', '추가 지급액', '월 최종 지급액', '상태',
  '1차 지급 수동수정 여부', '1차 자동 계산액', '추가 지급 수동수정 여부', '추가 자동 계산액',
  '1차 데이터 수동입력 여부', '최종 데이터 수동입력 여부',
] as const
const DETAIL_COL_WIDTHS = [12, 24, 12, 12, 12, 12, 14, 12, 12, 12, 12, 12, 12, 14, 30, 18, 14, 18, 14, 18, 18]
// 천 단위 쉼표(#,##0)를 적용할 컬럼 번호(1-based) — 월누적걸음수/지급대상일수/지급상한/
// 1차포인트/1차지급액/최종포인트/추가지급액/월최종지급액/1차자동계산액/추가자동계산액
const NUMERIC_COLS = [7, 8, 9, 10, 11, 12, 13, 14, 17, 19]

function numOrDash(v: number | null): number | string {
  return v ?? '-'
}
/** 최종 파일 미업로드 상태(pointsMatchStatus==='first_only')면 화면과 동일하게 '미정산' 표시 */
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
    ['1차 지급 대상 인원', summary.firstCount],
    ['1차 지급 총액', summary.firstTotal],
    ['추가 지급 대상 인원', summary.additionalCount],
    ['추가 지급 총액', summary.additionalTotal],
    ['월 최종 지급 총액', summary.finalTotal],
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
    row.getCell(10).value = numOrDash(r.firstPoints)
    row.getCell(11).value = numOrDash(r.firstAmount)
    row.getCell(12).value = pointsOrDash(r.finalPoints, r.pointsMatchStatus)
    row.getCell(13).value = pointsOrDash(r.additionalAmount, r.pointsMatchStatus)
    row.getCell(14).value = numOrDash(r.totalAmount)
    row.getCell(15).value = r.statusText
    row.getCell(16).value = r.firstOverrideAmount != null ? 'Y' : 'N'
    row.getCell(17).value = numOrDash(r.firstAutoAmount)
    row.getCell(18).value = r.additionalOverrideAmount != null ? 'Y' : 'N'
    row.getCell(19).value = numOrDash(r.additionalAutoAmount)
    row.getCell(20).value = r.firstDataIsManual ? 'Y' : 'N'
    row.getCell(21).value = r.finalDataIsManual ? 'Y' : 'N'
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
