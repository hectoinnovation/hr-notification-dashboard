import ExcelJS from 'exceljs'
import path from 'path'
import type { Employee } from './supabase'
import { calcEffectiveLeaveDate, calcWellnessLeave } from './wellness-mail'

// ─── 웰니스코인 환수 — 기존 웰니스코인 지급 기능(lib/wellness-mail.ts, lib/wellness-coin.ts)과
// 완전히 분리된 별도 기능이지만, 환수금액 자체는 "새로 계산"하지 않고 지급 탭이 이미
// 쓰고 있는 calcWellnessLeave()의 환수금(reclaim) 값을 그대로 가져다 쓴다(요청 사양:
// "환수금액의 기준은 오직 기존 웰니스 일할계산 결과의 환수금액"). calcWellnessLeave/
// calcEffectiveLeaveDate 둘 다 여기서 절대 수정하지 않는다 — 지급 탭(PointCard)의
// 선지급액/인정액/환수금 화면 표시가 그대로 이 두 함수를 계속 쓰고 있다.
//
// 환수 대상은 "업로드한 엑셀과의 이름 매칭"으로 정하지 않는다 — employees 테이블의
// 퇴사자(status==='resigned') 전체를 항상 화면에 보여주고, 사용자가 직접 체크한
// 사람만 메일/엑셀 대상이 된다. 별도 업로드 파일이나 매칭 로직은 이 파일에 없다.

export type WellnessReclaimEntry = {
  emp: Employee
  amount: number              // 선택 시점 환수금액(계산 불가하면 0으로 처리)
  recoupDate: string | null   // 'YYYY-MM-DD' — 퇴사일 + 1일(퇴사일이 없으면 null)
  mailKey: string
}

/**
 * 화면에 "먼저" 보여줄 행 — 지급 탭이 퇴사자 카드를 먼저 보여주는 것과 동일한 구조다.
 * amount는 지급 탭과 동일한 calcWellnessLeave() 계산 결과의 reclaim 값 그대로이며,
 * 입사일/퇴사일(또는 휴직시작일) 중 하나라도 없어 계산 자체가 불가능할 때만 null이다
 * (0원은 "계산은 됐지만 환수할 금액이 없음"을 뜻하는 정상 값으로 null과 다르게 표시한다).
 */
export type WellnessReclaimDisplayRow = {
  emp: Employee
  amount: number | null        // null = 계산 불가(퇴사일/휴직시작일 미입력), 0 이상 = 계산된 환수금액
  recoupDate: string | null    // 'YYYY-MM-DD' — 퇴사일 + 1일(퇴사일 없으면 null)
  mailKey: string
}

/**
 * employees 테이블의 퇴사자(status==='resigned') 전체를 기준으로 화면 목록을 구성한다.
 * 환수금액은 지급 탭과 동일한 calcWellnessLeave(join_date, 계산기준일).reclaim을 그대로
 * 재사용하며, 별도 엑셀 업로드/이름 매칭은 전혀 쓰지 않는다(요청 사양).
 */
export function buildWellnessReclaimDisplayRows(employees: Employee[]): WellnessReclaimDisplayRow[] {
  return employees
    .filter(e => e.status === 'resigned')
    .map(emp => {
      const leaveDateForCalc = calcEffectiveLeaveDate(emp) ?? emp.exit_date ?? null
      const amount = leaveDateForCalc ? calcWellnessLeave(emp.join_date ?? null, leaveDateForCalc).reclaim : null
      const recoupDate = emp.exit_date ? addOneDayToDateStr(emp.exit_date) : null
      return { emp, amount, recoupDate, mailKey: `reclaim_wellness_${emp.id}` }
    })
}

/** 체크박스는 환수금액 유무와 무관하게 퇴사자 전원이 항상 선택 가능하다(요청 사양) — 이
 * 함수는 "사용자가 실제로 체크한" display row를 그대로 WellnessReclaimEntry로 변환한다.
 * 계산 자체가 불가능했던(amount=null) 선택 건은 0원으로 처리한다. */
export function selectedReclaimEntries(rows: WellnessReclaimDisplayRow[]): WellnessReclaimEntry[] {
  return rows.map(r => ({ emp: r.emp, amount: r.amount ?? 0, recoupDate: r.recoupDate, mailKey: r.mailKey }))
}

export function sumWellnessReclaimAmount(entries: WellnessReclaimEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0)
}

/** 'YYYY-MM-DD' + 1일 — UTC 고정 계산으로 로컬 타임존 영향 없이 월/연도도 정확히 넘어간다 */
export function addOneDayToDateStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + 1)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

/** 화면/메일 표시용 "M.D"(연도·0패딩 없음) — "이름_M.D" 포맷에 사용. 회수일자를 계산할
 * 수 없는 경우(퇴사일 미입력) 대비 null-safe. */
export function formatMonthDayLabel(dateStr: string | null): string {
  if (!dateStr) return '날짜 확인 필요'
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}.${d}`
}

/**
 * 고객명 표기용 — 동명이인 구분을 위해 이름 끝에 붙는 영문 알파벳 "한 글자"만 제거한다
 * (요청 사양 예시: "김민정A"→"김민정", "황지현B"→"황지현"). 이름 중간의 영문은 절대
 * 건드리지 않는다 — lib/hecto-coin.ts의 stripEnglishFromName(문자열 전체에서 영문을
 * 전부 제거)과는 의도적으로 다른, 더 보수적인 함수다. 한글 바로 뒤에 영문 한 글자가
 * 올 때만 매칭되므로 순수 영문 이름 등은 그대로 둔다.
 */
export function stripTrailingDisambiguationLetter(name: string): string {
  return name.trim().replace(/([가-힣])[A-Za-z]$/, '$1')
}

const TEMPLATE_PATH = path.join(process.cwd(), 'lib/templates/wellness-coin-template.xlsx')

export type WellnessReclaimCoinTemplateRowInput = { name?: string; customerId?: string; amount?: number }

/**
 * 환수 엑셀 — 지급 쪽과 똑같은 고정 템플릿(lib/templates/wellness-coin-template.xlsx —
 * 상단 도움말/병합셀/스타일/열 너비/행 높이 그대로 유지, 컬럼: A=고객 구분값(고정값
 * '고객아이디') / B=고객명 / C=고객아이디 / D=휴대폰번호(항상 공란) / E=금액)을 그대로
 * 재사용한다(요청 사양: "기존 포인트 업로드 양식 그대로"). 단 lib/wellness-coin.ts의
 * fillWellnessCoinTemplate()는 지급 전용 검증(금액이 반드시 0보다 커야 함)이 있어
 * 환수(0원도 정상 값)에는 맞지 않으므로 그 함수를 호출하지 않고 템플릿 파일만 동일하게
 * 읽어 이 함수에서 독자적으로 채운다 — lib/wellness-coin.ts 자체는 전혀 건드리지 않는다.
 * 회수일자/퇴사일 컬럼은 이 엑셀에 넣지 않는다(요청 사양: 회수일자는 메일 본문에만 사용).
 */
export async function fillWellnessReclaimCoinTemplate(rows: WellnessReclaimCoinTemplateRowInput[]): Promise<Buffer> {
  if (rows.length === 0) throw new Error('다운로드할 대상자가 없습니다.')
  const invalid = rows.find(r =>
    !r.name?.trim() || !r.customerId?.trim() || typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount < 0,
  )
  if (invalid) throw new Error('이름, 고객아이디, 환수금액이 모두 유효해야 합니다(환수금액은 0원 이상).')
  if (rows.length > 1000) throw new Error('한 번에 최대 1,000명까지 처리할 수 있습니다.')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(TEMPLATE_PATH)
  const sheet = workbook.worksheets[0]

  rows.forEach((r, i) => {
    const rowNum = 3 + i
    sheet.getCell(`A${rowNum}`).value = '고객아이디'
    sheet.getCell(`B${rowNum}`).value = stripTrailingDisambiguationLetter(r.name!.trim())
    sheet.getCell(`C${rowNum}`).value = r.customerId!.trim()
    sheet.getCell(`D${rowNum}`).value = ''
    const amountCell = sheet.getCell(`E${rowNum}`)
    amountCell.value = r.amount!
    amountCell.numFmt = '#,##0'
  })

  const raw = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)
}

export function wellnessReclaimCoinFilename(d: Date = new Date()): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `웰니스코인_환수_${yyyy}년_${mm}월.xlsx`
}

export function wellnessReclaimMailAttachmentFilename(d: Date = new Date()): string {
  const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  return `웰니스코인_환수요청_${yyyymm}.xlsx`
}
