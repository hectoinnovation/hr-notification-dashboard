'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import { supabase, type Employee } from '@/lib/supabase'

// ─── 온보딩 단계 ──────────────────────────────────────────────────────────────
const STAGES = [
  { id: 's1',  label: '레몬베이스 계정 생성',             timing: '입사 전',        targets: ['인사팀'],             highlight: false },
  { id: 's2',  label: '리더 면담 및 목표 설정',           timing: '입사 후',         targets: ['입사자', '리더'],     highlight: false },
  { id: 's3',  label: '레몬베이스 목표/가중치 승인 신청', timing: '입사 후 7일 내',  targets: ['인사담당자', '팀장'], highlight: true  },
  { id: 's4',  label: '레몬베이스 최종 확인',             timing: '입사 후',         targets: ['인사팀'],             highlight: false },
  { id: 's5',  label: '5 Missions PT 미션지 전달',        timing: 'D-7',             targets: ['입사자'],             highlight: false },
  { id: 's6',  label: '미션지 작성 및 재전달',            timing: 'D-1',             targets: ['입사자'],             highlight: false },
  { id: 's7',  label: '미션 공개',                        timing: 'D-Day',           targets: ['전사'],               highlight: false },
  { id: 's8',  label: 'PT 참석자 안내 및 일정 조율',      timing: 'D+50',            targets: ['PT 참석자'],          highlight: false },
  { id: 's9',  label: 'PT 진행',                          timing: 'D+60',            targets: ['입사자', '참석자'],   highlight: false },
  { id: 's10', label: '현업 부서장 주관 심사',            timing: 'D+63',            targets: ['부서장'],             highlight: false },
  { id: 's11', label: '대표이사 최종 결정',               timing: 'D+65',            targets: ['대표이사'],           highlight: false },
  { id: 's12', label: '시용평가 일정 및 완료 관리',       timing: '별도 일정',       targets: ['인사팀', '입사자'],   highlight: false },
]

type Recipient = { email: string; label: string }
const FR = {
  hire:     [{ email: 't_10010300@hecto.co.kr', label: '협업지원실' }] as const,
  leave:    [{ email: 't_10010300@hecto.co.kr', label: '협업지원실' }, { email: 't_849fm@hecto.co.kr', label: '보안인프라팀' }] as const,
  onboard:  [{ email: 'inno_hm@hecto.co.kr',   label: '인재협업팀' }] as const,
  cafe:     [{ email: 'story2110@hecto.co.kr',  label: '임대현 책임' }] as const,
  wellness: [{ email: 'yhj@hecto.co.kr',        label: '유현주 책임' }] as const,
}

interface EmployeeForm {
  name: string; join_date: string; leave_date: string
  department: string; division: string; team: string; leader: string
  join_reason: string; status: 'active' | 'resigned'
}
const EMPTY_FORM: EmployeeForm = {
  name: '', join_date: '', leave_date: '',
  department: '', division: '', team: '', leader: '',
  join_reason: '입사', status: 'active',
}
const PAGE_SIZE = 10

interface DayPointData { totalPoints: number; settlementPoints: number }
interface ExcelSheetData {
  hire:  Record<number, DayPointData>
  leave: Record<number, DayPointData>
}
type NotifyEntry = { emp: Employee; type: 'hire' | 'leave'; mailKey: string }
type PointEntry  = { emp: Employee; empType: 'hire' | 'leave'; mailKey: string }

// ─── 유틸 ─────────────────────────────────────────────────────────────────────
function formatMonth(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}
function normalizeCell(s: string) {
  return s.replace(/\s+/g, '').replace(/[()（）[\]]/g, '')
}
function getDateLabel(type: 'hire' | 'leave', isTransfer: boolean): string {
  if (isTransfer) return '전적일'
  return type === 'hire' ? '입사일' : '퇴사일'
}

function parseExcelFile(buffer: ArrayBuffer): Record<number, ExcelSheetData> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const result: Record<number, ExcelSheetData> = {}
  for (let m = 1; m <= 12; m++) {
    const ws = wb.Sheets[`${m}월`]
    if (!ws) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })

    function findTitlePos(title: string): { row: number; col: number } | null {
      const norm = normalizeCell(title)
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r] as unknown[]
        for (let c = 0; c < row.length; c++) {
          if (normalizeCell(String(row[c] ?? '')).includes(norm)) return { row: r, col: c }
        }
      }
      return null
    }
    const hirePos  = findTitlePos('입사자 기준')
    const leavePos = findTitlePos('퇴사자 기준')
    const hireStartCol  = hirePos?.col  ?? 0
    const leaveStartCol = leavePos?.col ?? Infinity

    function extractTable(titlePos: { row: number; col: number } | null, colStart: number, colEnd: number): Record<number, DayPointData> {
      const map: Record<number, DayPointData> = {}
      if (!titlePos) { console.log(`[Excel] ${m}월: 헤더 없음`); return map }
      let headerRow = -1, dayCol = -1, totalCol = -1, settleCol = -1
      for (let r = titlePos.row + 1; r < Math.min(titlePos.row + 7, rows.length); r++) {
        const row = rows[r] as unknown[]
        for (let c = colStart; c < Math.min(row.length, colEnd); c++) {
          const cell = normalizeCell(String(row[c] ?? ''))
          if (dayCol === -1 && (cell === '일자' || cell === '날짜' || cell.includes('입사일') || cell.includes('퇴사일'))) { dayCol = c; headerRow = r }
          if (cell.includes('총') && cell.includes('부여')) totalCol = c
          if (cell.includes('정산포인트')) settleCol = c
        }
        if (headerRow !== -1) break
      }
      if (headerRow === -1) { console.log(`[Excel] ${m}월: 컬럼헤더 없음`); return map }
      for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r] as unknown[]
        const raw = row[dayCol]
        if (raw === '' || raw == null) break
        const day = parseInt(String(raw))
        if (isNaN(day) || day < 1 || day > 31) break
        map[day] = {
          totalPoints:      totalCol  !== -1 ? (Number(row[totalCol])  || 0) : 0,
          settlementPoints: settleCol !== -1 ? (Number(row[settleCol]) || 0) : 0,
        }
      }
      console.log(`[Excel] ${m}월 col(${colStart}~): ${Object.keys(map).length}개`)
      return map
    }
    result[m] = {
      hire:  extractTable(hirePos,  hireStartCol,  leaveStartCol),
      leave: extractTable(leavePos, leaveStartCol, Infinity),
    }
  }
  return result
}

function lookupExcelPoints(excelData: Record<number, ExcelSheetData>, dateStr: string | null, type: 'hire' | 'leave'): DayPointData | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  const m = d.getMonth() + 1
  const day = d.getDate()
  const sheet = excelData[m]
  if (!sheet) { console.log(`[포인트] ${m}월 시트 없음`); return null }
  const result = sheet[type][day] ?? null
  console.log(`[포인트] ${m}월 ${type==='hire'?'입사자':'퇴사자'} ${day}일 →`, result ?? '없음')
  return result
}

// ─── 메일 API ─────────────────────────────────────────────────────────────────
async function sendMailApi(to: string[], subject: string, html: string): Promise<string | null> {
  try {
    const res = await fetch('/api/send-mail', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    })
    if (!res.ok) {
      const data = await res.json() as { error?: string }
      return data.error ?? '메일 발송 실패'
    }
    return null
  } catch (err) {
    return err instanceof Error ? err.message : '네트워크 오류'
  }
}

// ─── HTML 생성 ────────────────────────────────────────────────────────────────
const TS = 'border-collapse:collapse;font-family:sans-serif;font-size:14px'
const TH = 'background:#fff7ed;border:1px solid #fed7aa;padding:8px 12px;text-align:left;white-space:nowrap'
const TD = 'border:1px solid #e5e7eb;padding:8px 12px;white-space:nowrap'

function makeNotifHtml(emp: Employee, type: 'hire' | 'leave') {
  const isTransfer = type === 'hire' && emp.join_reason === '전적'
  const dateLabel  = getDateLabel(type, isTransfer)
  const date       = (type === 'hire' ? emp.join_date : emp.leave_date) ?? '-'
  const label      = isTransfer ? '전적' : (type === 'hire' ? '입사' : '퇴사')
  return `<h3 style="color:#ea580c">[인사 알림] ${emp.name} 님 ${label}</h3>
<table style="${TS}"><tr><th style="${TH}">${dateLabel}</th><th style="${TH}">부서</th><th style="${TH}">실</th><th style="${TH}">팀</th><th style="${TH}">이름</th><th style="${TH}">구분</th></tr>
<tr><td style="${TD}">${date}</td><td style="${TD}">${emp.department??'-'}</td><td style="${TD}">${emp.division??'-'}</td><td style="${TD}">${emp.team??'-'}</td><td style="${TD}">${emp.name}</td><td style="${TD}">${label}</td></tr></table>`
}
function makeOnboardingHtml(hireName: string, stageLabel: string) {
  return `<h3 style="color:#ea580c">[온보딩] ${hireName} — ${stageLabel}</h3><p style="font-family:sans-serif;font-size:14px;color:#374151">위 온보딩 단계 진행 요청드립니다.</p>`
}
function makeCafeHtml(emp: Employee, type: 'hire' | 'leave', points: DayPointData | null, isTransfer: boolean) {
  const 구분 = isTransfer ? '전적' : (type === 'leave' ? '퇴사' : (emp.join_reason ?? '입사'))
  const dateLabel = getDateLabel(type, isTransfer)
  const date = (type === 'hire' ? emp.join_date : emp.leave_date) ?? '-'
  if (isTransfer) {
    return `<h3 style="color:#ea580c">[카페포인트] 전적 안내 — ${emp.name}</h3>
<table style="${TS}"><tr><th style="${TH}">${dateLabel}</th><th style="${TH}">부서</th><th style="${TH}">실</th><th style="${TH}">팀</th><th style="${TH}">이름</th><th style="${TH}">구분</th></tr>
<tr><td style="${TD}">${date}</td><td style="${TD}">${emp.department??'-'}</td><td style="${TD}">${emp.division??'-'}</td><td style="${TD}">${emp.team??'-'}</td><td style="${TD}">${emp.name}</td><td style="${TD}">${구분}</td></tr></table>
<p style="font-family:sans-serif;font-size:13px;color:#6b7280;margin-top:12px">※ 전적자는 카페포인트 계산 대상이 아닙니다.</p>`
  }
  const total  = points ? points.totalPoints.toLocaleString() + 'P' : '-'
  const settle = points ? points.settlementPoints.toLocaleString() + 'P' : '-'
  return `<h3 style="color:#ea580c">[카페포인트 ${type==='hire'?'안내':'정산'}] ${emp.name}</h3>
<table style="${TS}"><tr><th style="${TH}">${dateLabel}</th><th style="${TH}">부서</th><th style="${TH}">실</th><th style="${TH}">팀</th><th style="${TH}">이름</th><th style="${TH}">구분</th><th style="${TH}">총 부여포인트</th><th style="${TH}">정산포인트(P)</th></tr>
<tr><td style="${TD}">${date}</td><td style="${TD}">${emp.department??'-'}</td><td style="${TD}">${emp.division??'-'}</td><td style="${TD}">${emp.team??'-'}</td><td style="${TD}">${emp.name}</td><td style="${TD}">${구분}</td><td style="${TD}">${total}</td><td style="${TD}">${settle}</td></tr></table>`
}
function makeWellnessHtml(emp: Employee, type: 'hire' | 'leave', isTransfer: boolean) {
  const 사유 = isTransfer ? '전적' : (type === 'leave' ? '퇴사' : (emp.join_reason ?? '입사'))
  const dateLabel = getDateLabel(type, isTransfer)
  const date = (type === 'hire' ? emp.join_date : emp.leave_date) ?? '-'
  return `<h3 style="color:#ea580c">[웰니스포인트 ${isTransfer?'전적':type==='hire'?'안내':'정산'}] ${emp.name}</h3>
<table style="${TS}"><tr><th style="${TH}">${dateLabel}</th><th style="${TH}">부서</th><th style="${TH}">실</th><th style="${TH}">팀</th><th style="${TH}">이름</th><th style="${TH}">입사 사유</th></tr>
<tr><td style="${TD}">${date}</td><td style="${TD}">${emp.department??'-'}</td><td style="${TD}">${emp.division??'-'}</td><td style="${TD}">${emp.team??'-'}</td><td style="${TD}">${emp.name}</td><td style="${TD}">${사유}</td></tr></table>`
}

// ─── 공통 UI ──────────────────────────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const s = type === '입사' ? 'bg-blue-50 text-blue-700 border-blue-200'
          : type === '퇴사' ? 'bg-purple-50 text-purple-700 border-purple-200'
          : type === '전적' ? 'bg-amber-50 text-amber-700 border-amber-200'
          : 'bg-gray-50 text-gray-600 border-gray-200'
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${s}`}>{type}</span>
}
function SentBadge({ sent }: { sent: boolean }) {
  if (!sent) return null
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 font-semibold flex-shrink-0">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
      발송완료
    </span>
  )
}
function TimingPill({ label }: { label: string }) {
  return (
    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md whitespace-nowrap flex-shrink-0 ${label.startsWith('D') ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
      {label}
    </span>
  )
}
function TargetPill({ label }: { label: string }) {
  return <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded whitespace-nowrap">{label}</span>
}
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ─── 메일 패널 ────────────────────────────────────────────────────────────────
function MailPanel({ fixedRecipients, defaultSubject, mailSent, htmlBody, onSend }: {
  fixedRecipients: readonly Recipient[]; defaultSubject: string
  mailSent: boolean; htmlBody: string; onSend: () => void
}) {
  const [subject, setSubject] = useState(defaultSubject)
  const [extra,   setExtra]   = useState('')
  const [sending, setSending] = useState(false)
  const [mailErr, setMailErr] = useState<string | null>(null)

  async function handleSend() {
    if (sending || mailSent) return
    setSending(true); setMailErr(null)
    const extraList = extra.split(',').map(e => e.trim()).filter(Boolean)
    const to = [...fixedRecipients.map(r => r.email), ...extraList]
    const err = await sendMailApi(to, subject, htmlBody)
    setSending(false)
    if (err) setMailErr(err); else onSend()
  }

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-400 mb-2">고정 수신자</p>
        <div className="flex flex-wrap gap-1.5">
          {fixedRecipients.map(r => (
            <span key={r.email} className="inline-flex items-center gap-1 text-xs bg-white border border-blue-200 text-blue-700 px-2 py-1 rounded-lg shadow-sm max-w-full min-w-0">
              <span className="flex-shrink-0">🔒</span>
              <span className="font-mono break-all">{r.email}</span>
              <span className="font-sans font-semibold text-blue-500 flex-shrink-0 ml-0.5">({r.label})</span>
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 mb-1.5">추가 수신자 <span className="font-normal text-gray-300">(선택)</span></p>
        <input type="text" value={extra} onChange={e => setExtra(e.target.value)} disabled={mailSent}
          placeholder="이메일 주소 입력, 쉼표로 구분"
          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300 disabled:bg-gray-100" />
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-400 mb-1.5">메일 제목</p>
        <input type="text" value={subject} onChange={e => setSubject(e.target.value)} disabled={mailSent}
          className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:bg-gray-100" />
      </div>
      {mailErr && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">⚠️ 발송 실패: {mailErr}</div>}
      <div className="flex items-center justify-end pt-1 border-t border-gray-200">
        {mailSent ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3 3 7-7"/></svg>발송 완료
          </span>
        ) : (
          <button onClick={handleSend} disabled={sending}
            className="inline-flex items-center gap-1 text-xs font-semibold bg-orange-500 hover:bg-orange-600 active:scale-95 text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 whitespace-nowrap">
            <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2 8l11-5-5 11-1.5-4.5L2 8z"/></svg>
            {sending ? '발송 중…' : '발송'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── 공통 카드 헤더 ───────────────────────────────────────────────────────────
function CardHeader({ emp, typeLabel, date, dateLabel, mailSent, expanded, onToggle, onEdit, onDelete, selected, onSelect }: {
  emp: Employee; typeLabel: string; date: string; dateLabel: string
  mailSent: boolean; expanded: boolean
  onToggle: () => void; onEdit?: () => void; onDelete?: () => void
  selected?: boolean; onSelect?: (checked: boolean) => void
}) {
  const orgParts = [emp.department, emp.division, emp.team].filter(Boolean)
  return (
    <div className="flex items-stretch">
      {onSelect !== undefined && (
        <label className="flex items-center justify-center px-3 border-r border-gray-100 bg-gray-50/50 flex-shrink-0 cursor-pointer" onClick={e => e.stopPropagation()}>
          <input type="checkbox" checked={selected ?? false} onChange={e => onSelect(e.target.checked)}
            className="w-4 h-4 accent-orange-500 cursor-pointer" />
        </label>
      )}
      <button onClick={onToggle} className="flex-1 text-left px-4 py-3 hover:bg-gray-50 transition-colors min-w-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
            {emp.name[0]}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-gray-900">{emp.name}</span>
              <TypeBadge type={typeLabel} />
              <SentBadge sent={mailSent} />
            </div>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {dateLabel} {date}{orgParts.length > 0 && ` · ${orgParts.join(' · ')}`}
            </p>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
            {onEdit && (
              <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:bg-gray-100 hover:text-gray-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 2l3 3-8 8H3v-3l8-8z"/></svg>
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h10M6 4V2h4v2M5 4v9h6V4"/></svg>
              </button>
            )}
          </div>
          <svg className={`w-4 h-4 text-gray-300 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
            fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 4l4 4-4 4"/>
          </svg>
        </div>
      </button>
    </div>
  )
}

// ─── 미리보기 토글 ────────────────────────────────────────────────────────────
function PreviewToggle({ htmlBody }: { htmlBody: string }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <button onClick={() => setShow(p => !p)}
        className="flex items-center gap-1 text-xs text-gray-400 hover:text-orange-600 transition-colors mb-2">
        <svg className={`w-3 h-3 transition-transform ${show ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 2l3 3-3 3"/>
        </svg>
        메일 본문 미리보기 {show ? '숨기기' : '보기'}
      </button>
      {show && (
        <div className="rounded-lg border border-gray-200 bg-white p-3 overflow-auto max-h-64 shadow-inner">
          <div className="text-xs" dangerouslySetInnerHTML={{ __html: htmlBody }} />
        </div>
      )}
    </div>
  )
}

// ─── 일괄 발송 컨트롤 ────────────────────────────────────────────────────────
function BulkControls({ total, selectedCount, onSelectAll, onDeselectAll, onBulkSend, bulkSending, bulkResult }: {
  total: number; selectedCount: number
  onSelectAll: () => void; onDeselectAll: () => void
  onBulkSend: () => void; bulkSending: boolean
  bulkResult: { sent: number; failed: number } | null
}) {
  const cbRef = useRef<HTMLInputElement>(null)
  const allSelected = total > 0 && selectedCount === total
  const someSelected = selectedCount > 0 && selectedCount < total
  useEffect(() => { if (cbRef.current) cbRef.current.indeterminate = someSelected }, [someSelected])
  return (
    <div className="flex items-center gap-2.5 flex-wrap">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input ref={cbRef} type="checkbox" checked={allSelected}
          onChange={e => e.target.checked ? onSelectAll() : onDeselectAll()}
          className="w-4 h-4 accent-orange-500 cursor-pointer" />
        <span className="text-xs text-gray-600 font-medium">
          {selectedCount > 0 ? `${selectedCount}명 선택됨` : '전체 선택'}
        </span>
      </label>
      {selectedCount > 0 && (
        <button onClick={onBulkSend} disabled={bulkSending}
          className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-all disabled:opacity-50">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 4h12v9H2zM2 4l6 5 6-5"/>
          </svg>
          {bulkSending ? '발송 중…' : `${selectedCount}명 일괄 발송`}
        </button>
      )}
      {bulkResult && (
        <span className={`text-xs font-semibold px-2 py-1 rounded-lg border ${bulkResult.failed > 0 ? 'text-red-600 bg-red-50 border-red-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
          {bulkResult.failed > 0 ? `✓ ${bulkResult.sent}건 성공 / ✗ ${bulkResult.failed}건 실패` : `✓ ${bulkResult.sent}건 발송 완료`}
        </span>
      )}
    </div>
  )
}

// ─── 알림 카드 ────────────────────────────────────────────────────────────────
function NotifCard({ emp, type, mailSent, onSend, onEdit, onDelete, selected, onSelect }: {
  emp: Employee; type: 'hire' | 'leave'
  mailSent: boolean; onSend: () => void; onEdit: () => void; onDelete: () => void
  selected?: boolean; onSelect?: (checked: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const isTransfer = type === 'hire' && emp.join_reason === '전적'
  const typeLabel  = isTransfer ? '전적' : (type === 'hire' ? '입사' : '퇴사')
  const dateLabel  = getDateLabel(type, isTransfer)
  const date       = (type === 'hire' ? emp.join_date : emp.leave_date) ?? '-'
  const htmlBody   = makeNotifHtml(emp, type)
  const subject    = isTransfer
    ? `[입사 안내] ${emp.name} 님 ${date} 전적`
    : type === 'hire'
    ? `[입사 안내] ${emp.name} 님 ${date} 입사`
    : `[퇴사 안내] ${emp.name} 님 ${date} 퇴사`

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <CardHeader emp={emp} typeLabel={typeLabel} date={date} dateLabel={dateLabel}
        mailSent={mailSent} expanded={expanded} onToggle={() => setExpanded(p => !p)}
        onEdit={onEdit} onDelete={onDelete} selected={selected} onSelect={onSelect} />
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
          <div className="space-y-0">
            <InfoRow label={dateLabel}><span className="text-xs font-semibold text-gray-700">{date}</span></InfoRow>
            <InfoRow label="구분"><TypeBadge type={typeLabel} /></InfoRow>
            {emp.department && <InfoRow label="부서"><span className="text-xs text-gray-700">{emp.department}</span></InfoRow>}
            {emp.division   && <InfoRow label="실">  <span className="text-xs text-gray-700">{emp.division}</span>  </InfoRow>}
            {emp.team       && <InfoRow label="팀">  <span className="text-xs text-gray-700">{emp.team}</span>      </InfoRow>}
          </div>
          <PreviewToggle htmlBody={htmlBody} />
          <MailPanel fixedRecipients={type === 'hire' ? FR.hire : FR.leave}
            defaultSubject={subject} mailSent={mailSent} htmlBody={htmlBody} onSend={onSend} />
        </div>
      )}
    </div>
  )
}

// ─── 온보딩 단계 행 ───────────────────────────────────────────────────────────
function OnboardingRow({ stage, idx, isDone, isSent, hireName, onToggleDone, onSendMail }: {
  stage: typeof STAGES[0]; idx: number
  isDone: boolean; isSent: boolean; hireName: string
  onToggleDone: () => void; onSendMail: () => void
}) {
  const [open, setOpen] = useState(false)
  const htmlBody = makeOnboardingHtml(hireName, stage.label)
  return (
    <div className={`border-b border-gray-50 last:border-0 ${isDone ? 'bg-gray-50/70' : ''} ${stage.highlight && !isDone ? 'bg-amber-50/50' : ''}`}>
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="text-xs text-gray-300 font-mono w-5 flex-shrink-0 text-right select-none">{idx + 1}</span>
        <button onClick={onToggleDone}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isDone ? 'bg-orange-500 border-orange-500' : 'border-gray-300 hover:border-orange-400 bg-white'}`}>
          {isDone && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        <TimingPill label={stage.timing} />
        <span className={`flex-1 text-sm min-w-0 leading-snug ${isDone ? 'line-through text-gray-400' : stage.highlight ? 'text-amber-800 font-semibold' : 'text-gray-700'}`}>
          {stage.label}
          {stage.highlight && !isDone && <span className="ml-1.5 text-xs font-normal text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">7일 기한</span>}
        </span>
        <div className="hidden xl:flex items-center gap-1 flex-shrink-0">
          {stage.targets.map(t => <TargetPill key={t} label={t} />)}
        </div>
        <button onClick={() => setOpen(p => !p)}
          className={`text-xs px-2 py-1 rounded-lg border transition-colors flex-shrink-0 flex items-center gap-1 ${open ? 'bg-orange-100 border-orange-200 text-orange-700' : isSent ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2 4h12v9H2zM2 4l6 5 6-5"/></svg>
          {isSent ? '발송완료' : '메일'}
        </button>
      </div>
      {open && (
        <div className="px-5 pb-4">
          <MailPanel fixedRecipients={FR.onboard}
            defaultSubject={`[온보딩] ${hireName} - ${stage.label}`}
            mailSent={isSent} htmlBody={htmlBody} onSend={onSendMail} />
        </div>
      )}
    </div>
  )
}

// ─── 온보딩 카드 ──────────────────────────────────────────────────────────────
function OnboardingCard({ hire, stageDone, mailSent, onToggleDone, onSendMail }: {
  hire: Employee; stageDone: Record<string, boolean>; mailSent: Record<string, boolean>
  onToggleDone: (empId: string, stageId: string) => void; onSendMail: (key: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const done     = STAGES.filter(s => !!stageDone[`${hire.id}_${s.id}`]).length
  const pct      = Math.round((done / STAGES.length) * 100)
  const orgLine  = [hire.department, hire.division, hire.team].filter(Boolean).join(' · ') || '-'
  const isTransfer = hire.join_reason === '전적'
  const typeLabel  = isTransfer ? '전적' : '입사'

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">{hire.name[0]}</div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm text-gray-900">{hire.name}</span>
                <TypeBadge type={typeLabel} />
              </div>
              <p className="text-xs text-gray-400 truncate">입사일 {hire.join_date ?? '-'} · {orgLine}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-lg font-black text-orange-600 leading-none">{pct}%</p>
              <p className="text-xs text-gray-400 mt-0.5">{done}/{STAGES.length}</p>
            </div>
            <button onClick={() => setExpanded(p => !p)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${expanded ? 'bg-orange-100 border-orange-200 text-orange-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {expanded ? '접기' : '펼치기'}
              <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2 4l3 3 3-3"/></svg>
            </button>
          </div>
        </div>
        <div className="mt-2 w-full bg-gray-100 rounded-full h-1.5">
          <div className="bg-orange-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {expanded && (
        <div>
          {STAGES.map((stage, idx) => {
            const key = `${hire.id}_${stage.id}`
            return (
              <OnboardingRow key={stage.id} stage={stage} idx={idx}
                isDone={!!stageDone[key]} isSent={!!mailSent[`mail_${key}`]} hireName={hire.name}
                onToggleDone={() => onToggleDone(String(hire.id), String(stage.id))}
                onSendMail={() => onSendMail(`mail_${key}`)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 포인트 카드 ──────────────────────────────────────────────────────────────
function PointCard({ emp, type, variant, mailSent, onSendMail, fixedRecipients, points, isTransfer, selected, onSelect }: {
  emp: Employee; type: 'hire' | 'leave'; variant: 'cafe' | 'wellness'
  mailSent: boolean; onSendMail: () => void
  fixedRecipients: readonly Recipient[]
  points: DayPointData | null; isTransfer: boolean
  selected?: boolean; onSelect?: (checked: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const typeLabel  = isTransfer ? '전적' : (type === 'leave' ? '퇴사' : (emp.join_reason ?? '입사'))
  const dateLabel  = getDateLabel(type, isTransfer)
  const date       = (type === 'hire' ? emp.join_date : emp.leave_date) ?? '-'
  const defaultSubject = variant === 'cafe'
    ? '[헥토이노베이션] 카페포인트 요청의 건'
    : '[헥토이노베이션] 웰니스포인트 요청의 건'
  const htmlBody = variant === 'cafe'
    ? makeCafeHtml(emp, type, points, isTransfer)
    : makeWellnessHtml(emp, type, isTransfer)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <CardHeader emp={emp} typeLabel={typeLabel} date={date} dateLabel={dateLabel}
        mailSent={mailSent} expanded={expanded} onToggle={() => setExpanded(p => !p)}
        selected={selected} onSelect={onSelect} />
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
          <div className="space-y-0">
            <InfoRow label={dateLabel}><span className="text-xs font-semibold text-gray-700">{date}</span></InfoRow>
            <InfoRow label="구분"><TypeBadge type={typeLabel} /></InfoRow>
            {emp.department && <InfoRow label="부서"><span className="text-xs text-gray-700">{emp.department}</span></InfoRow>}
            {emp.division   && <InfoRow label="실">  <span className="text-xs text-gray-700">{emp.division}</span>  </InfoRow>}
            {emp.team       && <InfoRow label="팀">  <span className="text-xs text-gray-700">{emp.team}</span>      </InfoRow>}
          </div>
          {variant === 'cafe' && (
            isTransfer ? (
              <div className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                ℹ️ 전적자는 카페포인트 계산 대상이 아닙니다. 전적 안내 메일만 발송됩니다.
              </div>
            ) : (
              <div className="space-y-0">
                <InfoRow label="총 부여포인트">
                  <span className={`text-xs font-bold ${points ? 'text-orange-600' : 'text-gray-300'}`}>
                    {points ? points.totalPoints.toLocaleString() + 'P' : '—'}
                  </span>
                </InfoRow>
                <InfoRow label="정산포인트(P)">
                  <span className={`text-xs font-bold ${points ? 'text-blue-600' : 'text-gray-300'}`}>
                    {points ? points.settlementPoints.toLocaleString() + 'P' : '—'}
                  </span>
                </InfoRow>
                {!points && <p className="text-xs text-gray-400 pt-1">* 엑셀 업로드 후 자동 계산됩니다</p>}
              </div>
            )
          )}
          <PreviewToggle htmlBody={htmlBody} />
          <MailPanel fixedRecipients={fixedRecipients} defaultSubject={defaultSubject}
            mailSent={mailSent} htmlBody={htmlBody} onSend={onSendMail} />
        </div>
      )}
    </div>
  )
}

// ─── 엑셀 업로드 버튼 ─────────────────────────────────────────────────────────
function ExcelUploadBtn({ onParsed, savedFileName }: {
  onParsed: (data: Record<number, ExcelSheetData>, fileName: string) => void
  savedFileName?: string | null
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [localName, setLocalName] = useState<string | null>(null)
  const [parsing,   setParsing]   = useState(false)
  const displayName = localName ?? savedFileName
  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    try { const data = parseExcelFile(await file.arrayBuffer()); setLocalName(file.name); onParsed(data, file.name) }
    catch { alert('엑셀 파싱 실패: 파일 형식을 확인해주세요.') }
    finally { setParsing(false); if (ref.current) ref.current.value = '' }
  }
  return (
    <div className="flex items-center gap-2">
      {displayName && <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">✓ {displayName}</span>}
      <button onClick={() => ref.current?.click()} disabled={parsing}
        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 2v8M4 7l4 4 4-4M2 12h12v2H2z"/></svg>
        {parsing ? '파싱 중…' : '엑셀 업로드'}
      </button>
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />
    </div>
  )
}

// ─── 직원 폼 ──────────────────────────────────────────────────────────────────
function FormField({ label, value, onChange, placeholder, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 block mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
    </div>
  )
}
function EmployeeModal({ show, isEdit, form, submitting, onChange, onSubmit, onClose }: {
  show: boolean; isEdit: boolean; form: EmployeeForm; submitting: boolean
  onChange: (f: keyof EmployeeForm, v: string) => void
  onSubmit: () => void; onClose: () => void
}) {
  if (!show) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-bold text-gray-900">{isEdit ? '직원 정보 수정' : '신규 직원 등록'}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 text-lg">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <FormField label="이름" value={form.name} onChange={v => onChange('name', v)} placeholder="홍길동" required />
          <FormField label="부서" value={form.department} onChange={v => onChange('department', v)} placeholder="경영지원부서" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="실" value={form.division} onChange={v => onChange('division', v)} placeholder="경영지원실" />
            <FormField label="팀" value={form.team} onChange={v => onChange('team', v)} placeholder="인사팀" />
          </div>
          <FormField label="팀장" value={form.leader} onChange={v => onChange('leader', v)} placeholder="이민수 팀장" />
          <div className="grid grid-cols-2 gap-3">
            <FormField label="입사일" type="date" value={form.join_date} onChange={v => onChange('join_date', v)} />
            <FormField label="퇴사일" type="date" value={form.leave_date} onChange={v => onChange('leave_date', v)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 block mb-1.5">상태</label>
            <select value={form.status} onChange={e => onChange('status', e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white">
              <option value="active">재직중</option>
              <option value="resigned">퇴사</option>
            </select>
          </div>
          {form.status === 'active' && (
            <div>
              <label className="text-xs font-semibold text-gray-500 block mb-1.5">구분 (입사 사유)</label>
              <select value={form.join_reason} onChange={e => onChange('join_reason', e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white">
                <option value="입사">입사</option>
                <option value="전적">전적</option>
              </select>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={onSubmit} disabled={!form.name.trim() || submitting}
            className="text-sm px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-40 transition-colors">
            {submitting ? '처리 중...' : isEdit ? '수정 완료' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-200 py-12 flex items-center justify-center">
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}

// ─── 페이지 목록 (더보기) ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PagedList({ items, renderItem, limit, onMore, grid = false }: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[]; renderItem: (item: any) => ReactNode
  limit: number; onMore: () => void; grid?: boolean
}) {
  const shown   = items.slice(0, limit)
  const hasMore = items.length > limit
  return (
    <>
      {grid ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {shown.map((item, i) => <div key={i}>{renderItem(item)}</div>)}
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((item, i) => <div key={i}>{renderItem(item)}</div>)}
        </div>
      )}
      {hasMore && (
        <button onClick={onMore}
          className="w-full py-2.5 text-xs font-semibold text-gray-500 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-orange-600 transition-colors">
          더보기 ({limit} / {items.length}명 표시 중)
        </button>
      )}
    </>
  )
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
type TabId = 'notify' | 'onboard' | 'cafe' | 'wellness'

export default function HRDashboard() {
  const [employees,  setEmployees]  = useState<Employee[]>([])
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)
  const [showForm,   setShowForm]   = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [form,       setForm]       = useState<EmployeeForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [stageDone,  setStageDone]  = useState<Record<string, boolean>>({})
  const [mailSent,   setMailSent]   = useState<Record<string, boolean>>({})
  const [cafeExcel,         setCafeExcel]         = useState<Record<number, ExcelSheetData>>({})
  const [cafeExcelFileName, setCafeExcelFileName] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState<TabId>('notify')
  const [search,    setSearch]    = useState('')
  const [typeF,     setTypeF]     = useState('전체')
  const [sentF,     setSentF]     = useState('전체')
  const [limit,     setLimit]     = useState(PAGE_SIZE)

  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [bulkSending,  setBulkSending]  = useState(false)
  const [bulkResult,   setBulkResult]   = useState<{ sent: number; failed: number } | null>(null)

  const newHires   = employees.filter(e => e.status === 'active')
  const departures = employees.filter(e => e.status === 'resigned')

  const todayStr    = new Date().toISOString().slice(0, 10)
  const todayHires  = newHires.filter(h  => h.join_date  === todayStr).length
  const todayLeaves = departures.filter(d => d.leave_date === todayStr).length

  // 검색/필터/탭 변경 시 초기화
  useEffect(() => { setLimit(PAGE_SIZE) }, [activeTab, search, typeF, sentF])
  useEffect(() => { setSelectedKeys(new Set()); setBulkResult(null) }, [activeTab, search, typeF, sentF])

  // 직원 타입 레이블
  function empTypeLabel(e: Employee): string {
    if (e.status === 'resigned') return '퇴사'
    return e.join_reason ?? '입사'
  }

  // 공통 필터 함수
  function filterEntry(e: Employee, mailKey: string): boolean {
    const q = search.trim().toLowerCase()
    if (q) {
      const text = [e.name, e.department, e.division, e.team].filter(Boolean).join(' ').toLowerCase()
      if (!text.includes(q)) return false
    }
    if (typeF !== '전체' && empTypeLabel(e) !== typeF) return false
    if (sentF === '발송완료' && !mailSent[mailKey]) return false
    if (sentF === '미발송'   &&  mailSent[mailKey]) return false
    return true
  }

  // 탭별 데이터
  const allNotify: NotifyEntry[] = [
    ...newHires.map(e  => ({ emp: e, type: 'hire'  as const, mailKey: `hire_notif_${e.id}` })),
    ...departures.map(e => ({ emp: e, type: 'leave' as const, mailKey: `leave_notif_${e.id}` })),
  ]
  const allCafe: PointEntry[] = [
    ...newHires.map(e  => ({ emp: e, empType: 'hire'  as const, mailKey: `hire_cafe_${e.id}` })),
    ...departures.map(e => ({ emp: e, empType: 'leave' as const, mailKey: `leave_cafe_${e.id}` })),
  ]
  const allWellness: PointEntry[] = [
    ...newHires.map(e  => ({ emp: e, empType: 'hire'  as const, mailKey: `hire_wellness_${e.id}` })),
    ...departures.map(e => ({ emp: e, empType: 'leave' as const, mailKey: `leave_wellness_${e.id}` })),
  ]

  const filteredNotify = allNotify.filter(({ emp, mailKey }) => filterEntry(emp, mailKey))
  const filteredOnboard = newHires.filter(e => {
    const q = search.trim().toLowerCase()
    if (q) {
      const text = [e.name, e.department, e.division, e.team].filter(Boolean).join(' ').toLowerCase()
      if (!text.includes(q)) return false
    }
    if (typeF === '퇴사') return false
    if (typeF !== '전체' && (e.join_reason ?? '입사') !== typeF) return false
    return true
  })
  const filteredCafe     = allCafe.filter(({ emp, mailKey }) => filterEntry(emp, mailKey))
  const filteredWellness = allWellness.filter(({ emp, mailKey }) => filterEntry(emp, mailKey))

  const TABS = [
    { id: 'notify'   as TabId, label: '입사/퇴사 관리', count: allNotify.length },
    { id: 'onboard'  as TabId, label: '온보딩',          count: newHires.length },
    { id: 'cafe'     as TabId, label: '카페포인트',       count: allCafe.length },
    { id: 'wellness' as TabId, label: '웰니스포인트',     count: allWellness.length },
  ]

  function toggleSelect(key: string, checked: boolean) {
    setSelectedKeys(prev => { const s = new Set(prev); checked ? s.add(key) : s.delete(key); return s })
  }
  function selectAll(keys: string[]) { setSelectedKeys(new Set(keys)) }
  function deselectAll() { setSelectedKeys(new Set()) }

  async function handleBulkSend(entries: Array<{ key: string; to: string[]; subject: string; html: string }>) {
    setBulkSending(true); setBulkResult(null)
    let sent = 0, failed = 0
    for (const { key, to, subject, html } of entries) {
      if (mailSent[key]) continue
      const err = await sendMailApi(to, subject, html)
      if (err) { failed++ } else { sent++; await sendMail(key) }
    }
    setBulkSending(false); setBulkResult({ sent, failed }); setSelectedKeys(new Set())
  }

  async function fetchAllData() {
    setLoading(true); setError(null)
    const [empRes, taskRes, notifRes, pointRes, excelRes] = await Promise.all([
      supabase.from('employees').select('*').order('created_at', { ascending: false }),
      supabase.from('onboarding_tasks').select('employee_id,stage_id,is_done,mail_sent'),
      supabase.from('notifications').select('employee_id,notification_type,mail_sent'),
      supabase.from('point_requests').select('employee_id,employee_type,point_type,mail_sent'),
      supabase.from('cafe_excel_data').select('file_name,data').eq('id', 'singleton').maybeSingle(),
    ])
    if (empRes.error) { setError(empRes.error.message); setLoading(false); return }
    setEmployees(empRes.data ?? [])
    const newDone: Record<string, boolean> = {}
    const newMail: Record<string, boolean> = {}
    for (const t of taskRes.data ?? []) {
      if (t.is_done)   newDone[`${t.employee_id}_${t.stage_id}`]      = true
      if (t.mail_sent) newMail[`mail_${t.employee_id}_${t.stage_id}`] = true
    }
    for (const n of notifRes.data ?? []) {
      const k = n.notification_type === 'hire' ? `hire_notif_${n.employee_id}` : `leave_notif_${n.employee_id}`
      if (n.mail_sent) newMail[k] = true
    }
    for (const p of pointRes.data ?? []) {
      if (p.mail_sent) newMail[`${p.employee_type}_${p.point_type}_${p.employee_id}`] = true
    }
    if (excelRes.data) {
      setCafeExcel(excelRes.data.data as Record<number, ExcelSheetData>)
      setCafeExcelFileName(excelRes.data.file_name ?? null)
    }
    setStageDone(newDone); setMailSent(newMail); setLoading(false)
  }

  async function handleCafeExcelUpload(data: Record<number, ExcelSheetData>, fileName: string) {
    setCafeExcel(data)
    setCafeExcelFileName(fileName)
    const { error } = await supabase.from('cafe_excel_data').upsert({
      id: 'singleton', file_name: fileName, data, uploaded_at: new Date().toISOString(),
    }, { onConflict: 'id' })
    if (error) setError('엑셀 저장 실패: ' + error.message)
  }

  async function handleSubmit() {
    if (!form.name.trim()) return
    setSubmitting(true)
    const payload = {
      name: form.name.trim(), join_date: form.join_date || null, leave_date: form.leave_date || null,
      department: form.department || null, division: form.division || null, team: form.team || null,
      leader: form.leader || null, join_reason: form.status === 'active' ? (form.join_reason || '입사') : null, status: form.status,
    }
    const { error } = editTarget
      ? await supabase.from('employees').update(payload).eq('id', editTarget.id)
      : await supabase.from('employees').insert(payload)
    if (error) setError(error.message); else closeForm()
    setSubmitting(false); fetchAllData()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 직원을 삭제하시겠습니까?\n관련 데이터도 함께 삭제됩니다.`)) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) setError(error.message); else fetchAllData()
  }

  function openAdd() { setEditTarget(null); setForm(EMPTY_FORM); setShowForm(true) }
  function openEdit(emp: Employee) {
    setEditTarget(emp)
    setForm({ name: emp.name, join_date: emp.join_date ?? '', leave_date: emp.leave_date ?? '',
      department: emp.department ?? '', division: emp.division ?? '', team: emp.team ?? '',
      leader: emp.leader ?? '', join_reason: emp.join_reason ?? '입사', status: emp.status })
    setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditTarget(null); setForm(EMPTY_FORM) }

  async function toggleDone(empId: string, stageId: string) {
    const key = `${empId}_${stageId}`; const newDone = !stageDone[key]
    setStageDone(p => ({ ...p, [key]: newDone }))
    const stage = STAGES.find(s => s.id === stageId)!
    const { error } = await supabase.from('onboarding_tasks').upsert({
      employee_id: empId, stage_id: stageId, stage_label: stage.label, timing: stage.timing,
      sort_order: STAGES.indexOf(stage), is_done: newDone, done_at: newDone ? new Date().toISOString() : null,
    }, { onConflict: 'employee_id,stage_id' })
    if (error) { setError(error.message); setStageDone(p => ({ ...p, [key]: !newDone })) }
  }

  async function sendMail(key: string) {
    setMailSent(p => ({ ...p, [key]: true }))
    let dbErr: string | null = null
    if (key.startsWith('hire_notif_') || key.startsWith('leave_notif_')) {
      const isHire = key.startsWith('hire_notif_')
      const empId  = key.replace(isHire ? 'hire_notif_' : 'leave_notif_', '')
      const { error } = await supabase.from('notifications').upsert({
        employee_id: empId, notification_type: isHire ? 'hire' : 'leave',
        fixed_recipients: isHire ? FR.hire.map(r => r.email) : FR.leave.map(r => r.email),
        extra_recipients: [], mail_sent: true, mail_sent_at: new Date().toISOString(),
      }, { onConflict: 'employee_id,notification_type' })
      dbErr = error?.message ?? null
    } else if (/^(hire|leave)_(cafe|wellness)_/.test(key)) {
      const m = key.match(/^(hire|leave)_(cafe|wellness)_(.+)$/)!
      const [, empType, pointType, empId] = m
      const emp = employees.find(e => String(e.id) === String(empId))
      const dateStr = empType === 'hire' ? emp?.join_date ?? null : emp?.leave_date ?? null
      const { error } = await supabase.from('point_requests').upsert({
        employee_id: empId, employee_type: empType, point_type: pointType,
        base_month: formatMonth(dateStr), extra_recipients: [],
        mail_sent: true, mail_sent_at: new Date().toISOString(),
      }, { onConflict: 'employee_id,point_type' })
      dbErr = error?.message ?? null
    } else if (key.startsWith('mail_')) {
      const match = key.match(/^mail_(.+)_(s\d+)$/)
      if (match) {
        const [, empId, stageId] = match
        const stage = STAGES.find(s => s.id === stageId)!
        const { error } = await supabase.from('onboarding_tasks').upsert({
          employee_id: empId, stage_id: stageId, stage_label: stage.label, timing: stage.timing,
          sort_order: STAGES.indexOf(stage), mail_sent: true, mail_sent_at: new Date().toISOString(),
        }, { onConflict: 'employee_id,stage_id' })
        dbErr = error?.message ?? null
      }
    }
    if (dbErr) { setError(dbErr); setMailSent(p => ({ ...p, [key]: false })) }
  }

  useEffect(() => { fetchAllData() }, [])

  const hasFilter = search || typeF !== '전체' || sentF !== '전체'
  const pendingNotif = allNotify.filter(({ mailKey }) => !mailSent[mailKey]).length
  const pendingMail  = [...allCafe, ...allWellness].filter(({ mailKey }) => !mailSent[mailKey]).length

  return (
    <main className="min-h-screen bg-slate-50">
      <EmployeeModal show={showForm} isEdit={!!editTarget} form={form} submitting={submitting}
        onChange={(f, v) => setForm(p => ({ ...p, [f]: v }))} onSubmit={handleSubmit} onClose={closeForm} />

      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6 5.87a4 4 0 10-8 0m4-8a4 4 0 100-8 4 4 0 000 8z"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-900">입퇴사자 관리</span>
            <span className="text-xs text-gray-400 hidden sm:inline">Hecto Innovation HR</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openAdd}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 3v10M3 8h10"/></svg>
              직원 등록
            </button>
            <span className="text-xs text-gray-400 hidden sm:inline">{todayStr}</span>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-red-600">⚠️ {error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm ml-4">닫기</button>
          </div>
        )}

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: '미발송 알림',   value: pendingNotif,  sub: '알림 미발송 건',  icon: '🔔', color: 'text-orange-600' },
            { label: '오늘 입사자',   value: todayHires,    sub: `${todayStr}`,      icon: '👋', color: 'text-blue-600'   },
            { label: '오늘 퇴사자',   value: todayLeaves,   sub: `${todayStr}`,      icon: '📦', color: 'text-purple-600' },
            { label: '미발송 포인트', value: pendingMail,   sub: '포인트 발송 대기', icon: '☕', color: 'text-red-600'    },
          ].map(c => (
            <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-lg">{c.icon}</span>
                <span className={`text-2xl font-black ${c.color}`}>{loading ? '…' : c.value}</span>
              </div>
              <p className="text-xs font-medium text-gray-600">{c.label}</p>
              <p className="text-xs text-gray-400">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* 검색 + 필터 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
              <circle cx="7" cy="7" r="4.5"/><path strokeLinecap="round" d="M10 10l3 3"/>
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="이름, 부서, 실, 팀 검색..."
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {['전체', '입사', '퇴사', '전적'].map(t => (
              <button key={t} onClick={() => setTypeF(t)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${typeF === t ? 'bg-orange-500 border-orange-500 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {t}
              </button>
            ))}
            <div className="w-px h-4 bg-gray-200" />
            {['발송완료', '미발송'].map(s => (
              <button key={s} onClick={() => setSentF(p => p === s ? '전체' : s)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${sentF === s
                  ? s === '발송완료' ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-red-500 border-red-500 text-white'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                {s}
              </button>
            ))}
            {hasFilter && (
              <button onClick={() => { setSearch(''); setTypeF('전체'); setSentF('전체') }}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-gray-600 bg-white transition-colors">
                초기화
              </button>
            )}
          </div>
        </div>

        {/* 탭 + 컨텐츠 */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {/* 탭 바 */}
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 sm:px-5 py-3.5 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? 'border-orange-500 text-orange-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}>
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${activeTab === tab.id ? 'bg-orange-100 text-orange-600' : 'bg-gray-100 text-gray-500'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* 컨텐츠 영역 */}
          <div className="p-4 sm:p-5">
            {loading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-gray-400">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <span className="text-sm">불러오는 중...</span>
              </div>
            ) : activeTab === 'notify' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-gray-400">{filteredNotify.length}명{hasFilter ? ' (필터 적용)' : ''}</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setForm({ ...EMPTY_FORM, status: 'resigned' }); setEditTarget(null); setShowForm(true) }}
                      className="text-xs font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg transition-colors">
                      + 퇴사자
                    </button>
                    <button onClick={openAdd}
                      className="text-xs font-semibold text-orange-600 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2.5 py-1 rounded-lg transition-colors">
                      + 입사자
                    </button>
                  </div>
                </div>
                {filteredNotify.length > 0 && (
                  <BulkControls
                    total={filteredNotify.filter(({ mailKey }) => !mailSent[mailKey]).length}
                    selectedCount={filteredNotify.filter(({ mailKey }) => selectedKeys.has(mailKey)).length}
                    onSelectAll={() => selectAll(filteredNotify.filter(({ mailKey }) => !mailSent[mailKey]).map(e => e.mailKey))}
                    onDeselectAll={deselectAll}
                    bulkSending={bulkSending} bulkResult={bulkResult}
                    onBulkSend={() => handleBulkSend(
                      filteredNotify
                        .filter(({ mailKey }) => selectedKeys.has(mailKey) && !mailSent[mailKey])
                        .map(({ emp, type, mailKey }) => {
                          const isTransfer = type === 'hire' && emp.join_reason === '전적'
                          const date = (type === 'hire' ? emp.join_date : emp.leave_date) ?? '-'
                          return {
                            key: mailKey,
                            to: (type === 'hire' ? FR.hire : FR.leave).map(r => r.email),
                            subject: isTransfer ? `[입사 안내] ${emp.name} 님 ${date} 전적`
                                    : type === 'hire' ? `[입사 안내] ${emp.name} 님 ${date} 입사`
                                    : `[퇴사 안내] ${emp.name} 님 ${date} 퇴사`,
                            html: makeNotifHtml(emp, type),
                          }
                        })
                    )} />
                )}
                {filteredNotify.length === 0 ? <EmptyState label={hasFilter ? '검색 결과가 없습니다' : '등록된 직원이 없습니다'} /> : (
                  <PagedList items={filteredNotify} limit={limit} onMore={() => setLimit(l => l + PAGE_SIZE)}
                    renderItem={(entry: NotifyEntry) => (
                      <NotifCard emp={entry.emp} type={entry.type}
                        mailSent={!!mailSent[entry.mailKey]}
                        onSend={() => sendMail(entry.mailKey)}
                        onEdit={() => openEdit(entry.emp)}
                        onDelete={() => handleDelete(String(entry.emp.id), entry.emp.name)}
                        selected={selectedKeys.has(entry.mailKey)}
                        onSelect={checked => toggleSelect(entry.mailKey, checked)}
                      />
                    )} />
                )}
              </div>

            ) : activeTab === 'onboard' ? (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">{filteredOnboard.length}명{hasFilter ? ' (필터 적용)' : ''}</p>
                {filteredOnboard.length === 0 ? <EmptyState label={hasFilter ? '검색 결과가 없습니다' : '등록된 입사자가 없습니다'} /> : (
                  <PagedList items={filteredOnboard} limit={limit} onMore={() => setLimit(l => l + PAGE_SIZE)}
                    renderItem={(hire: Employee) => (
                      <OnboardingCard hire={hire} stageDone={stageDone} mailSent={mailSent}
                        onToggleDone={toggleDone} onSendMail={sendMail} />
                    )} />
                )}
              </div>

            ) : activeTab === 'cafe' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs text-gray-400">{filteredCafe.length}명{hasFilter ? ' (필터 적용)' : ''}</p>
                  <ExcelUploadBtn onParsed={handleCafeExcelUpload} savedFileName={cafeExcelFileName} />
                </div>
                {filteredCafe.length > 0 && (
                  <BulkControls
                    total={filteredCafe.filter(({ mailKey }) => !mailSent[mailKey]).length}
                    selectedCount={filteredCafe.filter(({ mailKey }) => selectedKeys.has(mailKey)).length}
                    onSelectAll={() => selectAll(filteredCafe.filter(({ mailKey }) => !mailSent[mailKey]).map(e => e.mailKey))}
                    onDeselectAll={deselectAll}
                    bulkSending={bulkSending} bulkResult={bulkResult}
                    onBulkSend={() => handleBulkSend(
                      filteredCafe
                        .filter(({ mailKey }) => selectedKeys.has(mailKey) && !mailSent[mailKey])
                        .map(({ emp, empType, mailKey }) => {
                          const isTransfer = emp.join_reason === '전적' && empType === 'hire'
                          const dateStr = empType === 'hire' ? emp.join_date ?? null : emp.leave_date ?? null
                          const points = isTransfer ? null : lookupExcelPoints(cafeExcel, dateStr, empType)
                          return {
                            key: mailKey,
                            to: FR.cafe.map(r => r.email),
                            subject: '[헥토이노베이션] 카페포인트 요청의 건',
                            html: makeCafeHtml(emp, empType, points, isTransfer),
                          }
                        })
                    )} />
                )}
                {filteredCafe.length === 0 ? <EmptyState label={hasFilter ? '검색 결과가 없습니다' : '등록된 직원이 없습니다'} /> : (
                  <PagedList items={filteredCafe} limit={limit} onMore={() => setLimit(l => l + PAGE_SIZE)} grid
                    renderItem={(entry: PointEntry) => {
                      const isTransfer = entry.emp.join_reason === '전적' && entry.empType === 'hire'
                      const dateStr = entry.empType === 'hire' ? entry.emp.join_date ?? null : entry.emp.leave_date ?? null
                      return (
                        <PointCard emp={entry.emp} type={entry.empType} variant="cafe"
                          mailSent={!!mailSent[entry.mailKey]} onSendMail={() => sendMail(entry.mailKey)}
                          fixedRecipients={FR.cafe}
                          points={isTransfer ? null : lookupExcelPoints(cafeExcel, dateStr, entry.empType)}
                          isTransfer={isTransfer}
                          selected={selectedKeys.has(entry.mailKey)}
                          onSelect={checked => toggleSelect(entry.mailKey, checked)} />
                      )
                    }} />
                )}
              </div>

            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-400">{filteredWellness.length}명{hasFilter ? ' (필터 적용)' : ''}</p>
                {filteredWellness.length > 0 && (
                  <BulkControls
                    total={filteredWellness.filter(({ mailKey }) => !mailSent[mailKey]).length}
                    selectedCount={filteredWellness.filter(({ mailKey }) => selectedKeys.has(mailKey)).length}
                    onSelectAll={() => selectAll(filteredWellness.filter(({ mailKey }) => !mailSent[mailKey]).map(e => e.mailKey))}
                    onDeselectAll={deselectAll}
                    bulkSending={bulkSending} bulkResult={bulkResult}
                    onBulkSend={() => handleBulkSend(
                      filteredWellness
                        .filter(({ mailKey }) => selectedKeys.has(mailKey) && !mailSent[mailKey])
                        .map(({ emp, empType, mailKey }) => {
                          const isTransfer = emp.join_reason === '전적' && empType === 'hire'
                          return {
                            key: mailKey,
                            to: FR.wellness.map(r => r.email),
                            subject: '[헥토이노베이션] 웰니스포인트 요청의 건',
                            html: makeWellnessHtml(emp, empType, isTransfer),
                          }
                        })
                    )} />
                )}
                {filteredWellness.length === 0 ? <EmptyState label={hasFilter ? '검색 결과가 없습니다' : '등록된 직원이 없습니다'} /> : (
                  <PagedList items={filteredWellness} limit={limit} onMore={() => setLimit(l => l + PAGE_SIZE)} grid
                    renderItem={(entry: PointEntry) => {
                      const isTransfer = entry.emp.join_reason === '전적' && entry.empType === 'hire'
                      return (
                        <PointCard emp={entry.emp} type={entry.empType} variant="wellness"
                          mailSent={!!mailSent[entry.mailKey]} onSendMail={() => sendMail(entry.mailKey)}
                          fixedRecipients={FR.wellness} points={null} isTransfer={isTransfer}
                          selected={selectedKeys.has(entry.mailKey)}
                          onSelect={checked => toggleSelect(entry.mailKey, checked)} />
                      )
                    }} />
                )}
              </div>
            )}
          </div>
        </div>

      </div>
    </main>
  )
}
