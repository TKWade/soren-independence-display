import { createClient } from '@supabase/supabase-js'
const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
// Only the publishable (or legacy anon) key belongs in a Vite build.
export const supabase = url && key && !url.includes('YOUR_PROJECT')
 ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }) : null
export function client() {
 if (!supabase) throw new Error('Supabase is not configured.')
 return supabase
}
