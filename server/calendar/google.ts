import { googleHttpError, syncStage } from './diagnostics.ts'
import type { ExternalCalendar } from '../../src/types/externalCalendar.ts'
import { normalizeGoogleEvent } from './normalization.ts'
import { SyncCursorExpired, type CalendarProviderAdapter, type PrivateSyncState, type ProviderCalendar, type SyncPage, type SyncWindow } from './provider.ts'
export const GOOGLE_SCOPES=['https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events.readonly'] as const
export class GoogleAuthorizationExpired extends Error {}
export interface GoogleConfig {clientId:string;clientSecret:string;redirectUri:string;returnUrl:string}
export type HttpFetch=typeof fetch
export async function googleToken(config:GoogleConfig,parameters:Record<string,string>,http:HttpFetch=fetch) {
 const response=await http('https://oauth2.googleapis.com/token',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,...parameters})})
 let data
 try {data=await response.json()} catch {throw googleHttpError(new Error('Invalid Google token response'),response.status)}
 if(!response.ok) {if(data.error==='invalid_grant') throw googleHttpError(new GoogleAuthorizationExpired(),response.status);throw googleHttpError(new Error('Google authorization failed'),response.status)}
 if(typeof data.access_token!=='string'||data.token_type?.toLowerCase()!=='bearer') throw new Error('Invalid token response')
 return data as {access_token:string;refresh_token?:string;scope?:string;token_type:string}
}
export async function revokeGoogleToken(token:string,http:HttpFetch=fetch) {
 const result=await http('https://oauth2.googleapis.com/revoke',{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({token})})
 return result.ok
}
interface ListPage {items?:Record<string,unknown>[];nextPageToken?:string;nextSyncToken?:string}
export class GoogleCalendarAdapter implements CalendarProviderAdapter {
 readonly provider='google' as const
 private token:string
 private http:HttpFetch
 constructor(accessToken:string,http:HttpFetch=fetch) {this.token=accessToken;this.http=http}
 private async get(path:string,params:Record<string,string>):Promise<ListPage> {
  const url=new URL('https://www.googleapis.com/calendar/v3/'+path);url.search=new URLSearchParams(params).toString()
  const result=await this.http(url,{headers:{Authorization:`Bearer ${this.token}`},redirect:'error',signal:AbortSignal.timeout(15000)})
  if(result.status===410) throw googleHttpError(new SyncCursorExpired(),result.status)
  if(result.status===401) throw googleHttpError(new GoogleAuthorizationExpired(),result.status)
  if(!result.ok) throw googleHttpError(new Error('Google calendar request failed'),result.status)
  try {return await result.json() as ListPage} catch {throw googleHttpError(new Error('Invalid Google page'),result.status)}
 }
 private async pages(path:string,params:Record<string,string>) {
  const items:Record<string,unknown>[]=[];const seen=new Set<string>();let pageToken:string|undefined
  for(let i=0;i<100;i++) {
   const page=await this.get(path,{...params,...(pageToken?{pageToken}:{})})
   if(page.items&&!Array.isArray(page.items)) throw new Error('Invalid Google page')
   items.push(...(page.items??[]));if(items.length>20000) throw new Error('Google result limit exceeded')
   if(!page.nextPageToken) return {items,checkpoint:page.nextSyncToken}
   if(seen.has(page.nextPageToken)) throw new Error('Repeated Google page')
   seen.add(page.nextPageToken);pageToken=page.nextPageToken
  }
  throw new Error('Google page limit exceeded')
 }
 async discover() {
  // freeBusyReader calendars do not provide the event details this application needs.
  const {items}=await this.pages('users/me/calendarList',{maxResults:'250',minAccessRole:'reader',showHidden:'true'})
  return items.map(item=>{
   if(typeof item.id!=='string'||typeof item.timeZone!=='string') throw new Error('Invalid Google calendar')
   return {externalCalendarId:item.id,name:String(item.summaryOverride??item.summary??item.id),timeZone:item.timeZone,primary:item.primary===true}
  })
 }
 async listCalendars():Promise<ProviderCalendar[]> {return this.discover()}
 normalizeEvent=normalizeGoogleEvent
 private async synchronize(calendar:ExternalCalendar,window:SyncWindow,token?:string):Promise<SyncPage> {
  const path='calendars/'+encodeURIComponent(calendar.external_calendar_id)+'/events'
  // Unexpanded collection keeps infinite recurring series finite. Never combine date filters with syncToken.
  const delta=await syncStage('google_delta_fetch',async()=>{
   const page=await this.pages(path,{maxResults:'2500',singleEvents:'false',showDeleted:'true',...(token?{syncToken:token}:{})})
   if(!page.checkpoint) throw new Error('Missing Google sync token')
   return page
  })
  if(token&&delta.items.length===0) return {changes:[],checkpoint:{syncToken:delta.checkpoint}}
  // Checkpoint precedes snapshot: concurrent changes are replayed next time, never skipped.
  const snapshot=await syncStage('google_snapshot_fetch',()=>this.pages(path,{maxResults:'2500',singleEvents:'true',showDeleted:'false',timeMin:window.start,timeMax:window.end}))
  const now=new Date().toISOString()
  return {changes:await syncStage('event_normalization',async()=>snapshot.items.map(item=>this.normalizeEvent(item,calendar,now))),checkpoint:{syncToken:delta.checkpoint},replaceWindow:true}
 }
 initialSync(calendar:ExternalCalendar,window:SyncWindow) {return this.synchronize(calendar,window)}
 incrementalSync(calendar:ExternalCalendar,state:PrivateSyncState) {
  const cursor=state.cursor as {syncToken?:unknown}|null
  if(typeof cursor?.syncToken!=='string') return this.initialSync(calendar,state.window)
  return this.synchronize(calendar,state.window,cursor.syncToken)
 }
}
