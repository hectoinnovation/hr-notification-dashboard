import * as XLSX from 'xlsx'
import type { Employee } from './supabase'

// ─── 웰니스포인트 계산 · 엑셀 row builder — 클라이언트(화면 표시/다운로드)와
// 서버(app/api/wellness-mail, 메일 첨부 생성) 양쪽이 이 파일을 그대로 import해서 쓴다.
// 절대 복제하지 말 것 — "화면 체크 대상 = 엑셀 다운로드 대상 = 메일 첨부 엑셀 대상"이
// 항상 정확히 일치해야 하며, 이는 동일한 함수를 공유해야만 보장된다.

/** 각 달의 마지막 날짜(일수) */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** 직원 유형 표시 레이블 (TypeBadge / 구분 컬럼 공용) */
export function empLabel(emp: { status: string; join_reason?: string }): string {
  if (emp.status === 'resigned')          return '퇴사'
  if (emp.join_reason === '전적')         return '전적'
  if (emp.join_reason === '휴직')         return '휴직자'
  if (emp.join_reason === '휴직복귀')     return '휴직복귀자'
  if (emp.join_reason === '인턴')         return '인턴'
  return '입사'
}

/**
 * 포인트 계산 기준일 반환
 * ─ 휴직자: 휴직시작일(exit_date) − 1일  (전날까지 근무 인정)
 * ─ 퇴사자 / 기타: exit_date 그대로 반환 (기존 로직 유지)
 * ─ exit_date 없음: null 반환
 *
 * ※ 입사자·퇴사자·전적자·휴직복귀자에는 일체 영향 없음
 */
export function calcEffectiveLeaveDate(emp: Employee): string | null {
  if (!emp.exit_date) return null
  if (emp.join_reason !== '휴직') return emp.exit_date   // 퇴사자 등: 변경 없음
  // 휴직자 전용: 휴직시작일 − 1일
  const d = new Date(emp.exit_date)
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function calcWellnessHire(joinDateStr: string): number {
  const d = new Date(joinDateStr)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const dim = daysInMonth(d.getFullYear(), month)
  // 입사월은 원단위 반올림, 완전 재직월은 정수
  const hireMonthAmt = Math.round(50000 * (dim - day + 1) / dim)
  const remainingMonths = 12 - month
  return hireMonthAmt + remainingMonths * 50000
}

export function calcWellnessLeave(joinDateStr: string | null | undefined, leaveDateStr: string): {
  prePaid: number; recognized: number; reclaim: number
} {
  const leaveD     = new Date(leaveDateStr)
  const leaveYear  = leaveD.getFullYear()
  const leaveMonth = leaveD.getMonth() + 1
  const leaveDay   = leaveD.getDate()
  const dimLeave   = daysInMonth(leaveYear, leaveMonth)

  // 각 월 단위로 개별 반올림 후 합산 (소수 항목 2개 합산 시 1원 오차 방지)
  let recognized = 0
  if (joinDateStr) {
    const joinD     = new Date(joinDateStr)
    const joinYear  = joinD.getFullYear()
    const joinMonth = joinD.getMonth() + 1
    const joinDay   = joinD.getDate()
    const dimJoin   = daysInMonth(joinYear, joinMonth)

    if (joinYear === leaveYear) {
      if (joinMonth === leaveMonth) {
        recognized = Math.round(50000 * (leaveDay - joinDay + 1) / dimJoin)
      } else {
        const joinAmt   = Math.round(50000 * (dimJoin - joinDay + 1) / dimJoin)
        const midMonths = leaveMonth - joinMonth - 1
        const leaveAmt  = Math.round(50000 * leaveDay / dimLeave)
        recognized = joinAmt + midMonths * 50000 + leaveAmt
      }
    } else {
      // 입사년도 < 퇴사년도: 정산년도 1월부터 완전월 + 퇴사월 일할
      const leaveAmt = Math.round(50000 * leaveDay / dimLeave)
      recognized = (leaveMonth - 1) * 50000 + leaveAmt
    }
  } else {
    const leaveAmt = Math.round(50000 * leaveDay / dimLeave)
    recognized = (leaveMonth - 1) * 50000 + leaveAmt
  }

  // 정산년도(leaveYear) > 입사년도 → 연초에 12개월 전체 선지급으로 봄 (600,000)
  // 정산년도 === 입사년도 → 입사일부터 12월 말까지 일할계산
  const prePaid = joinDateStr
    ? (new Date(joinDateStr).getFullYear() < leaveYear ? 600000 : calcWellnessHire(joinDateStr))
    : 0
  const reclaim = Math.round(Math.max(0, prePaid - recognized))
  return { prePaid, recognized, reclaim }
}

/** 행 배열로 워크북 생성 — 화면 다운로드와 서버 메일첨부가 공유 */
export function buildXlsxWorkbook(rows: Record<string, unknown>[], sheetName: string) {
  const ws = XLSX.utils.json_to_sheet(rows)
  // 컬럼 너비 자동 설정
  ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length * 2, 16) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return wb
}

/** buildWellnessExcelRows 입력 항목 — 클라이언트(화면 체크 대상)와 서버(메일 첨부 생성)가 공유하는 형태 */
export type WellnessMailEntryInput = { emp: Employee; empType: 'hire' | 'leave'; mailKey: string; isTransfer: boolean }

/** 웰니스포인트 엑셀 행 생성 */
export function buildWellnessExcelRows(
  entries: WellnessMailEntryInput[],
  sentMap: Record<string, boolean>,
): Record<string, unknown>[] {
  return entries.map(({ emp, empType, mailKey, isTransfer }) => {
    const 구분       = empLabel(emp)
    const isLeaveType = empType === 'leave' || emp.join_reason === '휴직'
    const calcDate  = calcEffectiveLeaveDate(emp)
    const 표시일    = (empType === 'hire' ? emp.join_date : emp.exit_date) ?? '-'
    const 기준일    = isLeaveType ? (calcDate ?? 표시일) : 표시일

    let 지급예정금액 = '-'
    let 환수예정금액 = '-'
    let 최종처리금액 = '-'
    let 지급환수구분 = '-'
    let 계산기준설명 = '-'

    if (isTransfer) {
      지급환수구분 = '해당 없음'
      계산기준설명 = '전적자는 웰니스포인트 계산 대상 아님'
    } else if (!isLeaveType) {
      // 입사자 / 휴직복귀자
      if (emp.join_date) {
        const amt = calcWellnessHire(emp.join_date)
        지급예정금액 = `${amt.toLocaleString()}원`
        최종처리금액 = 지급예정금액
        지급환수구분 = '지급'
        계산기준설명 = emp.join_reason === '휴직복귀'
          ? `복귀일 ${표시일} 기준 입사자 계산 (월 만근 50,000원 / 12월 말 일할)`
          : `입사일 ${표시일} 기준 입사자 계산 (월 만근 50,000원 / 12월 말 일할)`
      } else {
        계산기준설명 = '입사일/복귀일 미입력'
      }
    } else {
      // 퇴사자 / 휴직자
      if (!emp.join_date) {
        계산기준설명 = '입사일 미입력'
      } else {
        const leaveDateForCalc = calcDate ?? emp.leave_date
        if (leaveDateForCalc) {
          const { prePaid, recognized, reclaim } = calcWellnessLeave(emp.join_date, leaveDateForCalc)
          지급예정금액 = recognized > 0 ? `${recognized.toLocaleString()}원` : '-'
          환수예정금액 = reclaim > 0 ? `${reclaim.toLocaleString()}원` : '-'
          최종처리금액 = reclaim > 0
            ? `환수 ${reclaim.toLocaleString()}원`
            : `인정 ${recognized.toLocaleString()}원`
          지급환수구분 = reclaim > 0 ? '환수' : '인정/정산'
          계산기준설명 = emp.join_reason === '휴직'
            ? `휴직시작일 ${emp.exit_date} / 계산기준일 ${calcDate} / 선지급 ${prePaid.toLocaleString()}원 → 인정 ${recognized.toLocaleString()}원`
            : `퇴사일 ${표시일} 기준 / 선지급 ${prePaid.toLocaleString()}원 → 인정 ${recognized.toLocaleString()}원`
        } else {
          계산기준설명 = emp.join_reason === '휴직' ? '휴직시작일 미입력' : '퇴사일 미입력'
        }
      }
    }

    return {
      '구분': 구분, '이름': emp.name, '이메일': '-',
      '부서': emp.department ?? '-', '직책/직급': emp.position ?? '-',
      '입사일': emp.join_date ?? '-',
      '표시일': 표시일, '기준일': 기준일 ?? '-',
      '포인트 종류': '웰니스포인트',
      '지급/환수 구분': 지급환수구분,
      '지급 예정 금액': 지급예정금액,
      '환수 예정 금액': 환수예정금액,
      '최종 처리 금액': 최종처리금액,
      '계산 기준 설명': 계산기준설명,
      '메일 발송 상태': sentMap[mailKey] ? '발송완료' : '미발송',
      '비고': '',
    }
  })
}

/**
 * buildWellnessExcelRows가 생성한 '최종 처리 금액' 표시 문자열(예: '1,234원' / '환수 1,234원' /
 * '인정 1,234원' / '-')을 숫자로 환산. 별도 계산 로직이 아니라 엑셀에 실제 표시되는 값 자체를
 * 파싱하는 방식이라 메일 본문 합계가 항상 엑셀 내용과 정확히 일치한다.
 */
export function parseWellnessFinalAmount(text: unknown): number {
  const s = String(text ?? '')
  const digits = s.replace(/[^0-9]/g, '')
  if (!digits) return 0
  const n = parseInt(digits, 10)
  return s.includes('환수') ? -n : n
}
export function sumWellnessFinalAmount(rows: Record<string, unknown>[]): number {
  return rows.reduce((sum, r) => sum + parseWellnessFinalAmount(r['최종 처리 금액']), 0)
}

/**
 * 메일 첨부파일명 전용(화면 엑셀 다운로드 파일명과는 별개, 한글 그대로 유지) — ASCII 영문
 * 파일명 사용. 한글 파일명은 MIME에서 RFC 2231 다중 파라미터로 인코딩되는데, 이것만으로는
 * 첨부 누락이 재현되지 않았지만(테스트 결과 계속 미수신) 예방적으로 유지한다.
 */
export function wellnessMailAttachmentFilename(date: Date): string {
  const yyyymm = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`
  return `wellness_settlement_${yyyymm}.xlsx`
}
