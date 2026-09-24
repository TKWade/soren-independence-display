import { createClient } from '@supabase/supabase-js'
import type { CalendarConnection, ExternalCalendar } from '../../src/types/externalCalendar.ts'
import type { CalendarProvider } from '../../src/types/calendar.ts'
import { syncCalendar, type CalendarProviderAdapter } from './provider.ts'
import { SupabaseSyncStore } from './supabaseStore.ts'
export type ProviderRegistry=Partial<Record<CalendarProvider,(connection:CalendarConnection)=>Promise<CalendarProviderAdapter>>>
export interface CalendarServerConfig {url:string;anonKey:string;serviceRoleKey:string;allowedOrigins:string[]}
/** Empty registry is intentional: no OAuth, token exchange, provider HTTP or mock data in production. */
export function calendarActionHandler(config:CalendarServerConfig,providers:ProviderRegistry={}) {
 return async(request:Request):Promise<Response>=>{
  const origin=request.headers.get('origin')
  const headers:Record<string,string>={'Content-Type':'application/json','Vary':'Origin'}
  if(origin&&config.allowedOrigins.includes(origin)) {headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';headers['Access-Control-Allow-Methods']='POST, OPTIONS'}
  const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers})
  if(origin&&!config.allowedOrigins.includes(origin)) return reply(403,{error:'origin_not_allowed'})
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers})
  if(request.method!=='POST') return reply(405,{error:'method_not_allowed'})
  const authorization=request.headers.get('authorization')??''
  if(!authorization.startsWith('Bearer ')) return reply(401,{error:'sign_in_required'})
  try {
   const viewer=createClient(config.url,config.anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}})
   const {data:auth,error:authError}=await viewer.auth.getUser(authorization.slice(7))
   if(authError||!auth.user) return reply(401,{error:'sign_in_required'})
   const body=await request.json() as {householdId?:string;action?:string;id?:string}
   if(!body.householdId||!body.id||!['connect','listCalendars','sync'].includes(body.action??'')) return reply(400,{error:'invalid_action'})
   const {data:membership,error:membershipError}=await viewer.from('household_members').select('id').eq('household_id',body.householdId).eq('user_id',auth.user.id).maybeSingle()
   if(membershipError||!membership) return reply(403,{error:'not_authorized'})
   // Connecting will require state+PKCE OAuth and server-owned Vault storage in the next milestone.
   if(body.action==='connect') return reply(501,{error:'provider_not_configured'})
   let calendar:ExternalCalendar|undefined
   if(body.action==='sync') {
    const {data,error}=await viewer.from('external_calendars').select('*').eq('household_id',body.householdId).eq('id',body.id).maybeSingle()
    if(error||!data) return reply(404,{error:'calendar_not_found'})
    calendar=data as ExternalCalendar
   }
   const {data:connection,error}=await viewer.from('calendar_connections').select('*').eq('household_id',body.householdId).eq('id',calendar?.connection_id??body.id).maybeSingle()
   if(error||!connection) return reply(404,{error:'connection_not_found'})
   const conn=connection as CalendarConnection
   const factory=providers[conn.provider]
   if(!factory) return reply(501,{error:'provider_not_configured'})
   if(conn.status!=='connected') return reply(409,{error:'authorization_required'})
   const provider=await factory(conn)
   if(provider.provider!==conn.provider) throw new Error('Wrong provider adapter')
   const service=createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}})
   if(body.action==='listCalendars') {
    const calendars=await provider.listCalendars()
    const {error}=await service.rpc('cache_provider_calendars',{connection:conn.id,calendars});if(error) throw error
    return reply(200,{count:calendars.length})
   }
   const store=new SupabaseSyncStore(service)
   const previous=await store.readState(calendar!)
   const now=Date.now(),day=86400000
   const window=previous&&Date.parse(previous.window.end)>now+30*day?previous.window:{start:new Date(now-30*day).toISOString(),end:new Date(now+180*day).toISOString()}
   try {return reply(200,await syncCalendar(provider,calendar!,store,window))}
   catch {
    await service.from('external_calendars').update({sync_status:'error',sync_error:'Synchronization failed; retry or reconnect.'}).eq('id',calendar!.id)
    throw new Error('Sync failed')
   }
  } catch {return reply(503,{error:'calendar_action_failed'})} // Never return tokens, upstream URLs or raw provider errors.
 }
}
