import * as XLSX from 'xlsx'
import type { Employee } from './supabase'
import { daysInMonth } from './wellness-mail'

// ─── 헥토코인 정산(걸음수/포인트 기반 월 지급) ────────────────────────────────────
// "헥토코인 정산" 탭(app/page.tsx activeTab === 'hecto') 전용 계산/파싱 로직.
//
// 입사/퇴사/휴직/복귀 날짜의 source of truth는 employees 테이블이다(엑셀 업로드 파일의
// 입사일 컬럼은 더 이상 쓰지 않는다) — 매달 업로드하는 걸음수/포인트 엑셀은 오직
// "이름 + 월 누적 걸음수(참고용) + 월 누적 포인트(지급 기준)"만 제공한다.
//
// 저장 방식은 기존과 동일: 계산 결과가 아니라 "업로드 파일을 파싱한 원본"만
// hecto_coin_settlements에 저장하고(first_rows/final_rows), 화면에 보이는 지급액은
// 항상 computeHectoCoinEntries()가 그 원본 + employees 현재 상태에서 매번 다시 계산한다.

export const HECTO_COIN_MONTHLY_CAP = 200000

export type HectoCoinRawRow = {
  name: string
  company: string | null
  position: string | null   // 직책/부서
  steps: number | null      // 월 누적 걸음수 (참고용)
  points: number | null     // 월 누적 포인트 (지급액 계산 기준)
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

// ─── 사원리스트(고객아이디 매핑) ────────────────────────────────────────────────
// 정산월과 무관하게 유지되는 전역 매핑 — cafe_excel_data와 동일한 "singleton 1행"
// 패턴으로 hecto_coin_roster 테이블에 저장한다(app/page.tsx handleHectoRosterUpload 참고).
export type HectoCoinRosterEntry = { name: string; customerId: string }
export type HectoCoinRosterRow = {
  id: string
  file_name: string | null
  uploaded_at: string | null
  entries: HectoCoinRosterEntry[] | null
}

// ─── 이름 정규화 ────────────────────────────────────────────────────────────────
/**
 * 헥토코인 걸음수 앱이 내보내는 원본 이름에는 영문 알파벳이 붙어 있을 수 있다
 * (예: "안소정ABCE" / "안소정 ABC" / "A안소정"). 영문(A-Z/a-z)만 제거하고 양끝 공백을
 * 정리한다 — 한글 이름 자체는 손대지 않는다. 이 정규화된 이름을 직원 DB 매칭,
 * 사원리스트 매칭, 지급 엑셀 B열(고객명) 모두에 동일하게 사용한다.
 */
export function stripEnglishFromName(raw: string): string {
  return raw.replace(/[A-Za-z]+/g, '').replace(/\s+/g, ' ').trim()
}

// ─── 걸음수/포인트 업로드 엑셀 파싱 ─────────────────────────────────────────────
function normalizeHeader(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, '').replace(/[()（）[\]]/g, '')
}

function parseHectoCoinNumber(v: unknown): number | null {
  if (v === '' || v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

export type ParsedHectoCoinFile = {
  rows: HectoCoinRawRow[]
  skippedRows: string[]   // 포인트 값이 비어있거나 숫자로 변환할 수 없어 제외된 행 안내
}

/**
 * 걸음수/포인트 업로드 엑셀 파싱. 필수 컬럼(이름/월 누적 걸음수/월 누적 포인트)이 없으면
 * 사용자가 이해할 수 있는 메시지로 예외를 던진다. 회사/직책·부서는 참고용이라 없어도
 * 파싱은 계속 진행하고, 입사일 컬럼은 더 이상 사용하지 않는다(직원 DB가 source of truth).
 */
export function parseHectoCoinExcelFile(buffer: ArrayBuffer): ParsedHectoCoinFile {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('엑셀 시트를 찾을 수 없습니다.')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  let headerRow = -1
  let col = { name: -1, points: -1, steps: -1, company: -1, position: -1 }
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] as unknown[]
    const found = { name: -1, points: -1, steps: -1, company: -1, position: -1 }
    row.forEach((cell, c) => {
      const norm = normalizeHeader(cell)
      if (!norm) return
      if (found.name === -1 && norm === '이름') found.name = c
      if (found.points === -1 && norm.includes('포인트')) found.points = c
      if (found.steps === -1 && norm.includes('걸음수')) found.steps = c
      if (found.company === -1 && norm === '회사') found.company = c
      if (found.position === -1 && (norm.includes('직책') || norm.includes('부서'))) found.position = c
    })
    if (found.name !== -1 && found.points !== -1) { headerRow = r; col = found; break }
  }
  if (headerRow === -1 || col.name === -1) throw new Error('이름 컬럼을 찾을 수 없습니다.')
  if (col.points === -1) throw new Error('월 누적 포인트 컬럼을 찾을 수 없습니다.')
  if (col.steps === -1) throw new Error('월 누적 걸음수 컬럼을 찾을 수 없습니다.')

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
    })
  }
  if (parsedRows.length === 0) throw new Error('업로드할 수 있는 데이터가 없습니다.')
  return { rows: parsedRows, skippedRows }
}

// ─── 사원리스트 엑셀 파싱 ───────────────────────────────────────────────────────
const ROSTER_ID_HEADERS = ['고객아이디', '아이디', 'id', '이메일', 'email']
const ROSTER_NAME_HEADERS = ['이름', '성명', '고객명']

/**
 * 사원리스트(이름 + 고객아이디 매핑) 엑셀 파싱. 실제 헤더명이 회사마다 다를 수 있어
 * 자주 쓰이는 헤더 후보군으로 유연하게 인식한다. 이름은 stripEnglishFromName으로
 * 정규화해서 저장 — 헥토코인 원본 파일의 정규화된 이름과 동일 기준으로 매칭된다.
 */
export function parseHectoCoinRosterFile(buffer: ArrayBuffer): { entries: HectoCoinRosterEntry[]; skippedRows: string[] } {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('엑셀 시트를 찾을 수 없습니다.')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  let headerRow = -1
  let col = { name: -1, customerId: -1 }
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] as unknown[]
    const found = { name: -1, customerId: -1 }
    row.forEach((cell, c) => {
      const norm = normalizeHeader(cell)
      if (!norm) return
      if (found.name === -1 && ROSTER_NAME_HEADERS.includes(norm)) found.name = c
      if (found.customerId === -1 && ROSTER_ID_HEADERS.some(h => h.toLowerCase() === norm.toLowerCase())) found.customerId = c
    })
    if (found.name !== -1 && found.customerId !== -1) { headerRow = r; col = found; break }
  }
  if (headerRow === -1 || col.name === -1) throw new Error('이름(성명/고객명) 컬럼을 찾을 수 없습니다.')
  if (col.customerId === -1) throw new Error('고객아이디(아이디/ID/이메일) 컬럼을 찾을 수 없습니다.')

  const entries: HectoCoinRosterEntry[] = []
  const skippedRows: string[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[]
    const rawName = String(row[col.name] ?? '').trim()
    const customerId = String(row[col.customerId] ?? '').trim()
    if (!rawName && !customerId) continue
    const name = stripEnglishFromName(rawName)
    if (!name || !customerId) {
      skippedRows.push(`${r + 1}행 — 이름 또는 고객아이디를 확인할 수 없어 제외되었습니다.`)
      continue
    }
    entries.push({ name, customerId })
  }
  if (entries.length === 0) throw new Error('업로드할 수 있는 사원 데이터가 없습니다.')
  return { entries, skippedRows }
}

// ─── 직원 DB 기반 일할계산 ──────────────────────────────────────────────────────
// 날짜는 전부 'YYYY-MM-DD' 문자열 그대로 비교/연산한다(사전순 비교 = 날짜순 비교와 동일).
// Date 객체 파싱을 전혀 거치지 않으므로 호스트 타임존에 영향을 받지 않는다.

function ymdMonthBounds(settlementMonth: string): { start: string; end: string; dim: number } {
  const [sy, sm] = settlementMonth.split('-').map(Number)
  const dim = daysInMonth(sy, sm)
  const mm = String(sm).padStart(2, '0')
  return { start: `${sy}-${mm}-01`, end: `${sy}-${mm}-${String(dim).padStart(2, '0')}`, dim }
}

function dayOfMonth(dateStr: string): number {
  return Number(dateStr.slice(8, 10))
}

/** dateStr(YYYY-MM-DD)에 delta일을 더한 날짜 문자열. Date.UTC로만 연산하고 UTC getter로만
 *  읽어 호스트 타임존과 무관하다(월/연도 경계를 넘어갈 수 있는 휴직시작일-1일 계산용). */
function addDaysToDateStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + delta * 86400000)
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
}

export type HectoCoinDbCalc = {
  payableDays: number
  payCap: number
  statusLabel: string
  excludeReason: string | null
  // display* 4종은 전부 "선택한 정산월 안에서 실제로 발생한 이벤트일 때만" 값이 채워진다
  // (일할계산에는 영향 없음 — 계산은 정산월 이전 이벤트도 그대로 반영한다).
  displayJoinDate: string | null    // 입사일 (휴직복귀 상태가 아니면서 정산월 안의 입사일일 때만)
  displayReturnDate: string | null  // 복귀일 (join_reason === '휴직복귀'이면서 정산월 안의 복귀일일 때만)
  displayLeaveDate: string | null   // 휴직 시작일 (현재 휴직 중이면서 정산월 안의 휴직시작일일 때만)
  displayExitDate: string | null    // 퇴사일 (퇴사자이면서 정산월 안의 퇴사일일 때만)
}

/**
 * 직원 1명의 현재 DB 상태(employees)만으로 해당 정산월의 "실제 지급대상 일수"와
 * 지급상한을 계산한다. 날짜 인정 기준(요청 사양 그대로):
 *   입사일 = 포함, 퇴사일 = 포함, 휴직 시작일 = 제외, 복귀일 = 포함
 *
 * 이 테이블은 사람별 "현재 상태" 1행만 보관하고 별도 휴직 이력 테이블이 없다
 * (실제 운영 데이터로 확인: 현재 휴직복귀 상태인 직원 전원이 exit_date=null —
 * 복귀 처리 시점에 이전 휴직 시작일이 사라진다). 따라서 "같은 정산월 안에서
 * 휴직과 복귀가 모두 일어난" 복합 케이스는 이 함수가 재현할 수 없고, 실제로는
 * "정산월 이전부터 이어진 휴직 후 이번 달 복귀"와 DB상 구분이 불가능하다 —
 * 이 경우도 그냥 복귀일 기준으로 계산되며(가장 흔한 케이스에서는 정확), 상태 라벨에
 * "휴직복귀"로만 표시되어 담당자가 필요 시 육안으로 확인할 수 있게 한다.
 */
export function calcHectoCoinFromEmployee(emp: Employee, settlementMonth: string): HectoCoinDbCalc {
  const { start: monthStart, end: monthEnd, dim } = ymdMonthBounds(settlementMonth)

  const isReturnee = emp.status === 'active' && emp.join_reason === '휴직복귀'
  const isOnLeave = emp.status === 'active' && emp.join_reason === '휴직'
  const isResigned = emp.status === 'resigned'

  const inMonth = (d: string | null | undefined): boolean => !!d && d >= monthStart && d <= monthEnd

  // joinedMid/returnedMid/leaveMid/exitMid: "이 이벤트가 선택한 정산월 안에서 실제로
  // 발생했는가"만 판단한다 — 일할계산(아래 rawStart/rawEnd/clampedStart/clampedEnd)과는
  // 완전히 별개다. 예: 7월에 입사해 9월까지 계속 재직 중이면 일할계산은 정상재직(30일)으로
  // 정확히 동작하지만, joinedMid는 false이므로 9월 화면의 "입사일" 칸에는 7월 날짜를
  // 보여주지 않고 '-'로 비워둔다(표시 전용 게이팅 — 계산 결과에는 영향 없음).
  const joinedMid   = !isReturnee && inMonth(emp.join_date)
  const returnedMid = isReturnee && inMonth(emp.join_date)
  const leaveMid    = isOnLeave && inMonth(emp.exit_date)
  const exitMid     = isResigned && inMonth(emp.exit_date)

  const baseDisplay = {
    displayJoinDate: joinedMid ? emp.join_date! : null,
    displayReturnDate: returnedMid ? emp.join_date! : null,
    displayLeaveDate: leaveMid ? emp.exit_date! : null,
    displayExitDate: exitMid ? emp.exit_date! : null,
  }

  let rawStart: string | null = null
  let rawEnd: string | null = null

  if (isResigned) {
    rawStart = emp.join_date ?? null
    if (!emp.exit_date) {
      return { payableDays: 0, payCap: 0, statusLabel: '퇴사일 미입력', excludeReason: '퇴사일이 입력되지 않아 계산할 수 없습니다.', ...baseDisplay }
    }
    rawEnd = emp.exit_date
  } else if (isOnLeave) {
    rawStart = emp.join_date ?? null
    if (!emp.exit_date) {
      return { payableDays: 0, payCap: 0, statusLabel: '휴직시작일 미입력', excludeReason: '휴직 시작일이 입력되지 않아 계산할 수 없습니다.', ...baseDisplay }
    }
    rawEnd = addDaysToDateStr(emp.exit_date, -1)   // 휴직 시작일 자체는 제외
  } else {
    // 휴직복귀(join_date=복귀일) / 입사 / 전적 / 인턴 등 — join_date부터 월말까지
    rawStart = emp.join_date ?? null
    rawEnd = null
  }

  const clampedStart = rawStart && rawStart > monthStart ? rawStart : monthStart
  const clampedEnd = rawEnd && rawEnd < monthEnd ? rawEnd : monthEnd

  if (clampedStart > clampedEnd) {
    let reason = '해당 월 지급대상 일수가 없습니다.'
    if (isOnLeave) reason = '월 전체 휴직'
    else if (isResigned && emp.exit_date && emp.exit_date < monthStart) reason = '정산월 이전 퇴사'
    else if (rawStart && rawStart > monthEnd) reason = '정산월 이후 입사'
    return { payableDays: 0, payCap: 0, statusLabel: reason, excludeReason: reason, ...baseDisplay }
  }

  const payableDays = dayOfMonth(clampedEnd) - dayOfMonth(clampedStart) + 1
  const payCap = payableDays >= dim ? HECTO_COIN_MONTHLY_CAP : Math.round(HECTO_COIN_MONTHLY_CAP * payableDays / dim)

  // joinedMid/returnedMid/leaveMid/exitMid는 위에서 이미 계산됨(표시 게이팅과 동일 기준 재사용)
  const parts: string[] = []
  if (joinedMid) parts.push('중도입사')
  if (returnedMid) parts.push('휴직복귀')
  if (leaveMid) parts.push('휴직')
  if (exitMid) parts.push('중도퇴사')
  const statusLabel = parts.length > 0 ? parts.join(' + ') : '정상재직'

  return { payableDays, payCap, statusLabel, excludeReason: null, ...baseDisplay }
}

/**
 * employees에 해당 인물의 이벤트 기록이 아예 없거나(정상적인 경우 — employees는
 * "일할계산 예외 정보"만 담는 테이블이라 대부분의 정상 재직자는 여기 없다) 동명이인이라
 * 어느 기록을 적용해야 할지 알 수 없을 때 쓰는 기본값. "정산월 안에서 알려진 예외 이벤트가
 * 없다 = 이번 달 내내 정상재직"으로 간주해 월 전체 상한을 그대로 적용한다.
 */
function fullMonthCalc(settlementMonth: string): HectoCoinDbCalc {
  const { dim } = ymdMonthBounds(settlementMonth)
  return {
    payableDays: dim, payCap: HECTO_COIN_MONTHLY_CAP, statusLabel: '정상재직', excludeReason: null,
    displayJoinDate: null, displayReturnDate: null, displayLeaveDate: null, displayExitDate: null,
  }
}

// ─── 직원/고객아이디 매칭 ───────────────────────────────────────────────────────
export type HectoCoinEmployeeMatch =
  | { kind: 'matched'; emp: Employee }
  | { kind: 'not_found' }
  | { kind: 'duplicate' }

/**
 * 정규화된 이름으로 employees를 매칭한다. employees는 전 직원 마스터가 아니라
 * "정산월 일할계산에 영향을 주는 입/퇴사·휴직·복귀 이벤트가 있는 사람만" 등록되어
 * 있으므로, 매칭 결과가 없어도(not_found) 오류가 아니다 — 호출부(buildEntry)가
 * "일할계산할 예외 정보 없음 = 정상재직"으로 취급한다. 동일 이름이 2명 이상이면
 * 어느 쪽 이벤트를 적용해야 할지 알 수 없으므로 임의로 고르지 않고 'duplicate'로
 * 반환 — 호출부가 이 경우도 이벤트 정보 없음(정상재직)으로 기본 처리하되, 화면에
 * 확인 필요 표시를 남긴다(지급 자체를 막지는 않는다 — 그건 사원리스트/고객아이디의 몫).
 */
export function matchEmployeeByName(normalizedName: string, employees: Employee[]): HectoCoinEmployeeMatch {
  const matches = employees.filter(e => e.name.trim() === normalizedName)
  if (matches.length === 0) return { kind: 'not_found' }
  if (matches.length > 1) return { kind: 'duplicate' }
  return { kind: 'matched', emp: matches[0] }
}

export type HectoCoinCustomerIdMatch =
  | { kind: 'matched'; customerId: string }
  | { kind: 'not_found' }
  | { kind: 'duplicate' }

/**
 * 고객아이디 매칭 우선순위: 1) 업로드된 사원리스트, 2) 직원 DB에 이미 있는
 * employees.customer_id(웰니스코인용으로 이미 입력돼 있을 수 있음) 순으로 활용한다.
 * 사원리스트에 동일 정규화 이름이 서로 다른 고객아이디로 2건 이상 있으면 임의로
 * 고르지 않고 'duplicate' 반환(같은 아이디로 중복 등록된 경우는 모호하지 않으므로 허용).
 */
export function matchCustomerId(
  normalizedName: string,
  roster: HectoCoinRosterEntry[],
  employeeMatch: HectoCoinEmployeeMatch,
): HectoCoinCustomerIdMatch {
  const rosterMatches = roster.filter(r => r.name === normalizedName && r.customerId.trim())
  if (rosterMatches.length > 0) {
    const distinctIds = new Set(rosterMatches.map(r => r.customerId.trim()))
    if (distinctIds.size > 1) return { kind: 'duplicate' }
    return { kind: 'matched', customerId: rosterMatches[0].customerId.trim() }
  }
  if (employeeMatch.kind === 'matched' && employeeMatch.emp.customer_id?.trim()) {
    return { kind: 'matched', customerId: employeeMatch.emp.customer_id.trim() }
  }
  return { kind: 'not_found' }
}

// ─── 화면 표시용 개인별 정산 결과 ───────────────────────────────────────────────
export type HectoCoinPointsMatchStatus = 'first_only' | 'final_only' | 'matched'

export type HectoCoinEntry = {
  key: string
  rawName: string    // 업로드 원본 이름(영문 제거 전)
  name: string        // 정규화된 이름(영문 제거) — 매칭/표시/지급 엑셀 B열에 사용
  company: string | null
  position: string | null
  steps: number | null

  displayJoinDate: string | null
  displayReturnDate: string | null
  displayLeaveDate: string | null
  displayExitDate: string | null
  payableDays: number | null
  payCap: number | null

  firstPoints: number | null
  firstAmount: number | null
  finalPoints: number | null
  finalAmount: number | null
  additionalAmount: number | null
  totalAmount: number | null

  pointsMatchStatus: HectoCoinPointsMatchStatus
  isDuplicateInPointsFile: boolean   // 같은 업로드 파일 안에 동일 이름이 2건 이상

  employeeMatch: 'matched' | 'not_found' | 'duplicate'
  customerId: string | null
  customerIdMatch: 'matched' | 'not_found' | 'duplicate'

  statusLabel: string
  excludeReason: string | null   // null이면 지급액 계산 가능한 정상 대상
}

function groupByNormalizedName(rows: HectoCoinRawRow[]): Map<string, HectoCoinRawRow[]> {
  const m = new Map<string, HectoCoinRawRow[]>()
  for (const r of rows) {
    const k = stripEnglishFromName(r.name)
    if (!k) continue
    if (!m.has(k)) m.set(k, [])
    m.get(k)!.push(r)
  }
  return m
}

function buildEntry(
  settlementMonth: string, key: string, name: string, rawName: string,
  first: HectoCoinRawRow | null, final: HectoCoinRawRow | null, isDuplicateInPointsFile: boolean,
  employees: Employee[], roster: HectoCoinRosterEntry[],
): HectoCoinEntry {
  const src = (final ?? first)!
  const pointsMatchStatus: HectoCoinPointsMatchStatus = first && final ? 'matched' : first ? 'first_only' : 'final_only'

  // 포인트 파일 내 중복 이름이면 어느 행을 기준으로 직원을 매칭해야 할지도 불분명하므로
  // 직원 매칭 자체를 시도하지 않는다(어차피 지급 대상에서 제외됨).
  const employeeMatch: HectoCoinEmployeeMatch = isDuplicateInPointsFile ? { kind: 'not_found' } : matchEmployeeByName(name, employees)
  const customerIdMatch = matchCustomerId(name, roster, employeeMatch)

  let statusLabel: string
  let excludeReason: string | null
  let payCap: number | null = null
  let payableDays: number | null = null
  let displayJoinDate: string | null = null
  let displayReturnDate: string | null = null
  let displayLeaveDate: string | null = null
  let displayExitDate: string | null = null

  if (isDuplicateInPointsFile) {
    // 같은 업로드 파일 안에 동일 이름이 2건 이상 — 어느 포인트 값이 누구 것인지 알 수
    // 없으므로 이 케이스만 지급 계산 자체를 하지 않는다(employees/사원리스트와는 무관).
    statusLabel = '중복 이름 확인필요'
    excludeReason = statusLabel
  } else {
    // employees는 전 직원 마스터가 아니라 "일할계산 예외 이벤트"만 담는 테이블이므로,
    // 매칭되면 그 이벤트를 반영하고 / 매칭 안 되거나(not_found) 동명이인이라 어느 기록을
    // 적용할지 알 수 없으면(duplicate) "이번 달 알려진 예외 없음 = 정상재직"을 기본값으로
    // 쓴다 — 둘 다 지급 계산 자체를 막지 않는다(실제 지급 대상 여부는 사원리스트/고객아이디
    // 매칭이 결정한다).
    const dbCalc = employeeMatch.kind === 'matched'
      ? calcHectoCoinFromEmployee(employeeMatch.emp, settlementMonth)
      : fullMonthCalc(settlementMonth)
    statusLabel = dbCalc.statusLabel
    excludeReason = dbCalc.excludeReason
    payCap = dbCalc.payCap
    payableDays = dbCalc.payableDays
    displayJoinDate = dbCalc.displayJoinDate
    displayReturnDate = dbCalc.displayReturnDate
    displayLeaveDate = dbCalc.displayLeaveDate
    displayExitDate = dbCalc.displayExitDate
  }

  const firstPoints = first?.points ?? null
  const firstAmount = (payCap != null && firstPoints != null) ? Math.min(firstPoints, payCap) : null
  const finalPoints = final?.points ?? null
  const finalAmount = (payCap != null && finalPoints != null) ? Math.min(finalPoints, payCap) : null
  const additionalAmount = (firstAmount != null && finalAmount != null) ? Math.max(finalAmount - firstAmount, 0) : null
  const totalAmount = firstAmount != null ? firstAmount + (additionalAmount ?? 0) : null

  return {
    key, rawName, name, company: src.company, position: src.position, steps: src.steps,
    displayJoinDate, displayReturnDate, displayLeaveDate, displayExitDate,
    payableDays, payCap,
    firstPoints, firstAmount, finalPoints, finalAmount, additionalAmount, totalAmount,
    pointsMatchStatus, isDuplicateInPointsFile,
    employeeMatch: employeeMatch.kind,
    customerId: customerIdMatch.kind === 'matched' ? customerIdMatch.customerId : null,
    customerIdMatch: customerIdMatch.kind,
    statusLabel, excludeReason,
  }
}

/**
 * 1차/최종 원본 + employees(현재 상태) + 사원리스트에서 화면에 표시할 개인별 정산
 * 결과를 매번 새로 계산한다. 이름은 stripEnglishFromName으로 정규화한 뒤 비교하므로
 * 헥토코인 원본 파일의 "안소정ABCE" 같은 표기도 직원 DB/사원리스트의 "안소정"과
 * 동일 인물로 매칭된다. 같은 업로드 파일 안에 동일 정규화 이름이 2건 이상이면 자동으로
 * 짝을 맞추지 않고 각 건을 개별 항목으로 남겨 사용자가 직접 확인하게 한다.
 */
export function computeHectoCoinEntries(
  settlementMonth: string,
  firstRows: HectoCoinRawRow[],
  finalRows: HectoCoinRawRow[],
  employees: Employee[],
  roster: HectoCoinRosterEntry[],
): HectoCoinEntry[] {
  const firstByName = groupByNormalizedName(firstRows)
  const finalByName = groupByNormalizedName(finalRows)
  const names = new Set<string>([...firstByName.keys(), ...finalByName.keys()])
  const entries: HectoCoinEntry[] = []

  for (const name of names) {
    const firsts = firstByName.get(name) ?? []
    const finals = finalByName.get(name) ?? []
    if (firsts.length > 1 || finals.length > 1) {
      firsts.forEach((r, i) => entries.push(buildEntry(settlementMonth, `${name}__1__${i}`, name, r.name, r, null, true, employees, roster)))
      finals.forEach((r, i) => entries.push(buildEntry(settlementMonth, `${name}__2__${i}`, name, r.name, null, r, true, employees, roster)))
      continue
    }
    const first = firsts[0] ?? null
    const final = finals[0] ?? null
    const rawName = (final ?? first)!.name
    entries.push(buildEntry(settlementMonth, name, name, rawName, first, final, false, employees, roster))
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export function hectoCoinFilename(settlementMonth: string, kind: 'first' | 'additional'): string {
  const [y, m] = settlementMonth.split('-')
  return `헥토코인_${kind === 'first' ? '1차지급' : '추가지급'}_${y}년_${m}월.xlsx`
}
