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
  first_payment_overrides: HectoCoinPaymentOverrides | null
  additional_payment_overrides: HectoCoinPaymentOverrides | null
  first_data_overrides: HectoCoinDataOverrides | null
  additional_data_overrides: HectoCoinDataOverrides | null
  excluded_employees: HectoCoinExcludedEmployees | null
}

/**
 * 지급금액 수동 수정값 — { 정규화된이름: 금액 }. 자동 계산값을 대체하는 게 아니라
 * "있으면 자동계산값보다 우선 적용"할 뿐이라, 값이 없는 사람은 항상 자동 계산값을 쓴다.
 * 키는 employees/사원리스트/포인트파일 매칭에 이미 쓰이는 정규화된 이름과 동일 기준
 * (stripEnglishFromName 결과) — 고객아이디는 사원리스트 업로드 전엔 null일 수 있어
 * override 키로 쓰기엔 불안정하므로 쓰지 않는다.
 */
export type HectoCoinPaymentOverrides = Record<string, number>

/**
 * 수동 지급액 입력값 검증. 정수·0 이상만 허용(쉼표는 제거하고 처리), 지급상한을
 * 넘으면 저장을 막는다. 1차 지급액은 otherAppliedAmount=0으로 호출해 "이 금액 자체가
 * 상한을 넘지 않는지"만 보고, 추가 지급액은 otherAppliedAmount에 적용된 1차 지급액을
 * 넘겨 "적용된 1차 + 이 추가 금액"의 합이 상한을 넘지 않는지 함께 검증한다.
 */
export function validateHectoCoinOverrideAmount(
  raw: string, payCap: number | null, otherAppliedAmount: number,
): { ok: true; amount: number } | { ok: false; error: string } {
  const cleaned = raw.replace(/,/g, '').trim()
  if (!/^\d+$/.test(cleaned)) return { ok: false, error: '0 이상의 정수만 입력할 수 있습니다.' }
  const amount = Number(cleaned)
  if (!Number.isFinite(amount) || amount < 0) return { ok: false, error: '0 이상의 정수만 입력할 수 있습니다.' }
  if (payCap != null && otherAppliedAmount + amount > payCap) {
    return { ok: false, error: `지급상한 ${payCap.toLocaleString()}원을 초과할 수 없습니다.` }
  }
  return { ok: true, amount }
}

/**
 * 걸음수/포인트 수동 보정값 — { 정규화된이름: {steps, points} }. "지급액 수동 수정
 * (HectoCoinPaymentOverrides)"과는 완전히 다른 개념이다 — 이건 계산의 "원천 데이터"
 * (헥토코인 포인트 파일에 없는 사람의 걸음수/포인트)를 보정하는 것이고, 지급액 override는
 * 그렇게 계산된 지급액 자체를 관리자가 최종 보정하는 것이다. 우선순위: 수동 보정값 >
 * 업로드된 포인트 파일 값 > 데이터 없음. points는 실제 지급 계산에 쓰이므로 필수이고,
 * steps는 참고용이라 선택 입력(모르면 null로 둘 수 있다).
 */
export type HectoCoinDataOverrideEntry = { steps: number | null; points: number }
export type HectoCoinDataOverrides = Record<string, HectoCoinDataOverrideEntry>

/**
 * 수동 걸음수/포인트 입력값 검증. steps는 비어있으면 null(참고용이라 선택)로 허용하고,
 * points는 0 이상 정수 필수(쉼표 제거 후 처리) — 지급 계산 기준이므로 반드시 있어야 한다.
 */
export function validateHectoCoinDataOverride(
  rawSteps: string, rawPoints: string,
): { ok: true; entry: HectoCoinDataOverrideEntry } | { ok: false; error: string } {
  const cleanedPoints = rawPoints.replace(/,/g, '').trim()
  if (!/^\d+$/.test(cleanedPoints)) return { ok: false, error: '월 누적 포인트는 0 이상의 정수로 입력해주세요.' }
  const points = Number(cleanedPoints)
  if (!Number.isFinite(points) || points < 0) return { ok: false, error: '월 누적 포인트는 0 이상의 정수로 입력해주세요.' }

  const cleanedSteps = rawSteps.replace(/,/g, '').trim()
  let steps: number | null = null
  if (cleanedSteps) {
    if (!/^\d+$/.test(cleanedSteps)) return { ok: false, error: '월 누적 걸음수는 0 이상의 정수로 입력해주세요(비워두면 참고용 값 없이 저장됩니다).' }
    steps = Number(cleanedSteps)
    if (!Number.isFinite(steps) || steps < 0) return { ok: false, error: '월 누적 걸음수는 0 이상의 정수로 입력해주세요.' }
  }
  return { ok: true, entry: { steps, points } }
}

/**
 * 정산 대상 제외 — { 정규화된이름: true }. employees/사원리스트/원본 포인트 파일 등
 * 원본 데이터는 전혀 건드리지 않고, "선택한 정산월의 헥토코인 정산 목록에서만" 해당
 * 직원을 빼는 플래그다. computeHectoCoinEntries가 UNION으로 전체 대상자 목록을 만든
 * 뒤 마지막 단계에서 이 목록에 있는 이름만 걸러낸다 — 재업로드/재계산으로 UNION이
 * 다시 만들어져도 이 플래그가 없어지지 않는 한 계속 제외된 채로 유지된다. 정산월별로
 * hecto_coin_settlements 행에 저장되므로 다른 달에는 영향이 없다.
 */
export type HectoCoinExcludedEmployees = Record<string, true>

// ─── 사원리스트(고객아이디 매핑) ────────────────────────────────────────────────
// 정산월과 무관하게 유지되는 전역 매핑 — cafe_excel_data와 동일한 "singleton 1행"
// 패턴으로 hecto_coin_roster 테이블에 저장한다(app/page.tsx handleHectoRosterUpload 참고).
// source: 'upload'(사원리스트 엑셀 업로드로 채워짐) | 'manual'(헥토코인 정산 화면에서
// 관리자가 직접 입력) — 재업로드 시 'manual' 항목은 보존하고 'upload' 항목만 교체하기
// 위한 구분이다(mergeHectoCoinRosterOnUpload 참고). 기존에 저장된 데이터는 이 필드가
// 없을 수 있어 optional — 없으면 'upload'로 취급한다.
export type HectoCoinRosterEntry = { name: string; customerId: string; source?: 'upload' | 'manual' }
export type HectoCoinRosterRow = {
  id: string
  file_name: string | null
  uploaded_at: string | null
  entries: HectoCoinRosterEntry[] | null
}

const HECTO_CUSTOMER_ID_DOMAIN = '@hecto.co.kr'

/**
 * 고객아이디(메일주소) 수동 입력값 검증. 실제 사원리스트/employees.customer_id 데이터를
 * 확인한 결과(214건 전수 확인) 전부 '@hecto.co.kr' 도메인이라 이 도메인을 강제한다 —
 * 임의로 만든 규칙이 아니라 실제 운영 데이터를 그대로 반영한 것이다.
 */
export function validateHectoCoinCustomerId(raw: string): { ok: true; customerId: string } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: '고객아이디를 입력해주세요.' }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, error: '올바른 이메일 형식이 아닙니다.' }
  if (!trimmed.toLowerCase().endsWith(HECTO_CUSTOMER_ID_DOMAIN)) {
    return { ok: false, error: `고객아이디는 ${HECTO_CUSTOMER_ID_DOMAIN} 형식이어야 합니다.` }
  }
  return { ok: true, customerId: trimmed }
}

/**
 * 사원리스트를 재업로드할 때, 화면에서 직접 입력한(source==='manual') 매핑은 조용히
 * 사라지면 안 된다. 새로 업로드된 항목은 전부 source='upload'로 표시하고, 기존 'manual'
 * 항목은 이름이 겹치더라도(관리자가 의도적으로 고친 값이므로) 그대로 덮어써서 살려둔다.
 */
export function mergeHectoCoinRosterOnUpload(
  existingEntries: HectoCoinRosterEntry[], uploadedEntries: HectoCoinRosterEntry[],
): HectoCoinRosterEntry[] {
  const merged: HectoCoinRosterEntry[] = uploadedEntries.map(e => ({ name: e.name, customerId: e.customerId, source: 'upload' }))
  for (const manual of existingEntries.filter(e => e.source === 'manual')) {
    const idx = merged.findIndex(e => e.name === manual.name)
    if (idx >= 0) merged[idx] = manual
    else merged.push(manual)
  }
  return merged
}

/**
 * 헥토코인 정산 화면에서 직접 입력/수정한 고객아이디 1건을 사원리스트 매핑에 반영한다
 * (같은 이름의 기존 항목은 출처와 무관하게 교체 — 관리자가 지금 확정한 값이 우선).
 */
export function upsertHectoCoinRosterManualEntry(
  existingEntries: HectoCoinRosterEntry[], name: string, customerId: string,
): HectoCoinRosterEntry[] {
  const filtered = existingEntries.filter(e => e.name !== name)
  return [...filtered, { name, customerId, source: 'manual' }]
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
  // 정산월 안에서 실제로 발생한 입사/퇴사/휴직/복귀 이벤트가 하나라도 있는지 —
  // 헥토코인 포인트 파일에는 없는 직원이라도 이 값이 true면 정산 목록에 새로 추가한다
  // (computeHectoCoinEntries의 employees UNION 로직에서 사용).
  hasMonthEvent: boolean
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
    hasMonthEvent: joinedMid || returnedMid || leaveMid || exitMid,
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
    hasMonthEvent: false,
  }
}

// ─── 직원/고객아이디 매칭 ───────────────────────────────────────────────────────
export type HectoCoinEmployeeMatch =
  | { kind: 'matched'; emp: Employee }
  | { kind: 'not_found' }
  | { kind: 'duplicate' }

// employees.select('*')는 updated_at도 함께 내려오지만 공용 Employee 타입(lib/supabase.ts,
// 다른 기능들이 널리 참조)에는 선언돼 있지 않다 — 헥토코인 정산 전용 동명이인 판별에만
// 필요하므로 공용 타입을 건드리지 않고 이 파일 안에서만 느슨하게 읽는다.
type EmployeeWithUpdatedAt = Employee & { updated_at?: string }

/**
 * 동일 이름 레코드가 여러 건일 때 "실제로 운영 중인 유효 레코드"를 점수로 골라낸다.
 * 높은 점수를 주는 조건:
 *   - 고객아이디(customer_id)가 채워져 있다 — 실제 지급에 쓰이고 있다는 뚜렷한 신호
 *   - 현재 상태(퇴사/휴직/휴직복귀)에 맞는 예외 이벤트 날짜가 실제로 채워져 있다
 *     (예: 퇴사자인데 exit_date가 있다 = 이 레코드가 그 퇴사 처리를 담당) — 반대로
 *     "입사" 상태에 exit_date/customer_id도 없는 밋밋한 레코드는 과거에 만들어졌다가
 *     방치된 중복일 가능성이 높다.
 * 최고 점수 레코드가 유일하면 그걸 쓰고, 동점이면 최근 수정일(updated_at)로 한 번 더
 * 가른다. 그래도 갈리지 않으면(완전히 동일한 정보의 레코드가 2건 이상) 그때만 임의로
 * 고르지 않고 null을 반환해 호출부가 'duplicate'로 처리하게 한다.
 */
function pickValidEmployeeRecord(matches: Employee[]): Employee | null {
  const score = (e: Employee): number => {
    let s = 0
    if (e.customer_id?.trim()) s += 3
    if (e.status === 'resigned' && e.exit_date) s += 2
    if (e.status === 'active' && e.join_reason === '휴직' && e.exit_date) s += 2
    if (e.status === 'active' && e.join_reason === '휴직복귀' && e.join_date) s += 2
    return s
  }
  const scored = matches.map(e => ({ e, score: score(e) }))
  const maxScore = Math.max(...scored.map(s => s.score))
  const topByScore = scored.filter(s => s.score === maxScore)
  if (topByScore.length === 1) return topByScore[0].e

  const withUpdatedAt = topByScore
    .map(s => ({ ...s, updatedAt: (s.e as EmployeeWithUpdatedAt).updated_at ?? null }))
    .filter(s => s.updatedAt)
  if (withUpdatedAt.length > 0) {
    const maxUpdatedAt = withUpdatedAt.reduce((max, s) => (s.updatedAt! > max ? s.updatedAt! : max), withUpdatedAt[0].updatedAt!)
    const topByRecency = withUpdatedAt.filter(s => s.updatedAt === maxUpdatedAt)
    if (topByRecency.length === 1) return topByRecency[0].e
  }
  return null
}

/**
 * 정규화된 이름으로 employees를 매칭한다. employees는 전 직원 마스터가 아니라
 * "정산월 일할계산에 영향을 주는 입/퇴사·휴직·복귀 이벤트가 있는 사람만" 등록되어
 * 있으므로, 매칭 결과가 없어도(not_found) 오류가 아니다 — 호출부(buildEntry)가
 * "일할계산할 예외 정보 없음 = 정상재직"으로 취급한다.
 *
 * 동일 이름이 2명 이상이면 곧바로 duplicate 처리하지 않고 먼저 pickValidEmployeeRecord로
 * "실제로 운영 중인 유효 레코드"를 식별한다. 그렇게도 하나로 확정할 수 없는 진짜 동명이인만
 * 'duplicate'로 반환 — 호출부가 이 경우도 이벤트 정보 없음(정상재직)으로 기본 처리하되,
 * 화면에 확인 필요 표시를 남긴다(지급 자체를 막지는 않는다 — 그건 사원리스트/고객아이디의 몫).
 */
export function matchEmployeeByName(normalizedName: string, employees: Employee[]): HectoCoinEmployeeMatch {
  // employees.name도 헥토코인/사원리스트 쪽과 동일하게 내부 연속 공백을 하나로 정리한 뒤
  // 비교한다(양끝 공백만 지우는 trim()과 달리, 직원 DB에 실수로 들어간 이중 공백 등으로
  // 매칭이 조용히 실패하는 것을 막기 위함 — 영문 제거는 employees.name에는 적용하지 않는다).
  const matches = employees.filter(e => e.name.replace(/\s+/g, ' ').trim() === normalizedName)
  if (matches.length === 0) return { kind: 'not_found' }
  if (matches.length === 1) return { kind: 'matched', emp: matches[0] }
  const valid = pickValidEmployeeRecord(matches)
  if (valid) return { kind: 'matched', emp: valid }
  return { kind: 'duplicate' }
}

export type HectoCoinCustomerIdMatch =
  | { kind: 'matched'; customerId: string }
  | { kind: 'not_found' }
  | { kind: 'duplicate' }

/**
 * 고객아이디 매칭 우선순위: 1) 화면에서 직접 입력/수정한 사원리스트 매핑
 * (source==='manual') 2) 업로드된 사원리스트(source==='upload') 3) employees.customer_id
 * fallback. roster 배열 자체가 이름당 최대 1건만 유지하도록 저장 시점에 이미 정리되므로
 * (mergeHectoCoinRosterOnUpload/upsertHectoCoinRosterManualEntry 참고 — manual 항목이
 * 항상 upload 항목을 대체), 여기서는 source를 다시 따질 필요 없이 roster에서 찾은 값을
 * 그대로 최우선으로 쓰면 된다. 사원리스트에 동일 정규화 이름이 서로 다른 고객아이디로
 * 2건 이상 있으면(정상 상태라면 발생하지 않지만 방어적으로) 임의로 고르지 않고
 * 'duplicate' 반환.
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
// 'no_points_file' = 헥토코인 포인트 파일(1차/최종 어느 쪽에도)에는 이름이 없지만,
// employees에 이번 정산월 이벤트가 있어 정산 목록에 추가된 행(포인트 파일과 무관하게
// 직원 DB 이벤트만으로 생성됨).
export type HectoCoinPointsMatchStatus = 'first_only' | 'final_only' | 'matched' | 'no_points_file'

export type HectoCoinEntry = {
  key: string
  rawName: string    // 업로드 원본 이름(영문 제거 전)
  name: string        // 정규화된 이름(영문 제거) — 매칭/표시/지급 엑셀 B열에 사용
  company: string | null
  position: string | null
  steps: number | null   // 화면 단일 참고 컬럼(최종 적용 걸음수 우선, 없으면 1차 적용 걸음수)

  displayJoinDate: string | null
  displayReturnDate: string | null
  displayLeaveDate: string | null
  displayExitDate: string | null
  payableDays: number | null
  payCap: number | null

  // 1차 단계 — "지급액 수동 수정"(firstOverrideAmount)과는 별개인 "원천 데이터 수동 보정"
  firstStepsFile: number | null     // 1차 포인트 파일 원본 걸음수(파일에 없으면 null)
  firstPointsFile: number | null    // 1차 포인트 파일 원본 포인트(파일에 없으면 null)
  firstInPointsFile: boolean        // 1차 포인트 파일에 이 사람이 실제로 있었는지(보정값 여부와 무관)
  firstStepsManual: number | null   // 관리자가 직접 입력한 1차 걸음수(없으면 null)
  firstPointsManual: number | null  // 관리자가 직접 입력한 1차 포인트(없으면 null)
  firstDataIsManual: boolean        // 1차 데이터가 수동 보정값으로 적용되고 있는지
  firstPoints: number | null        // 적용된 1차 포인트 = firstPointsManual ?? firstPointsFile
  firstAutoAmount: number | null       // 자동 계산값(항상 보존 — 지급액 수동 수정과 비교용)
  firstOverrideAmount: number | null   // 지급액 수동 수정값(없으면 null)
  firstAmount: number | null           // 최종 적용 지급액 = firstOverrideAmount ?? firstAutoAmount

  // 최종 단계 — 위와 동일한 구조
  finalStepsFile: number | null
  finalPointsFile: number | null
  finalInPointsFile: boolean
  finalStepsManual: number | null
  finalPointsManual: number | null
  finalDataIsManual: boolean
  finalPoints: number | null        // 적용된 최종 포인트 = finalPointsManual ?? finalPointsFile
  finalAmount: number | null           // MIN(적용된 최종포인트, 지급상한) — 내부 계산용(지급액 수동수정 대상 아님)
  additionalAutoAmount: number | null  // 자동 계산값 = MAX(finalAmount - 적용된 1차 지급액, 0)
  additionalOverrideAmount: number | null
  additionalAmount: number | null      // 최종 적용값 = additionalOverrideAmount ?? additionalAutoAmount
  totalAmount: number | null           // 적용된 1차 + 적용된 추가

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
  firstOverrides: HectoCoinPaymentOverrides, additionalOverrides: HectoCoinPaymentOverrides,
  finalFileUploaded: boolean,
  firstDataOverrides: HectoCoinDataOverrides, additionalDataOverrides: HectoCoinDataOverrides,
): HectoCoinEntry {
  // first/final 둘 다 null일 수 있다 — 헥토코인 포인트 파일에는 없지만 employees 이벤트만
  // 있어 새로 추가된 행(no_points_file). 이 경우 company/position/steps는 포인트 파일에서
  // 가져올 데이터가 없으므로 전부 null로 둔다.
  const src = final ?? first ?? { name: rawName, company: null, position: null, steps: null, points: null }
  const pointsMatchStatus: HectoCoinPointsMatchStatus =
    first && final ? 'matched' : first ? 'first_only' : final ? 'final_only' : 'no_points_file'

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

  const validOverride = (v: unknown): number | null =>
    (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? v : null

  // ── 1차 단계: 걸음수/포인트 원천 데이터 우선순위 = 수동 보정값 > 업로드된 포인트
  // 파일 값. "지급액 수동 수정"(firstOverrides)과는 완전히 별개 — 이건 계산에 들어가는
  // 원재료(걸음수/포인트) 자체를 보정하는 것이다.
  const firstStepsFile = first?.steps ?? null
  const firstPointsFile = first?.points ?? null
  const firstInPointsFile = first != null
  const firstManualEntry = firstDataOverrides[name]
  const firstPointsManual = firstManualEntry ? validOverride(firstManualEntry.points) : null
  const firstStepsManual = firstManualEntry ? validOverride(firstManualEntry.steps) : null
  const firstDataIsManual = firstPointsManual != null
  const firstPoints = firstPointsManual ?? firstPointsFile

  // no_points_file(포인트 파일 어디에도 없는 직원DB 전용 행)은 1차 파일이 이미 확정
  // 업로드된 상태에서 "그 안에 이 사람이 없다"는 사실 자체가 확정 정보이므로, 수동
  // 보정값도 없다면 1차 지급액을 0으로 확정한다(포인트/걸음수 칸은 '-'로 남기되 지급액은
  // 명확히 0원) — 관리자가 직접 걸음수/포인트를 입력하면 위 firstPoints가 그 값을 쓰므로
  // 이 0-fallback 이전에 이미 정상적으로 MIN(입력포인트, 지급상한)으로 계산된다.
  const firstAutoAmount = payCap == null ? null
    : firstPoints != null ? Math.min(firstPoints, payCap)
    : pointsMatchStatus === 'no_points_file' ? 0 : null
  // 지급액 수동 수정은 "자동 계산값이 존재하는(=실제 지급 계산이 가능한) 사람"에게만
  // 의미가 있다 — 포인트파일 중복/동명이인처럼 자동 계산 자체가 없는 행에는 적용하지
  // 않는다(어차피 화면에서도 편집 UI를 노출하지 않는다).
  const firstOverrideAmount = firstAutoAmount != null ? validOverride(firstOverrides[name]) : null
  const firstAmount = firstOverrideAmount ?? firstAutoAmount

  // ── 최종 단계 — 1차와 동일한 구조 ──
  const finalStepsFile = final?.steps ?? null
  const finalPointsFile = final?.points ?? null
  const finalInPointsFile = final != null
  const finalManualEntry = additionalDataOverrides[name]
  const finalPointsManual = finalManualEntry ? validOverride(finalManualEntry.points) : null
  const finalStepsManual = finalManualEntry ? validOverride(finalManualEntry.steps) : null
  const finalDataIsManual = finalPointsManual != null
  const finalPoints = finalPointsManual ?? finalPointsFile

  // 최종 쪽은 1차와 달리 "최종 파일이 이번 정산월에 아직 한 번도 업로드되지 않았다면"
  // 여전히 미확정(null → 화면 '미정산')으로 남겨둔다 — 최종 파일이 실제로 업로드된 뒤에도
  // 이 사람이 여전히 없을 때만(그리고 수동 보정값도 없을 때만) 0으로 확정한다(1차처럼
  // "이미 끝난 파일에 없다"는 확정 사실이 되기 때문). finalFileUploaded는 이번 정산월에
  // 최종 파일이 한 번이라도 올라왔는지를 뜻한다.
  const finalAmount = payCap == null ? null
    : finalPoints != null ? Math.min(finalPoints, payCap)
    : (pointsMatchStatus === 'no_points_file' && finalFileUploaded) ? 0 : null
  // 추가 지급액 자동 계산은 "적용된(수동 수정 반영된) 1차 지급액" 기준으로 다시 계산한다 —
  // 1차를 수동 수정하면 추가 지급 자동계산도 함께 갱신되어야 하기 때문.
  const additionalAutoAmount = (finalAmount != null && firstAmount != null) ? Math.max(finalAmount - firstAmount, 0) : null
  const additionalOverrideAmount = additionalAutoAmount != null ? validOverride(additionalOverrides[name]) : null
  const additionalAmount = additionalOverrideAmount ?? additionalAutoAmount
  const totalAmount = firstAmount != null ? firstAmount + (additionalAmount ?? 0) : null

  // 화면 "월 누적 걸음수" 단일 참고 컬럼 — 최종 적용 걸음수 우선, 없으면 1차 적용 걸음수
  // (기존 "final ?? first" 우선순위를 적용된 값 기준으로 그대로 유지).
  const steps = (finalStepsManual ?? finalStepsFile) ?? (firstStepsManual ?? firstStepsFile)

  return {
    key, rawName, name, company: src.company, position: src.position, steps,
    displayJoinDate, displayReturnDate, displayLeaveDate, displayExitDate,
    payableDays, payCap,
    firstStepsFile, firstPointsFile, firstInPointsFile, firstStepsManual, firstPointsManual, firstDataIsManual,
    firstPoints, firstAutoAmount, firstOverrideAmount, firstAmount,
    finalStepsFile, finalPointsFile, finalInPointsFile, finalStepsManual, finalPointsManual, finalDataIsManual,
    finalPoints, finalAmount, additionalAutoAmount, additionalOverrideAmount, additionalAmount, totalAmount,
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
  firstOverrides: HectoCoinPaymentOverrides = {},
  additionalOverrides: HectoCoinPaymentOverrides = {},
  firstDataOverrides: HectoCoinDataOverrides = {},
  additionalDataOverrides: HectoCoinDataOverrides = {},
  excludedEmployees: HectoCoinExcludedEmployees = {},
): HectoCoinEntry[] {
  const firstByName = groupByNormalizedName(firstRows)
  const finalByName = groupByNormalizedName(finalRows)
  const names = new Set<string>([...firstByName.keys(), ...finalByName.keys()])
  const finalFileUploaded = finalRows.length > 0
  const entries: HectoCoinEntry[] = []

  for (const name of names) {
    const firsts = firstByName.get(name) ?? []
    const finals = finalByName.get(name) ?? []
    if (firsts.length > 1 || finals.length > 1) {
      firsts.forEach((r, i) => entries.push(buildEntry(settlementMonth, `${name}__1__${i}`, name, r.name, r, null, true, employees, roster, firstOverrides, additionalOverrides, finalFileUploaded, firstDataOverrides, additionalDataOverrides)))
      finals.forEach((r, i) => entries.push(buildEntry(settlementMonth, `${name}__2__${i}`, name, r.name, null, r, true, employees, roster, firstOverrides, additionalOverrides, finalFileUploaded, firstDataOverrides, additionalDataOverrides)))
      continue
    }
    const first = firsts[0] ?? null
    const final = finals[0] ?? null
    const rawName = (final ?? first)!.name
    entries.push(buildEntry(settlementMonth, name, name, rawName, first, final, false, employees, roster, firstOverrides, additionalOverrides, finalFileUploaded, firstDataOverrides, additionalDataOverrides))
  }

  // 헥토코인 포인트 파일에는 이름이 없지만, employees에 이번 정산월 입사/퇴사/휴직/복귀
  // 이벤트가 있는 직원도 UNION으로 추가한다(요청 사양: 대상자 목록 = 포인트 파일 직원
  // ∪ 정산월 employees 이벤트 직원). 정규화 이름 기준으로 포인트 파일에 이미 있는 이름은
  // 건너뛰고, employees 안의 중복 이름도 한 번만 처리한다. 동명이인이라 어느 레코드의
  // 이벤트를 적용할지 확정할 수 없는 경우(matchEmployeeByName이 duplicate 반환)는 임의로
  // 행을 만들지 않는다 — 이 사람은 나중에 헥토코인 포인트 파일에 등장하면 그때 정상적으로
  // 처리된다. 정산월과 무관한 과거 이벤트만 있는 직원(hasMonthEvent=false)도 추가하지 않는다.
  const seenEmployeeOnlyNames = new Set<string>()
  for (const emp of employees) {
    const empName = emp.name.replace(/\s+/g, ' ').trim()
    if (!empName || names.has(empName) || seenEmployeeOnlyNames.has(empName)) continue
    seenEmployeeOnlyNames.add(empName)
    const employeeMatch = matchEmployeeByName(empName, employees)
    if (employeeMatch.kind !== 'matched') continue
    if (!calcHectoCoinFromEmployee(employeeMatch.emp, settlementMonth).hasMonthEvent) continue
    entries.push(buildEntry(settlementMonth, empName, empName, emp.name, null, null, false, employees, roster, firstOverrides, additionalOverrides, finalFileUploaded, firstDataOverrides, additionalDataOverrides))
  }

  // 정산 대상 제외 — 항상 UNION(포인트 파일 ∪ employees 이벤트)이 전부 만들어진 뒤
  // 마지막에 적용한다. 그래야 재업로드/재계산으로 UNION이 다시 만들어져도 제외 플래그가
  // 있는 사람은 다시 나타나지 않는다(요청 사양의 순서: UNION → excluded 제거 → 최종 목록).
  const visible = entries.filter(e => !excludedEmployees[e.name])
  return visible.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}

export function hectoCoinFilename(settlementMonth: string, kind: 'first' | 'additional'): string {
  const [y, m] = settlementMonth.split('-')
  return `헥토코인_${kind === 'first' ? '1차지급' : '추가지급'}_${y}년_${m}월.xlsx`
}

// ─── 정산 상세 엑셀(검토/보관용 — 실제 지급 업로드용 엑셀과 완전히 별개) ────────────
// 화면 "정산 상세 엑셀 다운로드"용. 지급용 엑셀(1차/추가)은 고객아이디 매칭된 지급
// 대상자만 담지만, 이 파일은 화면에 보이는 전체 행(고객아이디 미매칭/동명이인/휴직 등
// 포함)을 그대로 담아 월 전체 정산 내역을 검토·보관할 수 있게 한다. ExcelJS로 새
// workbook을 만드는 부분(스타일/시트 구성)은 exceljs가 Node 전용이라 이 파일이 아니라
// app/api/hecto-coin-detail-excel/route.ts(서버 전용)에 둔다 — lib/hecto-coin.ts는
// 클라이언트(app/page.tsx)에서도 import하므로 exceljs 의존성을 여기 들이지 않는다.

/** 화면 "상태" 컬럼 + "고객아이디" 컬럼이 보여주는 상태/사유 정보를 한 문자열로 합친다
 *  — 상세 엑셀 O열에 그대로 쓰기 위함(화면에 흩어진 정보를 검토용 문서 한 칸에 정리). */
export function hectoCoinStatusText(e: HectoCoinEntry): string {
  const parts: string[] = [e.excludeReason ?? e.statusLabel]
  if (e.pointsMatchStatus === 'final_only') parts.push('1차 미매칭')
  else if (e.pointsMatchStatus === 'first_only') parts.push('최종 미정산')
  else if (e.pointsMatchStatus === 'no_points_file') {
    parts.push(e.firstDataIsManual ? '포인트 파일 미포함(수동입력 적용)' : '포인트 파일 미포함')
  }
  if (e.firstDataIsManual) parts.push('1차 데이터 수동입력')
  if (e.finalDataIsManual) parts.push('최종 데이터 수동입력')
  if (e.employeeMatch === 'duplicate') parts.push('직원DB 동명이인 확인필요')
  if (e.customerIdMatch === 'duplicate') parts.push('고객아이디 동명이인 확인필요')
  else if (e.customerIdMatch === 'not_found') parts.push('고객아이디 미매칭')
  return parts.join(' · ')
}

export type HectoCoinDetailRow = {
  name: string
  customerId: string | null
  displayJoinDate: string | null
  displayExitDate: string | null
  displayLeaveDate: string | null
  displayReturnDate: string | null
  steps: number | null
  payableDays: number | null
  payCap: number | null
  firstPoints: number | null
  firstAmount: number | null
  finalPoints: number | null
  additionalAmount: number | null
  totalAmount: number | null
  statusText: string
  pointsMatchStatus: HectoCoinPointsMatchStatus
  firstOverrideAmount: number | null
  firstAutoAmount: number | null
  additionalOverrideAmount: number | null
  additionalAutoAmount: number | null
  firstDataIsManual: boolean       // 1차 걸음수/포인트 수동입력 여부(Y/N)
  finalDataIsManual: boolean       // 최종 걸음수/포인트 수동입력 여부(Y/N)
}

/** HectoCoinEntry(화면에 쓰이는 전체 계산 결과) → 상세 엑셀 전송용 단순 row.
 *  화면과 값이 반드시 같아야 하므로 화면이 쓰는 필드를 그대로 옮겨 담기만 한다. */
export function toHectoCoinDetailRow(e: HectoCoinEntry): HectoCoinDetailRow {
  return {
    name: e.name, customerId: e.customerId,
    displayJoinDate: e.displayJoinDate, displayExitDate: e.displayExitDate,
    displayLeaveDate: e.displayLeaveDate, displayReturnDate: e.displayReturnDate,
    steps: e.steps, payableDays: e.payableDays, payCap: e.payCap,
    firstPoints: e.firstPoints, firstAmount: e.firstAmount,
    finalPoints: e.finalPoints, additionalAmount: e.additionalAmount, totalAmount: e.totalAmount,
    statusText: hectoCoinStatusText(e), pointsMatchStatus: e.pointsMatchStatus,
    firstOverrideAmount: e.firstOverrideAmount, firstAutoAmount: e.firstAutoAmount,
    additionalOverrideAmount: e.additionalOverrideAmount, additionalAutoAmount: e.additionalAutoAmount,
    firstDataIsManual: e.firstDataIsManual, finalDataIsManual: e.finalDataIsManual,
  }
}

export type HectoCoinDetailSummary = {
  settlementMonth: string
  firstCount: number
  firstTotal: number
  additionalCount: number
  additionalTotal: number
  finalTotal: number
  customerIdMatchedCount: number
  customerIdUnmatchedCount: number
  excludedCount: number   // 정산 대상에서 제외된 인원 — 상세 엑셀 정산요약 시트에만 표시(제외자 행 자체는 상세 엑셀에 넣지 않음)
}

export function hectoCoinDetailFilename(settlementMonth: string): string {
  return `헥토코인_정산상세_${settlementMonth}.xlsx`
}
