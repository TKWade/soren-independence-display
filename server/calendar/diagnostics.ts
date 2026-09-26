/** Diagnostic metadata is kept out of errors' enumerable fields and never contains upstream text. */
const messages={google_token_refresh:'Google credential refresh failed.',sync_state_read:'Reading calendar sync state failed.',google_delta_fetch:'Google delta collection request failed.',google_snapshot_fetch:'Google event window request failed.',event_normalization:'Calendar event normalization failed.',database_commit:'Committing calendar sync failed.',unknown_sync_failure:'Calendar synchronization failed.'} as const
export type SyncStage=keyof typeof messages
type Metadata={stage?:SyncStage;googleHttpStatus?:number;databaseCode?:string}
const metadata=new WeakMap<object,Metadata>()
function objectError(error:unknown):object {return typeof error==='object'&&error!==null?error:new Error('Unknown failure')}
export function googleHttpError(error:Error,status:number):Error {
 metadata.set(error,{...metadata.get(error),...(Number.isInteger(status)&&status>=100&&status<=599?{googleHttpStatus:status}:{})})
 return error
}
export function databaseError(error:unknown):object {
 const value=objectError(error)
 const code=(value as {code?:unknown}).code
 metadata.set(value,{...metadata.get(value),...(typeof code==='string'&&/^(?:[0-9A-Z]{5}|PGRST[0-9]{3})$/.test(code)?{databaseCode:code}:{})})
 return value
}
export async function syncStage<T>(stage:SyncStage,action:()=>Promise<T>,database=false):Promise<T> {
 try {return await action()} catch(error) {
  const value=database?databaseError(error):objectError(error)
  const info=metadata.get(value)??{}
  metadata.set(value,{...info,stage:info.stage??stage})
  throw value // Preserve instanceof-based expired-cursor recovery and refresh handling.
 }
}
export function syncDiagnostic(error:unknown,calendarId:string,connectionId:string) {
 const value=objectError(error),info=metadata.get(value)??{},stage=info.stage??'unknown_sync_failure'
 // Never copy error.message/name/stack/cause/details/hint or stringify the error.
 const errorClass=error instanceof TypeError?'TypeError':error instanceof RangeError?'RangeError':error instanceof SyntaxError?'SyntaxError':error instanceof Error?'Error':'UnknownError'
 const uuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
 return {event:'calendar_sync_failed',stage,errorClass,message:messages[stage],...info,
  ...(stage==='sync_state_read'?{operation:'read_calendar_sync_state'}:stage==='database_commit'?{operation:'commit_calendar_sync'}:{}),
  ...(uuid(calendarId)?{calendarId}:{}),...(uuid(connectionId)?{connectionId}:{})}
}
export const storedSyncError='Synchronization failed; retry or reconnect.'
