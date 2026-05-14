'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import { supabase, type Employee } from '@/lib/supabase'

// ─── 온보딩 단계 정의 ─────────────────────────────────────────────────────────

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

// ─── 고정 수신자 ──────────────────────────────────────────────────────────────

const FR = {
  hire:    ['t_10010300@hecto.co.kr']                          as const,
  leave:   ['t_10010300@hecto.co.kr', 't_849fm@hecto.co.kr']  as const,
  onboard: ['inno_hm@hecto.co.kr']                            as const,
  cafe:    ['story2110@hecto.co.kr']                           as const,
  wellness:['yhj@hecto.co.kr']                                 as const,
}

// ─── 타입 ─────────────────────────────────────────────────────────────────────

interface EmployeeForm {
  name:       string
  join_date:  string
  leave_date: string
  division:   string
  team:       string
  leader:     string
  status:     'active' | 'resigned'
}

const EMPTY_FORM: EmployeeForm = {
  name: '', join_date: '', leave_date: '',
  division: '', team: '', leader: '', status: 'active',
}

interface ExcelSheetData {
  hire:  Record<string, number>
  leave: Record<string, number>
}

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

function formatMonth(dateStr: string | null): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
}

function parseExcelFile(buffer: ArrayBuffer): Record<number, ExcelSheetData> {
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: true })
  const result: Record<number, ExcelSheetData> = {}

  for (let m = 1; m <= 12; m++) {
    const sheetName = `${m}월`
    const ws = wb.Sheets[sheetName]
    if (!ws) continue

    const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    const hireMap:  Record<string, number> = {}
    const leaveMap: Record<string, number> = {}

    let hireHeaderCol  = -1
    let leaveHeaderCol = -1
    let hireHeaderRow  = -1
    let leaveHeaderRow = -1

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r] as unknown[]
      for (let c = 0; c < row.length; c++) {
        const cell = String(row[c] ?? '').trim()
        if (cell === '입사일자' && hireHeaderCol === -1) {
          hireHeaderCol = c
          hireHeaderRow = r
        } else if (cell === '입사일자' && hireHeaderCol !== -1 && c > hireHeaderCol) {
          leaveHeaderCol = c
          leaveHeaderRow = r
        }
        if (cell === '퇴사일자' && leaveHeaderCol === -1) {
          leaveHeaderCol = c
          leaveHeaderRow = r
        }
      }
      if (hireHeaderCol !== -1 && leaveHeaderCol !== -1) break
    }

    function extractDateAmountMap(
      headerRow: number, dateCol: number, rows: unknown[][]
    ): Record<string, number> {
      const map: Record<string, number> = {}
      const headerCells = rows[headerRow] as unknown[]
      let amountCol = -1
      for (let c = dateCol; c < headerCells.length; c++) {
        const cell = String(headerCells[c] ?? '').trim()
        if (cell === '정산포인트') { amountCol = c; break }
      }
      if (amountCol === -1) return map

      for (let r = headerRow + 1; r < rows.length; r++) {
        const row = rows[r] as unknown[]
        const rawDate = row[dateCol]
        if (!rawDate) continue
        let dateStr = ''
        if (rawDate instanceof Date) {
          dateStr = rawDate.toISOString().slice(0, 10)
        } else {
          const s = String(rawDate).trim()
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) dateStr = s
          else if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) dateStr = s.replace(/\//g, '-')
          else if (/^\d{8}$/.test(s)) dateStr = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`
          else continue
        }
        const amount = Number(row[amountCol])
        if (!isNaN(amount)) map[dateStr] = amount
      }
      return map
    }

    if (hireHeaderCol !== -1)
      Object.assign(hireMap, extractDateAmountMap(hireHeaderRow, hireHeaderCol, rows))
    if (leaveHeaderCol !== -1)
      Object.assign(leaveMap, extractDateAmountMap(leaveHeaderRow, leaveHeaderCol, rows))

    result[m] = { hire: hireMap, leave: leaveMap }
  }

  return result
}

function lookupExcelAmount(
  excelData: Record<number, ExcelSheetData>,
  dateStr: string | null,
  type: 'hire' | 'leave'
): number | null {
  if (!dateStr) return null
  const m = new Date(dateStr).getMonth() + 1
  const sheet = excelData[m]
  if (!sheet) return null
  const amount = sheet[type][dateStr]
  return amount !== undefined ? amount : null
}

// ─── 공통 UI 컴포넌트 ─────────────────────────────────────────────────────────

function GreenBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />{label}
    </span>
  )
}

function TimingPill({ label }: { label: string }) {
  const isD = label.startsWith('D')
  return (
    <span className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md whitespace-nowrap flex-shrink-0 ${isD ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
      {label}
    </span>
  )
}

function TargetPill({ label }: { label: string }) {
  return (
    <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded whitespace-nowrap">
      {label}
    </span>
  )
}

function SendBtn({ sent, label = '메일', onClick }: { sent: boolean; label?: string; onClick: () => void }) {
  if (sent) return (
    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold whitespace-nowrap">
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l3 3 7-7" />
      </svg>발송 완료
    </span>
  )
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1 text-xs font-semibold bg-orange-500 hover:bg-orange-600 active:scale-95 text-white px-3 py-1.5 rounded-lg transition-all whitespace-nowrap flex-shrink-0">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2 8l11-5-5 11-1.5-4.5L2 8z" />
      </svg>{label}
    </button>
  )
}

function SectionHead({ icon, title, desc, badge, action }: {
  icon: string; title: string; desc?: string; badge?: string; action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-5 gap-3">
      <div className="flex items-center gap-2.5">
        <span className="text-xl leading-none">{icon}</span>
        <div>
          <h2 className="text-base font-bold text-gray-800">{title}</h2>
          {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {action}
        {badge && (
          <span className="text-xs font-semibold bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full whitespace-nowrap">{badge}</span>
        )}
      </div>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ─── 메일 패널 (포인트 카드 전용) ─────────────────────────────────────────────

function MailPanel({
  fixedRecipients, defaultSubject, mailSent, onSend,
}: {
  fixedRecipients: readonly string[]
  defaultSubject: string
  mailSent: boolean
  onSend: () => void
}) {
  const [subject, setSubject] = useState(defaultSubject)
  const [extra, setExtra]     = useState('')

  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-400 mb-2">고정 수신자</p>
        <div className="flex flex-wrap gap-1.5">
          {fixedRecipients.map(r => (
            <span key={r} className="inline-flex items-center gap-1.5 text-xs font-mono bg-white border border-blue-200 text-blue-700 px-2.5 py-1 rounded-lg shadow-sm">
              🔒 {r}
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
      <div className="flex items-center justify-end pt-1 border-t border-gray-200">
        <SendBtn sent={mailSent} label="발송" onClick={onSend} />
      </div>
    </div>
  )
}

// ─── 알림 행 (컴팩트 가로 레이아웃) ──────────────────────────────────────────

function NotifRow({
  name, date, division, team, mailSent, onSend,
  onEdit, onDelete,
}: {
  name: string; date: string; division: string; team: string
  mailSent: boolean; onSend: () => void
  onEdit: () => void; onDelete: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-sm flex-shrink-0">
        {name[0]}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-gray-900 leading-none">{name}</p>
        <p className="text-xs text-gray-400 mt-0.5 truncate">{date} · {division || '-'} · {team || '-'}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <SendBtn sent={mailSent} onClick={onSend} />
        <button onClick={onEdit} title="수정"
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 2l3 3-8 8H3v-3l8-8z" /></svg>
        </button>
        <button onClick={onDelete} title="삭제"
          className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 4h10M6 4V2h4v2M5 4v9h6V4" /></svg>
        </button>
      </div>
    </div>
  )
}

// ─── 온보딩 단계 행 ───────────────────────────────────────────────────────────

function OnboardingRow({
  stage, idx, isDone, isSent, hireName, onToggleDone, onSendMail,
}: {
  stage: typeof STAGES[0]; idx: number
  isDone: boolean; isSent: boolean; hireName: string
  onToggleDone: () => void; onSendMail: () => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`border-b border-gray-50 last:border-0 ${isDone ? 'bg-gray-50/70' : ''} ${stage.highlight && !isDone ? 'bg-amber-50/50' : ''}`}>
      <div className="flex items-center gap-3 px-5 py-3">
        <span className="text-xs text-gray-300 font-mono w-5 flex-shrink-0 text-right select-none">{idx + 1}</span>
        <button onClick={onToggleDone} title="완료 처리"
          className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isDone ? 'bg-orange-500 border-orange-500' : 'border-gray-300 hover:border-orange-400 bg-white'}`}>
          {isDone && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
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
          <svg className="w-3 h-3" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2 4h12v9H2zM2 4l6 5 6-5" /></svg>
          {isSent ? '발송완료' : '메일'}
          <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M2 4l3 3 3-3" /></svg>
        </button>
      </div>
      {open && (
        <div className="px-5 pb-4">
          <MailPanel fixedRecipients={FR.onboard} defaultSubject={`[온보딩] ${hireName} - ${stage.label}`} mailSent={isSent} onSend={onSendMail} />
        </div>
      )}
    </div>
  )
}

// ─── 온보딩 카드 (접기/펼치기) ────────────────────────────────────────────────

function OnboardingCard({
  hire, stageDone, mailSent,
  onToggleDone, onSendMail,
}: {
  hire: Employee
  stageDone: Record<string, boolean>
  mailSent:  Record<string, boolean>
  onToggleDone: (empId: string, stageId: string) => void
  onSendMail:   (key: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const done = STAGES.filter(s => !!stageDone[`${hire.id}_${s.id}`]).length
  const pct  = Math.round((done / STAGES.length) * 100)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100 px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
              {hire.name[0]}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-gray-900">{hire.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {hire.join_date ?? '-'} 입사 · {hire.division ?? '-'} {hire.team ?? '-'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right">
              <p className="text-lg font-black text-orange-600 leading-none">{pct}%</p>
              <p className="text-xs text-gray-400 mt-0.5">{done}/{STAGES.length}</p>
            </div>
            <button
              onClick={() => setExpanded(p => !p)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${expanded ? 'bg-orange-100 border-orange-200 text-orange-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'}`}>
              {expanded ? '접기' : '펼치기'}
              <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 10 10" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 4l3 3 3-3" />
              </svg>
            </button>
          </div>
        </div>
        <div className="mt-3 w-full bg-orange-100 rounded-full h-1.5">
          <div className="bg-orange-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {expanded && (
        <div>
          {STAGES.map((stage, idx) => {
            const key    = `${hire.id}_${stage.id}`
            const isDone = !!stageDone[key]
            const isSent = !!mailSent[`mail_${key}`]
            return (
              <OnboardingRow key={stage.id} stage={stage} idx={idx}
                isDone={isDone} isSent={isSent} hireName={hire.name}
                onToggleDone={() => onToggleDone(hire.id, stage.id)}
                onSendMail={() => onSendMail(`mail_${key}`)} />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── 포인트 카드 ──────────────────────────────────────────────────────────────

function PointCard({
  name, dateLabel, date, baseMonth,
  mailSent, onSendMail, fixedRecipients, defaultSubject, autoAmount,
}: {
  name: string; dateLabel: string; date: string; baseMonth: string
  mailSent: boolean; onSendMail: () => void
  fixedRecipients: readonly string[]; defaultSubject: string
  autoAmount: number | null
}) {
  const [amount, setAmount] = useState(autoAmount !== null ? String(autoAmount) : '')

  useEffect(() => {
    if (autoAmount !== null) setAmount(String(autoAmount))
  }, [autoAmount])

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-bold text-gray-900">{name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{dateLabel}: {date}</p>
        </div>
        {mailSent && <GreenBadge label="발송 완료" />}
      </div>
      <div>
        <InfoRow label="기준월"><span className="text-xs font-semibold text-gray-700">{baseMonth}</span></InfoRow>
        <InfoRow label="일할 계산 금액">
          <input type="text" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="엑셀 업로드 후 자동 입력"
            className="text-right text-xs border border-gray-200 rounded-lg px-2.5 py-1 w-40 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300 bg-gray-50" />
        </InfoRow>
      </div>
      <MailPanel fixedRecipients={fixedRecipients} defaultSubject={defaultSubject} mailSent={mailSent} onSend={onSendMail} />
    </div>
  )
}

// ─── 엑셀 업로드 버튼 ─────────────────────────────────────────────────────────

function ExcelUploadBtn({ onParsed }: { onParsed: (data: Record<number, ExcelSheetData>) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [parsing,  setParsing]  = useState(false)

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    try {
      const buf  = await file.arrayBuffer()
      const data = parseExcelFile(buf)
      setFileName(file.name)
      onParsed(data)
    } catch {
      alert('엑셀 파싱 실패: 파일 형식을 확인해주세요.')
    } finally {
      setParsing(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-2">
      {fileName && (
        <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
          ✓ {fileName}
        </span>
      )}
      <button onClick={() => ref.current?.click()} disabled={parsing}
        className="inline-flex items-center gap-1.5 text-xs font-semibold bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 2v8M4 7l4 4 4-4M2 12h12v2H2z" />
        </svg>
        {parsing ? '파싱 중…' : '엑셀 업로드'}
      </button>
      <input ref={ref} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleChange} />
    </div>
  )
}

// ─── 직원 폼 필드 ─────────────────────────────────────────────────────────────

function FormField({ label, value, onChange, placeholder, type = 'text', required = false }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string; required?: boolean
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-gray-500 block mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-400 placeholder:text-gray-300" />
    </div>
  )
}

// ─── 직원 등록/수정 모달 ──────────────────────────────────────────────────────

function EmployeeModal({
  show, isEdit, form, submitting,
  onChange, onSubmit, onClose,
}: {
  show: boolean; isEdit: boolean
  form: EmployeeForm; submitting: boolean
  onChange: (f: keyof EmployeeForm, v: string) => void
  onSubmit: () => void; onClose: () => void
}) {
  if (!show) return null
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-900">{isEdit ? '직원 정보 수정' : '신규 직원 등록'}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 text-lg">✕</button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <FormField label="이름" value={form.name} onChange={v => onChange('name', v)} placeholder="홍길동" required />
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
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onClose} className="text-sm px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">취소</button>
          <button onClick={onSubmit} disabled={!form.name.trim() || submitting}
            className="text-sm px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {submitting ? '처리 중...' : isEdit ? '수정 완료' : '등록'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────

export default function HRDashboard() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const [showForm,   setShowForm]   = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [form,       setForm]       = useState<EmployeeForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)

  const [stageDone, setStageDone] = useState<Record<string, boolean>>({})
  const [mailSent,  setMailSent]  = useState<Record<string, boolean>>({})

  const [cafeExcel,     setCafeExcel]     = useState<Record<number, ExcelSheetData>>({})
  const [wellnessExcel, setWellnessExcel] = useState<Record<number, ExcelSheetData>>({})

  const newHires   = employees.filter(e => e.status === 'active')
  const departures = employees.filter(e => e.status === 'resigned')

  const todayStr    = new Date().toISOString().slice(0, 10)
  const todayHires  = newHires.filter(h  => h.join_date  === todayStr).length
  const todayLeaves = departures.filter(d => d.leave_date === todayStr).length
  const pendingNotif = newHires.filter(h  => !mailSent[`hire_notif_${h.id}`]).length
                     + departures.filter(d => !mailSent[`leave_notif_${d.id}`]).length
  const pendingMail = [
    ...newHires.flatMap(e  => [`hire_cafe_${e.id}`,  `hire_wellness_${e.id}`]),
    ...departures.flatMap(e => [`leave_cafe_${e.id}`, `leave_wellness_${e.id}`]),
  ].filter(k => !mailSent[k]).length

  async function fetchAllData() {
    setLoading(true)
    setError(null)

    const [empRes, taskRes, notifRes, pointRes] = await Promise.all([
      supabase.from('employees').select('*').order('created_at', { ascending: false }),
      supabase.from('onboarding_tasks').select('employee_id,stage_id,is_done,mail_sent'),
      supabase.from('notifications').select('employee_id,notification_type,mail_sent'),
      supabase.from('point_requests').select('employee_id,employee_type,point_type,mail_sent'),
    ])

    if (empRes.error) { setError(empRes.error.message); setLoading(false); return }
    setEmployees(empRes.data ?? [])

    const newDone: Record<string, boolean> = {}
    const newMail: Record<string, boolean> = {}

    for (const t of (taskRes.data ?? [])) {
      if (t.is_done)   newDone[`${t.employee_id}_${t.stage_id}`]      = true
      if (t.mail_sent) newMail[`mail_${t.employee_id}_${t.stage_id}`] = true
    }
    for (const n of (notifRes.data ?? [])) {
      const k = n.notification_type === 'hire'
        ? `hire_notif_${n.employee_id}`
        : `leave_notif_${n.employee_id}`
      if (n.mail_sent) newMail[k] = true
    }
    for (const p of (pointRes.data ?? [])) {
      const k = `${p.employee_type}_${p.point_type}_${p.employee_id}`
      if (p.mail_sent) newMail[k] = true
    }

    setStageDone(newDone)
    setMailSent(newMail)
    setLoading(false)
  }

  async function handleSubmit() {
    if (!form.name.trim()) return
    setSubmitting(true)
    const payload = {
      name:       form.name.trim(),
      join_date:  form.join_date  || null,
      leave_date: form.leave_date || null,
      division:   form.division   || null,
      team:       form.team       || null,
      leader:     form.leader     || null,
      status:     form.status,
    }
    const { error } = editTarget
      ? await supabase.from('employees').update(payload).eq('id', editTarget.id)
      : await supabase.from('employees').insert(payload)

    if (error) setError(error.message)
    else       closeForm()
    setSubmitting(false)
    fetchAllData()
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`"${name}" 직원을 삭제하시겠습니까?\n관련 데이터도 함께 삭제됩니다.`)) return
    const { error } = await supabase.from('employees').delete().eq('id', id)
    if (error) setError(error.message)
    else       fetchAllData()
  }

  function openAdd() { setEditTarget(null); setForm(EMPTY_FORM); setShowForm(true) }
  function openEdit(emp: Employee) {
    setEditTarget(emp)
    setForm({
      name:       emp.name,
      join_date:  emp.join_date  ?? '',
      leave_date: emp.leave_date ?? '',
      division:   emp.division   ?? '',
      team:       emp.team       ?? '',
      leader:     emp.leader     ?? '',
      status:     emp.status,
    })
    setShowForm(true)
  }
  function closeForm() { setShowForm(false); setEditTarget(null); setForm(EMPTY_FORM) }

  async function toggleDone(empId: string, stageId: string) {
    const key     = `${empId}_${stageId}`
    const newDone = !stageDone[key]
    setStageDone(p => ({ ...p, [key]: newDone }))

    const stage = STAGES.find(s => s.id === stageId)!
    const { error } = await supabase.from('onboarding_tasks').upsert({
      employee_id: empId,
      stage_id:    stageId,
      stage_label: stage.label,
      timing:      stage.timing,
      sort_order:  STAGES.indexOf(stage),
      is_done:     newDone,
      done_at:     newDone ? new Date().toISOString() : null,
    }, { onConflict: 'employee_id,stage_id' })

    if (error) {
      setError(error.message)
      setStageDone(p => ({ ...p, [key]: !newDone }))
    }
  }

  async function sendMail(key: string) {
    setMailSent(p => ({ ...p, [key]: true }))

    let dbErr: string | null = null

    if (key.startsWith('hire_notif_') || key.startsWith('leave_notif_')) {
      const isHire = key.startsWith('hire_notif_')
      const empId  = key.replace(isHire ? 'hire_notif_' : 'leave_notif_', '')
      const { error } = await supabase.from('notifications').upsert({
        employee_id:       empId,
        notification_type: isHire ? 'hire' : 'leave',
        fixed_recipients:  isHire ? [...FR.hire] : [...FR.leave],
        extra_recipients:  [],
        mail_sent:         true,
        mail_sent_at:      new Date().toISOString(),
      }, { onConflict: 'employee_id,notification_type' })
      dbErr = error?.message ?? null

    } else if (/^(hire|leave)_(cafe|wellness)_/.test(key)) {
      const m = key.match(/^(hire|leave)_(cafe|wellness)_(.+)$/)!
      const [, empType, pointType, empId] = m
      const emp     = employees.find(e => e.id === empId)
      const dateStr = empType === 'hire' ? emp?.join_date ?? null : emp?.leave_date ?? null
      const { error } = await supabase.from('point_requests').upsert({
        employee_id:      empId,
        employee_type:    empType,
        point_type:       pointType,
        base_month:       formatMonth(dateStr),
        extra_recipients: [],
        mail_sent:        true,
        mail_sent_at:     new Date().toISOString(),
      }, { onConflict: 'employee_id,point_type' })
      dbErr = error?.message ?? null

    } else if (key.startsWith('mail_')) {
      const match = key.match(/^mail_(.+)_(s\d+)$/)
      if (match) {
        const [, empId, stageId] = match
        const stage = STAGES.find(s => s.id === stageId)!
        const { error } = await supabase.from('onboarding_tasks').upsert({
          employee_id:  empId,
          stage_id:     stageId,
          stage_label:  stage.label,
          timing:       stage.timing,
          sort_order:   STAGES.indexOf(stage),
          mail_sent:    true,
          mail_sent_at: new Date().toISOString(),
        }, { onConflict: 'employee_id,stage_id' })
        dbErr = error?.message ?? null
      }
    }

    if (dbErr) {
      setError(dbErr)
      setMailSent(p => ({ ...p, [key]: false }))
    }
  }

  useEffect(() => { fetchAllData() }, [])

  return (
    <main className="min-h-screen bg-slate-50">

      <EmployeeModal
        show={showForm} isEdit={!!editTarget}
        form={form} submitting={submitting}
        onChange={(f, v) => setForm(p => ({ ...p, [f]: v }))}
        onSubmit={handleSubmit}
        onClose={closeForm}
      />

      <header className="bg-white border-b border-gray-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-5-3.87M9 20H4v-2a4 4 0 015-3.87m6 5.87a4 4 0 10-8 0m4-8a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            </div>
            <span className="text-sm font-bold text-gray-900">입퇴사자 관리 대시보드</span>
            <span className="text-xs text-gray-400 hidden sm:inline">Hecto Innovation HR</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={openAdd}
              className="inline-flex items-center gap-1.5 text-xs font-semibold bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v10M3 8h10" />
              </svg>
              직원 등록
            </button>
            <span className="text-xs text-gray-400">{todayStr}</span>
            <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold">HR</div>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-7 space-y-12">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-red-600">⚠️ {error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-sm ml-4">닫기</button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: '처리 필요 알림', value: loading ? '…' : pendingNotif, sub: '알림 미발송 건',  icon: '🔔', bg: 'bg-orange-500', ring: 'ring-orange-200' },
            { label: '오늘 신규 입사자', value: loading ? '…' : todayHires,   sub: `${todayStr} 입사`, icon: '👋', bg: 'bg-blue-500',   ring: 'ring-blue-200'   },
            { label: '오늘 퇴사자',     value: loading ? '…' : todayLeaves,  sub: `${todayStr} 퇴사`, icon: '📦', bg: 'bg-purple-500', ring: 'ring-purple-200' },
            { label: '미발송 메일',     value: loading ? '…' : pendingMail,  sub: '포인트 발송 대기', icon: '📧', bg: 'bg-red-500',    ring: 'ring-red-200'    },
          ].map(c => (
            <div key={c.label} className={`bg-white rounded-xl ring-1 ${c.ring} p-5 flex items-center gap-4 shadow-sm`}>
              <div className={`${c.bg} w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0`}>{c.icon}</div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-500 truncate">{c.label}</p>
                <p className="text-2xl font-black text-gray-900 leading-none my-0.5">{c.value}</p>
                <p className="text-xs text-gray-400 truncate">{c.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            <span className="text-sm">직원 데이터를 불러오는 중...</span>
          </div>
        )}

        {!loading && (
          <>

          {/* ── 1. 입사자 알림 관리 ── */}
          <section>
            <SectionHead icon="👋" title="입사자 알림 관리"
              desc="신규 입사자 등록 시 인사팀·총무팀 알림 발송"
              badge={`${newHires.length}명`}
              action={
                <button onClick={openAdd}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-2.5 py-1 rounded-lg transition-colors">
                  + 입사자 추가
                </button>
              }
            />
            {newHires.length === 0 ? (
              <EmptyState label="등록된 입사자가 없습니다" />
            ) : (
              <div className="space-y-2">
                {newHires.map(h => (
                  <NotifRow key={h.id}
                    name={h.name}
                    date={h.join_date ?? '-'}
                    division={h.division ?? ''}
                    team={h.team ?? ''}
                    mailSent={!!mailSent[`hire_notif_${h.id}`]}
                    onSend={() => sendMail(`hire_notif_${h.id}`)}
                    onEdit={() => openEdit(h)}
                    onDelete={() => handleDelete(h.id, h.name)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── 2. 입사자별 온보딩 ── */}
          <section>
            <SectionHead icon="🚀" title="입사자별 온보딩 관리"
              desc="카드를 펼쳐 단계별 완료 체크 · 메일 발송"
              badge={`${newHires.length}명`}
            />
            {newHires.length === 0 ? <EmptyState label="등록된 입사자가 없습니다" /> : (
              <div className="space-y-3">
                {newHires.map(hire => (
                  <OnboardingCard key={hire.id}
                    hire={hire}
                    stageDone={stageDone}
                    mailSent={mailSent}
                    onToggleDone={toggleDone}
                    onSendMail={sendMail}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── 3. 입사자 카페포인트 ── */}
          <section>
            <SectionHead icon="☕" title="입사자 카페포인트 메일 발송 관리"
              desc="엑셀 업로드 → 일할 계산 금액 자동 입력 → 메일 발송"
              badge={`${newHires.length}명`}
              action={<ExcelUploadBtn onParsed={setCafeExcel} />}
            />
            {newHires.length === 0 ? <EmptyState label="등록된 입사자가 없습니다" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {newHires.map(e => {
                  const key = `hire_cafe_${e.id}`
                  return (
                    <PointCard key={e.id}
                      name={e.name} dateLabel="입사일" date={e.join_date ?? '-'}
                      baseMonth={formatMonth(e.join_date)}
                      mailSent={!!mailSent[key]} onSendMail={() => sendMail(key)}
                      fixedRecipients={FR.cafe}
                      defaultSubject={`[카페포인트 안내] ${e.name} 님 ${e.join_date ?? ''} 입사 · ${e.division ?? ''} ${e.team ?? ''} ${formatMonth(e.join_date)} 일할 계산`}
                      autoAmount={lookupExcelAmount(cafeExcel, e.join_date, 'hire')}
                    />
                  )
                })}
              </div>
            )}
          </section>

          {/* ── 4. 입사자 웰니스 포인트 ── */}
          <section>
            <SectionHead icon="💚" title="입사자 웰니스 포인트 메일 발송 관리"
              desc="엑셀 업로드 → 일할 계산 금액 자동 입력 → 메일 발송"
              badge={`${newHires.length}명`}
              action={<ExcelUploadBtn onParsed={setWellnessExcel} />}
            />
            {newHires.length === 0 ? <EmptyState label="등록된 입사자가 없습니다" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {newHires.map(e => {
                  const key = `hire_wellness_${e.id}`
                  return (
                    <PointCard key={e.id}
                      name={e.name} dateLabel="입사일" date={e.join_date ?? '-'}
                      baseMonth={formatMonth(e.join_date)}
                      mailSent={!!mailSent[key]} onSendMail={() => sendMail(key)}
                      fixedRecipients={FR.wellness}
                      defaultSubject={`[웰니스포인트 안내] ${e.name} 님 ${e.join_date ?? ''} 입사 · ${e.division ?? ''} ${e.team ?? ''} ${formatMonth(e.join_date)} 일할 계산`}
                      autoAmount={lookupExcelAmount(wellnessExcel, e.join_date, 'hire')}
                    />
                  )
                })}
              </div>
            )}
          </section>

          {/* ── 5. 퇴사자 알림 관리 ── */}
          <section>
            <SectionHead icon="🚪" title="퇴사자 알림 관리"
              desc="퇴사자 등록 시 인사팀·총무팀·보안인프라팀 알림 발송"
              badge={`${departures.length}명`}
              action={
                <button onClick={() => { setForm({ ...EMPTY_FORM, status: 'resigned' }); setEditTarget(null); setShowForm(true) }}
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1 rounded-lg transition-colors">
                  + 퇴사자 추가
                </button>
              }
            />
            {departures.length === 0 ? <EmptyState label="등록된 퇴사자가 없습니다" /> : (
              <div className="space-y-2">
                {departures.map(d => (
                  <NotifRow key={d.id}
                    name={d.name}
                    date={d.leave_date ?? '-'}
                    division={d.division ?? ''}
                    team={d.team ?? ''}
                    mailSent={!!mailSent[`leave_notif_${d.id}`]}
                    onSend={() => sendMail(`leave_notif_${d.id}`)}
                    onEdit={() => openEdit(d)}
                    onDelete={() => handleDelete(d.id, d.name)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── 6. 퇴사자 카페포인트 ── */}
          <section>
            <SectionHead icon="🧾" title="퇴사자 카페포인트 메일 발송 관리"
              desc="엑셀 업로드 → 일할 계산 금액 자동 입력 → 메일 발송"
              badge={`${departures.length}명`}
              action={<ExcelUploadBtn onParsed={data => setCafeExcel(prev => ({ ...prev, ...data }))} />}
            />
            {departures.length === 0 ? <EmptyState label="등록된 퇴사자가 없습니다" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {departures.map(e => {
                  const key = `leave_cafe_${e.id}`
                  return (
                    <PointCard key={e.id}
                      name={e.name} dateLabel="퇴사일" date={e.leave_date ?? '-'}
                      baseMonth={formatMonth(e.leave_date)}
                      mailSent={!!mailSent[key]} onSendMail={() => sendMail(key)}
                      fixedRecipients={FR.cafe}
                      defaultSubject={`[카페포인트 정산] ${e.name} 님 ${e.leave_date ?? ''} 퇴사 · ${e.division ?? ''} ${e.team ?? ''} ${formatMonth(e.leave_date)} 일할 계산`}
                      autoAmount={lookupExcelAmount(cafeExcel, e.leave_date, 'leave')}
                    />
                  )
                })}
              </div>
            )}
          </section>

          {/* ── 7. 퇴사자 웰니스 포인트 ── */}
          <section>
            <SectionHead icon="💼" title="퇴사자 웰니스 포인트 메일 발송 관리"
              desc="엑셀 업로드 → 일할 계산 금액 자동 입력 → 메일 발송"
              badge={`${departures.length}명`}
              action={<ExcelUploadBtn onParsed={data => setWellnessExcel(prev => ({ ...prev, ...data }))} />}
            />
            {departures.length === 0 ? <EmptyState label="등록된 퇴사자가 없습니다" /> : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {departures.map(e => {
                  const key = `leave_wellness_${e.id}`
                  return (
                    <PointCard key={e.id}
                      name={e.name} dateLabel="퇴사일" date={e.leave_date ?? '-'}
                      baseMonth={formatMonth(e.leave_date)}
                      mailSent={!!mailSent[key]} onSendMail={() => sendMail(key)}
                      fixedRecipients={FR.wellness}
                      defaultSubject={`[웰니스포인트 정산] ${e.name} 님 ${e.leave_date ?? ''} 퇴사 · ${e.division ?? ''} ${e.team ?? ''} ${formatMonth(e.leave_date)} 일할 계산`}
                      autoAmount={lookupExcelAmount(wellnessExcel, e.leave_date, 'leave')}
                    />
                  )
                })}
              </div>
            )}
          </section>

          </>
        )}
      </div>
    </main>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-200 py-10 flex items-center justify-center">
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}

