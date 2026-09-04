import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import ExcelJS from 'exceljs'

// exceljs는 Node.js 전용 파일시스템/버퍼 API를 사용 — Edge runtime에서 실행 시 오류
export const runtime = 'nodejs'

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/templates/wellness-coin-template.xlsx')

type CoinRowInput = { name?: string; customerId?: string; amount?: number }

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { rows?: CoinRowInput[] } | null
  const rows = body?.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '다운로드할 대상자가 없습니다.' }, { status: 400 })
  }

  // 우회 방지: 클라이언트 검증을 신뢰하지 않고 서버에서도 동일 조건을 다시 확인한다.
  const invalid = rows.find(r =>
    !r.name?.trim() || !r.customerId?.trim() || typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount <= 0,
  )
  if (invalid) {
    return NextResponse.json({ error: '이름, 고객아이디, 지급금액이 모두 유효해야 합니다.' }, { status: 400 })
  }
  if (rows.length > 1000) {
    return NextResponse.json({ error: '한 번에 최대 1,000명까지 다운로드할 수 있습니다.' }, { status: 400 })
  }

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(TEMPLATE_PATH)
  const sheet = workbook.worksheets[0]

  rows.forEach((r, i) => {
    const rowNum = 3 + i
    sheet.getCell(`A${rowNum}`).value = '고객아이디'
    sheet.getCell(`B${rowNum}`).value = r.name!.trim()
    sheet.getCell(`C${rowNum}`).value = r.customerId!.trim()
    sheet.getCell(`D${rowNum}`).value = ''
    const amountCell = sheet.getCell(`E${rowNum}`)
    amountCell.value = r.amount!
    amountCell.numFmt = '#,##0'
  })

  const buffer = await workbook.xlsx.writeBuffer()

  const now = new Date()
  const filename = `웰니스코인_${now.getFullYear()}년_${String(now.getMonth() + 1).padStart(2, '0')}월.xlsx`
  const encodedFilename = encodeURIComponent(filename)

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="wellness-coin.xlsx"; filename*=UTF-8''${encodedFilename}`,
    },
  })
}
