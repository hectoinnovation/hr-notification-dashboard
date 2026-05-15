import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (typeof window !== 'undefined') {
  console.log('[Supabase Debug] URL:', supabaseUrl ?? 'MISSING')
  console.log('[Supabase Debug] KEY prefix:', supabaseAnonKey ? supabaseAnonKey.slice(0, 20) + '...' : 'MISSING')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Employee = {
  id: number
  name: string
  join_date?: string
  leave_date?: string
  exit_date?: string
  division?: string
  team?: string
  leader?: string
  status: 'active'|'resigned'
}

