import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../data/supabase'
export function useSession() {
 const [session,setSession] = useState<Session | null>(null)
 const [loading,setLoading] = useState(Boolean(supabase))
 useEffect(() => {
  if (!supabase) return
  let alive = true
  // INITIAL_SESSION is emitted by the auth client; no competing async getSession request.
  const { data } = supabase.auth.onAuthStateChange((_event,next) => {
   if (alive) { setSession(next); setLoading(false) }
  })
  return () => { alive=false; data.subscription.unsubscribe() }
 },[])
 return { session, loading }
}
