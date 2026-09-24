import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExternalCalendar, ExternalChange } from '../../src/types/externalCalendar.ts'
import type { PrivateSyncState, SyncStore, SyncWindow } from './provider.ts'
/** Construct only with a server-held service-role client, after authenticating household membership. */
export class SupabaseSyncStore implements SyncStore {
 private client:SupabaseClient
 constructor(client:SupabaseClient) {this.client=client}
 async readState(calendar:ExternalCalendar):Promise<PrivateSyncState|null> {
  const {data,error}=await this.client.rpc('read_calendar_sync_state',{cid:calendar.id});if(error) throw error
  return data as PrivateSyncState|null
 }
 async commit(calendar:ExternalCalendar,expectedRevision:number,window:SyncWindow,changes:ExternalChange[],checkpoint:unknown,replaceWindow:boolean) {
  const {error}=await this.client.rpc('commit_calendar_sync',{payload:{calendar_id:calendar.id,expected_revision:expectedRevision,window_start:window.start,window_end:window.end,changes,checkpoint,replace_window:replaceWindow}})
  if(error) throw error
 }
}
