import type { SupabaseClient } from '@supabase/supabase-js'
import type { CalendarConnection, ExternalCalendar } from '../../src/types/externalCalendar.ts'
import type { CalendarProviderAdapter } from './provider.ts'
import { syncCalendar } from './provider.ts'
import { SupabaseSyncStore } from './supabaseStore.ts'
import { syncDiagnostic, syncStage } from './diagnostics.ts'
import { GoogleAuthorizationExpired } from './google.ts'
export async function runCalendarSync(service:SupabaseClient,calendar:ExternalCalendar,connection:CalendarConnection,factory:()=>Promise<CalendarProviderAdapter>) {
 let lease:string|undefined
 try {
  const claim=await service.rpc('claim_calendar_sync',{cid:calendar.id})
  if(claim.error) throw claim.error
  if(!claim.data) return {skipped:true,count:0}
  lease=claim.data as string
  const provider=await syncStage(connection.provider==='google'?'google_token_refresh':'unknown_sync_failure',factory)
  if(provider.provider!==connection.provider) throw new Error('Wrong provider adapter')
  const store=new SupabaseSyncStore(service,lease),previous=await store.readState(calendar),now=Date.now(),day=86400000
  const window=previous&&Date.parse(previous.window.end)>now+30*day?previous.window:{start:new Date(now-30*day).toISOString(),end:new Date(now+180*day).toISOString()}
  const result=await syncCalendar(provider,calendar,store,window)
  const finished=await service.rpc('finish_calendar_sync',{cid:calendar.id,lease_token:lease,error_category:null})
  if(finished.error) throw finished.error
  return result
 } catch(error) {
  const diagnostic=syncDiagnostic(error,calendar.id,calendar.connection_id)
  console.error(JSON.stringify(diagnostic))
  if(lease) {
   try {await service.rpc('finish_calendar_sync',{cid:calendar.id,lease_token:lease,error_category:error instanceof GoogleAuthorizationExpired?'authorization_required':diagnostic.stage})} catch { /* Fixed diagnostics only; stale leases expire. */ }
  }
  return {error:'calendar_sync_failed',stage:diagnostic.stage} as const
 }
}
