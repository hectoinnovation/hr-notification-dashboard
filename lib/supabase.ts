import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL')
if (!supabaseAnonKey) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Employee = {
  id: number
  name: string
  join_date?: string
  leave_date?: string
  exit_date?: string
  return_date?: string | null  // 퇴사자 전용: 같은 정산월 안의 휴직복귀일(퇴사 전 복귀한 경우에만 값이 있음) — 헥토코인 인정 시작일로 쓰인다
  department?: string   // 부서
  division?: string     // 실
  team?: string         // 팀
  position?: string     // 직책/직급
  leader?: string
  join_reason?: string  // 입사 | 전적 | 휴직 | 휴직복귀 | 인턴
  phone?: string        // 휴대폰번호
  status: 'active' | 'resigned'
  is_onboarding_excluded?: boolean  // 관리자가 온보딩 목록에서 수동 제외 처리했는지 여부
  customer_id?: string  // 웰니스코인 엑셀(선불 관리자 거래 요청 양식) C열에 쓰이는 고객아이디. 기존 직원은 비어있을 수 있음
  performance_point_target?: boolean  // 퇴사자 성과포인트 정산 대상 여부(담당자가 직접 체크)
  tenure_point_target?: boolean       // 퇴사자 근속포인트 정산 대상 여부(담당자가 직접 체크)
  is_transfer?: boolean  // 전적 여부(입사/퇴사 status·join_reason과 별개 값) — 퇴사자에게만 노출/저장.
                          // 입사자의 전적 여부는 기존처럼 join_reason==='전적'이 그대로 담당하므로
                          // 여기서는 건드리지 않는다(중복 신호로 인한 혼선 방지)
}
