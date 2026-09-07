import ExcelJS from 'exceljs'
import path from 'path'
import type { Employee } from './supabase'
import { calcEffectiveLeaveDate, calcWellnessHire, calcWellnessLeave } from './wellness-mail'

// ─── 웰니스코인 지급 엑셀(선불 관리자 거래 요청 양식) — 화면 "웰니스코인 엑셀 다운로드"
// (app/api/wellness-coin-excel)와 메일 첨부(app/api/wellness-mail)가 이 파일을 그대로
// import해서 공유한다. 절대 복제하지 말 것 — 둘이 항상 완전히 같은 파일 형식이 되어야 한다.
// 계산 로직은 새로 만들지 않고 lib/wellness-mail.ts의 기존 함수(calcWellnessHire/
// calcWellnessLeave/calcEffectiveLeaveDate)만 재사용한다 — 두 함수 모두 여기서도
// 절대 수정하지 않는다.

export type WellnessCoinRow = { emp: Employee; amount: number }
export type WellnessCoinLeaveDetail = { prePaid: number; recognized: number; reclaim: number }
export type WellnessCoinExcluded = { emp: Employee; reason: string; leaveDetail?: WellnessCoinLeaveDetail }

/**
 * 퇴사자 웰니스코인 "엑셀 반영 금액" 산정 규칙 — 회사의 퇴사자 정산 방침이 아직
 * 확정되지 않아 현재는 항상 null(계산 보류)을 반환해 퇴사자를 엑셀 대상에서 제외한다.
 * 방침이 확정되면 이 함수만 교체하면 된다 (예: recognized를 반환하도록 바꾸는 식).
 * calcWellnessLeave() 자체는 여기서도 절대 수정하지 않는다 — PointCard의 기존
 * 선지급액/인정액/환수금 화면 표시가 그대로 이 함수를 계속 사용하고 있다.
 */
export function resolveWellnessCoinLeaveAmount(emp: Employee, detail: WellnessCoinLeaveDetail): number | null {
  void emp; void detail // 방침 확정 후 아래 두 값을 사용해 반환값을 채우면 된다
  return null // TODO: 퇴사자 웰니스코인 정산 방침 확정 후 구현
}

export function buildWellnessCoinRows(
  entries: Array<{ emp: Employee; empType: 'hire' | 'leave' }>,
): { included: WellnessCoinRow[]; excluded: WellnessCoinExcluded[] } {
  const included: WellnessCoinRow[] = []
  const excluded: WellnessCoinExcluded[] = []
  for (const { emp, empType } of entries) {
    const isTransfer = emp.join_reason === '전적'
    const isLeaveType = empType === 'leave' || emp.join_reason === '휴직'
    if (isTransfer) {
      excluded.push({ emp, reason: '전적자는 웰니스코인 지급 대상이 아닙니다.' })
    } else if (isLeaveType) {
      if (!emp.join_date) {
        excluded.push({ emp, reason: '입사일이 입력되지 않아 계산할 수 없습니다.' })
        continue
      }
      const leaveDateForCalc = calcEffectiveLeaveDate(emp) ?? emp.leave_date
      if (!leaveDateForCalc) {
        excluded.push({ emp, reason: emp.join_reason === '휴직' ? '휴직시작일이 입력되지 않아 계산할 수 없습니다.' : '퇴사일이 입력되지 않아 계산할 수 없습니다.' })
        continue
      }
      const leaveDetail = calcWellnessLeave(emp.join_date, leaveDateForCalc)
      const amount = resolveWellnessCoinLeaveAmount(emp, leaveDetail)
      if (amount === null) {
        excluded.push({ emp, reason: '퇴사자 정산 기준이 아직 확정되지 않았습니다.', leaveDetail })
      } else {
        included.push({ emp, amount })
      }
    } else if (!emp.join_date) {
      excluded.push({ emp, reason: '입사일(복귀일)이 입력되지 않아 계산할 수 없습니다.' })
    } else {
      included.push({ emp, amount: calcWellnessHire(emp.join_date) })
    }
  }
  return { included, excluded }
}

export function wellnessCoinFilename(d: Date = new Date()): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `웰니스코인_${yyyy}년_${mm}월.xlsx`
}

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/templates/wellness-coin-template.xlsx')

export type WellnessCoinTemplateRowInput = { name?: string; customerId?: string; amount?: number }

/**
 * 고정 템플릿(lib/templates/wellness-coin-template.xlsx — 상단 ※ 도움말, 병합셀, 스타일,
 * 열 너비, 행 높이 그대로 유지)에 3행부터 행을 채워 Buffer로 반환한다. 화면 "웰니스코인
 * 엑셀 다운로드"(app/api/wellness-coin-excel)와 메일 첨부(app/api/wellness-mail)가
 * 이 함수 하나를 그대로 공유 — 둘이 항상 완전히 같은 파일 형식이 되도록 보장한다.
 * 헤더 순서: A=고객 구분값(고정값 '고객아이디') / B=고객명 / C=고객아이디 / D=휴대폰번호
 * (항상 공란) / E=금액.
 */
export async function fillWellnessCoinTemplate(rows: WellnessCoinTemplateRowInput[]): Promise<Buffer> {
  if (rows.length === 0) throw new Error('다운로드할 대상자가 없습니다.')
  const invalid = rows.find(r =>
    !r.name?.trim() || !r.customerId?.trim() || typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount <= 0,
  )
  if (invalid) throw new Error('이름, 고객아이디, 지급금액이 모두 유효해야 합니다.')
  if (rows.length > 1000) throw new Error('한 번에 최대 1,000명까지 처리할 수 있습니다.')

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

  const raw = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)
}
