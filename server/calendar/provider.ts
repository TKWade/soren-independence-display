import type { CalendarProvider } from '../../src/types/calendar.ts'
import type { ExternalCalendar, ExternalChange } from '../../src/types/externalCalendar.ts'
export interface SyncWindow {start:string;end:string}
/** Only this server-side type carries provider tokens, next links and opaque delta state. */
export interface PrivateSyncState {revision:number;cursor:unknown;window:SyncWindow}
export interface ProviderCalendar {externalCalendarId:string;name:string;timeZone:string}
export interface SyncPage {changes:ExternalChange[];nextPage?:unknown;checkpoint?:unknown;replaceWindow?:boolean}
export interface CalendarProviderAdapter {
 readonly provider:CalendarProvider
 listCalendars():Promise<ProviderCalendar[]>
 initialSync(calendar:ExternalCalendar,window:SyncWindow,nextPage?:unknown):Promise<SyncPage>
 incrementalSync(calendar:ExternalCalendar,state:PrivateSyncState,nextPage?:unknown):Promise<SyncPage>
 normalizeEvent(raw:unknown,calendar:ExternalCalendar,syncedAt:string):ExternalChange
}
/** Implement with Vault/KMS on the server. Never return secrets from an action endpoint. */
export interface CredentialVault {withCredentials<T>(connectionId:string,action:(credentials:{accessToken:string;refreshToken?:string})=>Promise<T>):Promise<T>}
export interface SyncStore {
 readState(calendar:ExternalCalendar):Promise<PrivateSyncState|null>
 /** Atomic compare-and-swap: scheduling writes + checkpoint. Never writes visual metadata. */
 commit(calendar:ExternalCalendar,expectedRevision:number,window:SyncWindow,changes:ExternalChange[],checkpoint:unknown,replaceWindow:boolean):Promise<void>
}
export class SyncCursorExpired extends Error {}
export async function syncCalendar(adapter:CalendarProviderAdapter,calendar:ExternalCalendar,store:SyncStore,window:SyncWindow) {
 if(!calendar.enabled||calendar.behavior==='ignore') return {skipped:true,count:0}
 if(!Number.isFinite(Date.parse(window.start))||!Number.isFinite(Date.parse(window.end))||Date.parse(window.end)<=Date.parse(window.start)||Date.parse(window.end)-Date.parse(window.start)>366*86400000) throw new Error('Invalid bounded sync window')
 const previous=await store.readState(calendar)
 const sameWindow=previous&&Date.parse(previous.window.start)===Date.parse(window.start)&&Date.parse(previous.window.end)===Date.parse(window.end)
 let initial=!sameWindow, restart=false
 for(;;) {
  const changes:ExternalChange[]=[];let next:unknown=undefined;const seen=new Set<string>()
  try {
   for(let pageNumber=0;pageNumber<100;pageNumber++) {
    const page=initial?await adapter.initialSync(calendar,window,next):await adapter.incrementalSync(calendar,previous!,next)
    for(const change of page.changes) {
     const identity=change.type==='upsert'?change.event:change.identity
     if(identity.provider!==adapter.provider||identity.calendarId!==calendar.id||identity.connectionId!==calendar.connection_id||identity.externalCalendarId!==calendar.external_calendar_id) throw new Error('Provider returned an event outside the requested calendar')
    }
    changes.push(...page.changes)
    if(changes.length>20000) throw new Error('Sync batch too large')
    if(page.nextPage===undefined) {
     if(page.checkpoint===undefined) throw new Error('Missing final checkpoint')
     await store.commit(calendar,previous?.revision??0,window,changes,page.checkpoint,initial||page.replaceWindow===true)
     return {skipped:false,count:changes.length}
    }
    const key=JSON.stringify(page.nextPage)
    if(seen.has(key)) throw new Error('Repeated pagination cursor')
    seen.add(key);next=page.nextPage
   }
   throw new Error('Too many sync pages')
  } catch(error) {
   if(error instanceof SyncCursorExpired&&!initial&&!restart) {initial=true;restart=true;continue}
   throw error
  }
 }
}
