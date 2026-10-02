import * as XLSX from 'xlsx'
import type { Employee } from './supabase'
import { buildXlsxWorkbook } from './wellness-mail'
import { stripEnglishFromName } from './hecto-coin'

// ─── 웰니스코인 환수 — 기존 웰니스코인 지급 기능(lib/wellness-mail.ts, lib/wellness-coin.ts)과
// 완전히 분리된 별도 기능이다. 지급은 employees 테이블의 입사/퇴사일로부터 금액을 직접
// 계산하지만, 환수는 헥토에서 받는 별도 웰니스 엑셀 파일에 "환수"로 표시된 금액이 있는
// 직원만 추출해서 보여준다 — 계산 공식이 아니라 업로드된 원본 금액을 그대로 쓴다.
// 이 파일을 추가/수정해도 지급 쪽 파일/로직은 전혀 건드리지 않는다.

export type WellnessReclaimRawRow = { name: string; amount: number }

function normalizeReclaimHeader(s: unknown): string {
  return String(s ?? '').replace(/\s+/g, '').replace(/[()（）[\]]/g, '')
}
function parseReclaimAmount(v: unknown): number | null {
  if (v === '' || v == null) return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}

/**
 * 성명 컬럼 판정 — 정확히 "성명"/"이름"일 때만이 아니라 "성명(국문)", "직원명", "이름(한글)"
 * 처럼 다른 글자가 섞인 실제 현업 엑셀 헤더도 인식하도록 부분일치로 판정한다("환수"
 * 컬럼 판정과 동일한 방식). 과거 정확히 일치(exact match)만 허용했을 때 실제 업로드
 * 파일의 헤더가 조금만 달라도 "성명(이름) 컬럼을 찾을 수 없습니다" 에러로 파싱 자체가
 * 실패해 업로드가 DB에 저장조차 되지 않는 문제가 있었다.
 */
function isReclaimNameHeader(norm: string): boolean {
  return norm.includes('성명') || norm.includes('이름')
}

/**
 * 헥토에서 받는 웰니스 관련 엑셀에서 성명 + "환수" 문구가 포함된 금액 컬럼만 찾아
 * 파싱한다. 성명/환수금액 외 다른 컬럼은 전부 무시. 환수 금액이 없거나 0원 이하인
 * 행은 제외. 동일 직원이 여러 줄에 걸쳐 있으면 금액을 합산해 1명당 1건으로 정리한다
 * (요청 사양: "직원 1명당 1건으로 정리" — 여러 줄은 서로 다른 환수 사유의 별개
 * 항목으로 보고 합산한다).
 */
export function parseWellnessReclaimExcelFile(buffer: ArrayBuffer): { rows: WellnessReclaimRawRow[] } {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('엑셀 시트를 찾을 수 없습니다.')
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

  // 실제 업로드 파일에 안내/제목 등 전치 행이 여러 줄 있을 수 있어 넉넉하게(20행) 스캔한다.
  let headerRow = -1
  let col = { name: -1, reclaim: -1 }
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const row = rows[r] as unknown[]
    const found = { name: -1, reclaim: -1 }
    row.forEach((cell, c) => {
      const norm = normalizeReclaimHeader(cell)
      if (!norm) return
      if (found.name === -1 && isReclaimNameHeader(norm)) found.name = c
      if (found.reclaim === -1 && norm.includes('환수')) found.reclaim = c
    })
    if (found.name !== -1 && found.reclaim !== -1) { headerRow = r; col = found; break }
  }
  if (headerRow === -1 || col.name === -1) throw new Error('성명(이름) 컬럼을 찾을 수 없습니다. 엑셀 상단 헤더 행에 "성명" 또는 "이름"이 포함된 컬럼이 있는지 확인해주세요.')
  if (col.reclaim === -1) throw new Error('"환수"가 포함된 금액 컬럼을 찾을 수 없습니다. 엑셀 상단 헤더 행에 "환수"라는 글자가 포함된 컬럼이 있는지 확인해주세요.')

  const parsedRaw: WellnessReclaimRawRow[] = []
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[]
    const name = String(row[col.name] ?? '').trim()
    if (!name) continue
    const amount = parseReclaimAmount(row[col.reclaim])
    if (amount === null || amount <= 0) continue // 환수 금액 없음/0원 → 정상적으로 제외
    parsedRaw.push({ name, amount })
  }
  if (parsedRaw.length === 0) throw new Error('환수 대상(환수 금액이 있는 직원)이 없습니다.')

  const byName = new Map<string, number>()
  for (const r of parsedRaw) {
    const key = stripEnglishFromName(r.name)
    if (!key) continue
    byName.set(key, (byName.get(key) ?? 0) + r.amount)
  }
  const rowsOut = Array.from(byName.entries()).map(([name, amount]) => ({ name, amount }))
  return { rows: rowsOut }
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

/** 화면/메일 표시용 "M.D"(연도·0패딩 없음) — "이름_M.D" 포맷에 사용 */
export function formatMonthDayLabel(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}.${d}`
}

export type WellnessReclaimEntry = {
  emp: Employee
  amount: number
  recoupDate: string // 'YYYY-MM-DD' — 퇴사일 + 1일
  mailKey: string
}
export type WellnessReclaimUnmatched = { name: string; amount: number; reason: string }

/**
 * 화면에 "먼저" 보여줄 행 — 지급 탭이 퇴사자 카드를 먼저 보여주고 그 위에 계산값을
 * 얹는 것과 동일한 구조다. amount/recoupDate는 업로드된 환수 엑셀과 이름이 매칭될
 * 때만 채워지고(reclaimable=true), 매칭이 안 되거나 환수 엑셀을 아직 올리지 않았으면
 * amount=null(= "환수 없음")로 표시하되 퇴사자 본인은 화면 목록에서 빠지지 않는다.
 */
export type WellnessReclaimDisplayRow = {
  emp: Employee
  amount: number | null        // null = 환수 대상 아님("환수 없음")
  recoupDate: string | null    // amount>0이고 퇴사일이 있을 때만 값
  reclaimable: boolean         // 체크 가능 여부 = amount>0 && recoupDate 계산 가능
  mailKey: string
}

/**
 * employees 테이블의 퇴사자(status==='resigned') 전체를 기준으로 화면 목록을 구성하고,
 * 업로드된 환수 엑셀(rawRows)과 이름으로 매칭되는 사람만 환수금액을 함께 보여준다
 * (요청 사양: "퇴사자 전체 목록 표시 → 환수 엑셀과 이름 매칭 → 환수금액 있는 직원만
 * 선택 가능"). 엑셀 쪽 이름이 퇴사자 명단 어디에도 매칭되지 않는 행은 unmatched로
 * 따로 반환해 관리자가 엑셀 쪽 오타/누락을 확인할 수 있게 한다.
 */
export function buildWellnessReclaimDisplayRows(
  employees: Employee[],
  rawRows: WellnessReclaimRawRow[],
): { rows: WellnessReclaimDisplayRow[]; unmatched: WellnessReclaimUnmatched[] } {
  const resigned = employees.filter(e => e.status === 'resigned')
  const resignedKeys = new Set(resigned.map(e => stripEnglishFromName(e.name)).filter(Boolean))

  const amountByName = new Map<string, number>()
  const unmatched: WellnessReclaimUnmatched[] = []
  for (const r of rawRows) {
    const key = stripEnglishFromName(r.name)
    if (!key) continue
    if (!resignedKeys.has(key)) {
      unmatched.push({ name: r.name, amount: r.amount, reason: '퇴사자(status=resigned) 명단에서 이름을 찾을 수 없습니다.' })
      continue
    }
    amountByName.set(key, r.amount)
  }

  const rows: WellnessReclaimDisplayRow[] = resigned.map(emp => {
    const key = stripEnglishFromName(emp.name)
    const amount = amountByName.get(key) ?? null
    const recoupDate = (amount != null && amount > 0 && emp.exit_date) ? addOneDayToDateStr(emp.exit_date) : null
    const reclaimable = amount != null && amount > 0 && recoupDate != null
    return { emp, amount, recoupDate, reclaimable, mailKey: `reclaim_wellness_${emp.id}` }
  })
  return { rows, unmatched }
}

/** display row 중 실제로 체크/메일/다운로드가 가능한(환수금액>0 + 회수일자 계산 가능) 건만 추려 WellnessReclaimEntry로 변환 */
export function reclaimableEntries(rows: WellnessReclaimDisplayRow[]): WellnessReclaimEntry[] {
  return rows
    .filter(r => r.reclaimable && r.amount != null && r.recoupDate != null)
    .map(r => ({ emp: r.emp, amount: r.amount as number, recoupDate: r.recoupDate as string, mailKey: r.mailKey }))
}

export function sumWellnessReclaimAmount(entries: WellnessReclaimEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0)
}

/** 환수 엑셀 행(다운로드/메일 첨부 공용) — 화면 체크 대상과 항상 동일한 내용이 되도록
 * 다운로드 버튼과 메일 첨부 생성(app/api/wellness-reclaim-mail) 양쪽이 이 함수를 그대로 쓴다. */
export function buildWellnessReclaimExcelRows(entries: WellnessReclaimEntry[]): Record<string, unknown>[] {
  return entries.map(({ emp, amount, recoupDate }) => ({
    '성명': emp.name,
    '퇴사일': emp.exit_date ?? '-',
    '회수일자': recoupDate,
    '환수금액': amount,
  }))
}

export function wellnessReclaimMailAttachmentFilename(d: Date = new Date()): string {
  const yyyymm = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`
  return `웰니스코인_환수요청_${yyyymm}.xlsx`
}

/** 메일 첨부용 xlsx Buffer 생성 — app/api/wellness-reclaim-mail 전용(서버에서 호출) */
export function buildWellnessReclaimWorkbookBuffer(entries: WellnessReclaimEntry[]): Buffer {
  if (entries.length === 0) throw new Error('첨부할 환수 대상자가 없습니다.')
  const rows = buildWellnessReclaimExcelRows(entries)
  const wb = buildXlsxWorkbook(rows, '환수내역')
  const out = XLSX.write(wb, { type: 'buffer' })
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer)
}
