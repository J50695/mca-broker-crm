import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — copy web/.env.example to web/.env.local')
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '')

export const STORAGE_BUCKET = 'deal-documents'
