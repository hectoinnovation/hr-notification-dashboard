import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import path from 'path'
import { daysInMonth } from './wellness-mail'

// ─── 헥토코인 정산(걸음수/포인트 기반 월 지급) ────────────────────────────────────
// "헥토코인 정산" 탭(app/page.tsx activeTab === 'hecto') 전용 계산/파싱/엑셀 로직.
// 웰니스포인트/카페포인트와 달리 employees 테이블과 무관하게, 매달 업로드하는
// 걸음수/포인트 엑셀(1차·최종) 자체가 유일한 데이터 소스다.
//
// 저장 방식: 계산 결과가 아니라 "업로드 파일을 파싱한 원본"만 hecto_coin_settlements에
// 저장하고(first_rows/final_rows), 화면에 보이는 지급액은 항상 computeHectoCoinEntries()가
// 그 원본에서 매번 다시 계산한다. 재업로드 시 이전 계산값과 새 계산값이 섞이는 것을 막기
// 위한 설계 — 원본 두 개만 최신 상태로 유지하면 결과는 항상 하나로 정해진다.

export const HECTO_COIN_MONTHLY_CAP = 200000

export type HectoCoinRawRow = {
  name: string
  company: string | null
  position: string | null   // 직책/부서
  steps: number | null      // 월 누적 걸음수 (참고용)
  points: number | null     // 월 누적 포인트 (지급액 계산 기준)
  joinDate: string | null   // 'YYYY-MM-DD' — 해당 월 신규입사자만 값 있음
}

export type HectoCoinSettlementRow = {
  settlement_month: string
  first_file_name: string | null
  first_uploaded_at: string | null
  first_rows: HectoCoinRawRow[] | null
  final_file_name: string | null
  final_uploaded_at: string | null
  final_rows: HectoCoinRawRow[] | null
}

// ─── 엑셀 업로드 파싱 ───────────────────────────────────────────────────────────
function normalizeHeader(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, '').replace(/[()（）[\]]/g, '')
}

function parseHectoCoinNumber(v: unknown): number | null {
  if (v === '' || v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

function parseHectoCoinDate(v: unknown): string | null {
  if (v === '' || v == null) return null
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(v).trim()
  if (!s) return null
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
}

export type ParsedHectoCoinFile = {
  rows: HectoCoinRawRow[]
  skippedRows: string[]   // 포인트 값이 비어있거나 숫자로 변환할 수 없어 제외된 행 안내
}

/**
 * 걸음수/포인트 업로드 엑셀 파싱. 필수 컬럼(이름/월 누적 걸음수/월 누적 포인트/입사일)이
 * 없으면 사용자가 이해할 수 있는 메시지로 예외를 던진다. 회사/직책·부서는 참고용이라
 * 없어도 파싱은 계속 진행한다.
 */
export function parseHectoCoinExcelFile(buffer: ArrayBuffer): ParsedHectoCoinFile {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('엑셀 시트를 찾을 수 없습니다.')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  let headerRow = -1
  let col = { name: -1, points: -1, steps: -1, joinDate: -1, company: -1, position: -1 }
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] as unknown[]
    const found = { name: -1, points: -1, steps: -1, joinDate: -1, company: -1, position: -1 }
    row.forEach((cell, c) => {
      const norm = normalizeHeader(cell)
      if (!norm) return
      if (found.name === -1 && norm === '이름') found.name = c
      if (found.points === -1 && norm.includes('포인트')) found.points = c
      if (found.steps === -1 && norm.includes('걸음수')) found.steps = c
      if (found.joinDate === -1 && norm.includes('입사일')) found.joinDate = c
      if (found.company === -1 && norm === '회사') found.company = c
      if (found.position === -1 && (norm.includes('직책') || norm.includes('부서'))) found.position = c
    })
    if (found.name !== -1 && found.points !== -1) { headerRow = r; col = found; break }
  }
  if (headerRow === -1 || col.name === -1) throw new Error('이름 컬럼을 찾을 수 없습니다.')
  if (col.points === -1) throw new Error('월 누적 포인트 컬럼을 찾을 수 없습니다.')
  if (col.steps === -1) throw new Error('월 누적 걸음수 컬럼을 찾을 수 없습니다.')
  if (col.joinDate === -1) throw new Error('입사일 컬럼을 찾을 수 없습니다.')

  const parsedRows: HectoCoinRawRow[] = []
  const skippedRows: string[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[]
    const name = String(row[col.name] ?? '').trim()
    if (!name) continue
    const points = parseHectoCoinNumber(row[col.points])
    if (points === null) {
      skippedRows.push(`${r + 1}행 (${name}) — 월 누적 포인트 값을 확인할 수 없어 제외되었습니다.`)
      continue
    }
    parsedRows.push({
      name,
      company: col.company !== -1 ? (String(row[col.company] ?? '').trim() || null) : null,
      position: col.position !== -1 ? (String(row[col.position] ?? '').trim() || null) : null,
      steps: parseHectoCoinNumber(row[col.steps]),
      points,
      joinDate: parseHectoCoinDate(row[col.joinDate]),
    })
  }
  if (parsedRows.length === 0) throw new Error('업로드할 수 있는 데이터가 없습니다.')
  return { rows: parsedRows, skippedRows }
}

// ─── 지급액 계산 ────────────────────────────────────────────────────────────────
/**
 * 개인별 월 지급 상한. 입사일이 없으면(기존 재직자) 월 일반 상한 그대로,
 * 입사일이 있으면(해당 월 신규입사자) 입사일(포함)부터 월 말일까지 재직일수만큼
 * 일할계산한다. 반올림은 기존 웰니스/성과/근속포인트와 동일하게 최종 금액에
 * Math.round()를 한 번만 적용(lib/wellness-mail.ts calcWellnessHire와 동일 규칙).
 */
export function calcHectoCoinPayCap(settlementMonth: string, joinDate: string | null): number {
  if (!joinDate) return HECTO_COIN_MONTHLY_CAP
  const [sy, sm] = settlementMonth.split('-').map(Number)
  const dim = daysInMonth(sy, sm)
  const joinDay = new Date(joinDate).getDate()
  const workedDays = dim - joinDay + 1
  if (workedDays <= 0) return 0
  if (workedDays >= dim) return HECTO_COIN_MONTHLY_CAP
  return Math.round(HECTO_COIN_MONTHLY_CAP * workedDays / dim)
}

export type HectoCoinMatchStatus = 'first_only' | 'final_only' | 'matched'

export type HectoCoinEntry = {
  key: string
  name: string
  company: string | null
  position: string | null
  joinDate: string | null
  steps: number | null
  payCap: number
  firstPoints: number | null
  firstAmount: number | null
  finalPoints: number | null
  finalAmount: number | null
  additionalAmount: number | null
  totalAmount: number | null
  matchStatus: HectoCoinMatchStatus
  isDuplicateName: boolean
}

function groupByName(rows: HectoCoinRawRow[]): Map<string, HectoCoinRawRow[]> {
  const m = new Map<string, HectoCoinRawRow[]>()
  for (const r of rows) {
    const k = r.name.trim()
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(r)
  }
  return m
}

function buildEntry(
  settlementMonth: string, key: string, name: string,
  first: HectoCoinRawRow | null, final: HectoCoinRawRow | null, isDuplicateName: boolean,
): HectoCoinEntry {
  const src = final ?? first!
  const payCap = calcHectoCoinPayCap(settlementMonth, src.joinDate)
  const firstPoints = first?.points ?? null
  const firstAmount = firstPoints != null ? Math.min(firstPoints, payCap) : null
  const finalPoints = final?.points ?? null
  const finalAmount = finalPoints != null ? Math.min(finalPoints, payCap) : null
  const additionalAmount = (firstAmount != null && finalAmount != null) ? Math.max(finalAmount - firstAmount, 0) : null
  const totalAmount = firstAmount != null ? firstAmount + (additionalAmount ?? 0) : null
  return {
    key, name, company: src.company, position: src.position, joinDate: src.joinDate, steps: src.steps,
    payCap, firstPoints, firstAmount, finalPoints, finalAmount, additionalAmount, totalAmount,
    matchStatus: first && final ? 'matched' : first ? 'first_only' : 'final_only',
    isDuplicateName,
  }
}

/**
 * 1차/최종 원본 데이터에서 화면에 표시할 개인별 정산 결과를 매번 새로 계산한다.
 * 이름이 1차·최종 파일 어느 한쪽에만 있으면 matchStatus로 표시(미매칭 경고는 화면에서
 * final_only 처리), 같은 파일 안에 동일 이름이 2건 이상이면 자동으로 짝을 맞추지 않고
 * 각 건을 개별 항목(isDuplicateName=true)으로 남겨 사용자가 직접 확인하게 한다.
 */
export function computeHectoCoinEntries(
  settlementMonth: string,
  firstRows: HectoCoinRawRow[],
  finalRows: HectoCoinRawRow[],
): HectoCoinEntry[] {
  const firstByName = groupByName(firstRows)
  const finalByName = groupByName(finalRows)
  const names = new Set<string>([...firstByName.keys(), ...finalByName.keys()])
  const entries: HectoCoinEntry[] = []
  for (const name of names) {
    const firsts = firstByName.get(name) ?? []
    const finals = finalByName.get(name) ?? []
    if (firsts.length > 1 || finals.length > 1) {
      firsts.forEach((r, i) => entries.push(buildEntry(settlementMonth, `${name}__1__${i}`, name, r, null, true)))
      finals.forEach((r, i) => entries.push(buildEntry(settlementMonth, `${name}__2__${i}`, name, null, r, true)))
      continue
    }
    entries.push(buildEntry(settlementMonth, name, name, firsts[0] ?? null, finals[0] ?? null, false))
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

// ─── 지급용 엑셀(선불 관리자 거래 요청 양식) ─────────────────────────────────────
// 웰니스코인과 완전히 동일한 고정 템플릿을 그대로 재사용한다(lib/wellness-coin.ts
// fillWellnessCoinTemplate 참고 — 상단 도움말/병합셀/스타일/열너비/행높이 모두 동일).
// 다만 헥토코인 정산은 B(고객명)·E(금액)만 채우고 A(고객 구분값)/C(고객아이디)/
// D(휴대폰번호)는 요청대로 빈 값으로 둔다 — fillWellnessCoinTemplate을 수정하지 않고
// 별도 함수로 둔 이유이기도 하다(웰니스코인 쪽 A/C 채우는 로직과 절대 섞이면 안 됨).
const TEMPLATE_PATH = path.join(process.cwd(), 'lib/templates/wellness-coin-template.xlsx')

export type HectoCoinPayoutRow = { name: string; amount: number }

export async function fillHectoCoinTemplate(rows: HectoCoinPayoutRow[]): Promise<Buffer> {
  if (rows.length === 0) throw new Error('다운로드할 대상자가 없습니다.')
  const invalid = rows.find(r => !r.name?.trim() || typeof r.amount !== 'number' || !Number.isFinite(r.amount) || r.amount <= 0)
  if (invalid) throw new Error('이름과 지급금액이 모두 유효해야 합니다.')
  if (rows.length > 1000) throw new Error('한 번에 최대 1,000명까지 처리할 수 있습니다.')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(TEMPLATE_PATH)
  const sheet = workbook.worksheets[0]

  rows.forEach((r, i) => {
    const rowNum = 3 + i
    sheet.getCell(`B${rowNum}`).value = r.name.trim()
    const amountCell = sheet.getCell(`E${rowNum}`)
    amountCell.value = r.amount
    amountCell.numFmt = '#,##0'
  })

  const raw = await workbook.xlsx.writeBuffer()
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)
}

export function hectoCoinFilename(settlementMonth: string, kind: 'first' | 'additional'): string {
  const [y, m] = settlementMonth.split('-')
  return `헥토코인_${kind === 'first' ? '1차지급' : '추가지급'}_${y}년_${m}월.xlsx`
}
