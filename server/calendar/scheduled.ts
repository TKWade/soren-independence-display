import {cleanupImages} from './imageCleanup.ts'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CalendarServerConfig, ProviderRegistry } from './actions.ts'
import type { ExternalCalendar, CalendarConnection } from '../../src/types/externalCalendar.ts'
import { googleAdapter } from './googleCredentials.ts'
import { runCalendarSync } from './runSync.ts'
/** Authenticated scheduler enumerates its own targets. No caller-selected IDs. */
export function scheduledSyncHandler(config:CalendarServerConfig&{schedulerSecret:string},providers:ProviderRegistry={},injected?:SupabaseClient,defer?:(task:Promise<unknown>)=>void) {
 return async(request:Request)=>{
  const reply=(status:number,value:unknown)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}})
  if(request.method!=='POST') return reply(405,{error:'method_not_allowed'})
  const supplied=request.headers.get('x-calendar-scheduler-secret')??''
  const digest=async(v:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))
  const [a,b]=await Promise.all([digest(supplied),digest(config.schedulerSecret)])
  let difference=0;for(let i=0;i<a.length;i++) difference|=a[i]^b[i]
  if(config.schedulerSecret.length<32||difference!==0) return reply(401,{error:'not_authorized'})
  if((await request.text()).trim()!=='{}') return reply(400,{error:'empty_object_required'})
  const service=injected??createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}})
  const work=async()=>{
   const started=Date.now()
   const {data,error}=await service.rpc('eligible_calendar_syncs')
   if(error) return {error:'scheduler_unavailable'}
   const results=[]
   for(const item of (data??[]) as {calendar:ExternalCalendar;connection:CalendarConnection}[]) {
    if(Date.now()-started>80000) break // Unattempted calendars sort first on the next tick.
    const factory=providers[item.connection.provider]??(item.connection.provider==='google'&&config.google?()=>googleAdapter(service,config.google!,item.connection.id,undefined,started+110000):undefined)
    if(!factory) continue
    results.push(await runCalendarSync(service,item.calendar,item.connection,()=>factory(item.connection)))
   }
   try {await cleanupImages(service)}catch{/* Cleanup remains queued. */}
   const summary={processed:results.length,failed:results.filter(r=>'error' in r).length,skipped:results.filter(r=>'skipped' in r&&r.skipped).length}
   console.info(JSON.stringify({event:'calendar_scheduled_complete',...summary}))
   return summary
  }
  if(defer){defer(work().catch(()=>console.error('Calendar scheduled run failed.')));return reply(202,{accepted:true})}
  return reply(200,await work())
 }
}
