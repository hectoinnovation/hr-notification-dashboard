import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Employee = {
  id: number
  name: string
  join_date?: string
  leave_date?: string
  exit_date?: string
  department?: string   // 부서
  division?: string     // 실
  team?: string         // 팀
  position?: string     // 직책/직급
  leader?: string
  join_reason?: string  // 입사 | 전적
  status: 'active' | 'resigned'
}
