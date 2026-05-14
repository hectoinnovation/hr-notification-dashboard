import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

export interface Employee {
  id: string
  name: string
  join_date: string | null
  leave_date: string | null
  division: string | null
  team: string | null
  leader: string | null
  status: 'active' | 'resigned'
  created_at: string
  updated_at: string
}