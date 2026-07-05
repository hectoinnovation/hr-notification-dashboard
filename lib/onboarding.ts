import type { Employee } from './supabase'

/**
 * 온보딩 대상 제외 판별 (단일 기준) — 휴직복귀자 / 인턴 / 관리자가 온보딩 목록에서
 * 수동 제외 처리(is_onboarding_excluded)한 경우. 온보딩 자동 메일 생성·발송 경로
 * (handleSubmit, /api/cron/onboarding-mails, /api/cron/sync-scheduled-mails)가
 * 모두 이 함수를 공유해서 조건이 서로 어긋나지 않도록 한다.
 */
export function isOnboardingExcluded(emp: { join_reason?: string | null; is_onboarding_excluded?: boolean | null }): boolean {
  return emp.join_reason === '휴직복귀' || emp.join_reason === '인턴' || emp.is_onboarding_excluded === true
}

const TS = 'border-collapse:collapse;font-family:sans-serif;font-size:14px'
const TH = 'background:#fff7ed;border:1px solid #fed7aa;padding:8px 12px;text-align:left;white-space:nowrap'
const TD = 'border:1px solid #e5e7eb;padding:8px 12px;white-space:nowrap'

export const STAGES = [
  { id: 's_whr',  label: 'WHR 등록',                                           timing: '입사 전',        highlight: false },
  { id: 's_file', label: '신규입사자 파일 생성',                                timing: '입사 전',        highlight: false },
  { id: 's_docs', label: '연봉계약서 / 근로계약서 / 신규입사자 작성 서류 준비', timing: '입사 전',        highlight: false },
  { id: 's1',     label: '레몬베이스 계정 생성',                                timing: '입사 전',        highlight: false },
  { id: 's2',     label: '리더 면담 및 목표 설정',                              timing: '입사 후',        highlight: false },
  { id: 's3',     label: '레몬베이스 목표/가중치 승인 신청',                    timing: '입사 후 7일 내', highlight: true  },
  { id: 's4',     label: '레몬베이스 최종 확인',                                timing: '입사 후',        highlight: false },
  { id: 's5',     label: '5 Missions PT 미션지 전달',                          timing: 'D-7',            highlight: false },
  { id: 's6',     label: '미션지 작성 및 재전달',                               timing: 'D-1',            highlight: false },
  { id: 's7',     label: '미션 공개',                                           timing: 'D-Day',          highlight: false },
  { id: 's_d30',  label: '입사 30일 리뷰',                                      timing: 'D+30',           highlight: false },
  { id: 's8',     label: 'PT 참석자 안내 및 일정 조율',                         timing: 'D+50',           highlight: false },
  { id: 's9',     label: 'PT 진행',                                             timing: 'D+60',           highlight: false },
  { id: 's10',    label: '현업 부서장 주관 심사',                                timing: 'D+63',           highlight: false },
  { id: 's11',    label: '대표이사 최종 결정',                                   timing: 'D+65',           highlight: false },
] as const

export type Stage = typeof STAGES[number]

// Stages that trigger automatic daily mail
// s3 (입사 후 7일 내 = join_date+7), s5(D-7), s6(D-1), s7(D-Day), s_d30(D+30), s8(D+50), s9(D+60), s10(D+63), s11(D+65)
export const AUTO_MAIL_STAGE_IDS: readonly string[] = ['s3', 's5', 's6', 's7', 's_d30', 's8', 's9', 's10', 's11']

// Stages applicable to transfer (전적자) — pre-hire preparation only
export const TRANSFER_STAGE_IDS: readonly string[] = ['s_whr', 's_file', 's_docs']
export const TRANSFER_STAGES = STAGES.filter(s => (TRANSFER_STAGE_IDS as string[]).includes(s.id))

export function calcDday(joinDate: string | null | undefined, timing: string): string | null {
  if (!joinDate) return null
  const join = new Date(joinDate)
  if (timing === 'D-Day') return joinDate
  const plus = timing.match(/^D\+(\d+)$/)
  if (plus) { const d = new Date(join); d.setDate(d.getDate() + parseInt(plus[1])); return d.toISOString().slice(0, 10) }
  const minus = timing.match(/^D-(\d+)$/)
  if (minus) { const d = new Date(join); d.setDate(d.getDate() - parseInt(minus[1])); return d.toISOString().slice(0, 10) }
  if (timing === '입사 후 7일 내') { const d = new Date(join); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10) }
  return null
}

export function makeOnboardingMailHtml(hire: Employee, stageLabel: string, timing: string, scheduledDate: string | null): string {
  return `<h3 style="color:#ea580c">[온보딩 알림] ${hire.name}님 ${stageLabel} 진행 요청</h3>
<p style="font-family:sans-serif;font-size:14px;color:#374151">안녕하세요.<br>인재협업팀입니다.<br><br>온보딩 일정에 따라 아래 업무 진행 부탁드립니다.</p>
<table style="${TS}">
<tr><th style="${TH}">입사자</th><td style="${TD}">${hire.name}</td></tr>
<tr><th style="${TH}">직책/직급</th><td style="${TD}">${hire.position ?? '-'}</td></tr>
<tr><th style="${TH}">입사일</th><td style="${TD}">${hire.join_date ?? '-'}</td></tr>
<tr><th style="${TH}">진행 항목</th><td style="${TD}">${stageLabel}</td></tr>
<tr><th style="${TH}">기준 일정</th><td style="${TD}">${timing}</td></tr>
<tr><th style="${TH}">예정일</th><td style="${TD}">${scheduledDate ?? '-'}</td></tr>
</table>
<p style="font-family:sans-serif;font-size:14px;color:#374151">확인 후 진행 부탁드립니다.</p>
<p style="font-family:sans-serif;font-size:14px;color:#374151;margin-top:16px">감사합니다.<br>인재협업팀 드림</p>`
}
