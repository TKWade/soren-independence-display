import { syncStage } from './diagnostics.ts'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExternalCalendar, ExternalChange } from '../../src/types/externalCalendar.ts'
import type { PrivateSyncState, SyncStore, SyncWindow } from './provider.ts'
/** Construct only with a server-held service-role client, after authenticating household membership. */
export class SupabaseSyncStore implements SyncStore {
 private client:SupabaseClient
 private lease?:string
 constructor(client:SupabaseClient,lease?:string) {this.client=client;this.lease=lease}
 async readState(calendar:ExternalCalendar):Promise<PrivateSyncState|null> {
  return syncStage('sync_state_read',async()=>{
  const {data,error}=await this.client.rpc('read_calendar_sync_state',{cid:calendar.id});if(error) throw error
  return data as PrivateSyncState|null
  },true)
 }
 async commit(calendar:ExternalCalendar,expectedRevision:number,window:SyncWindow,changes:ExternalChange[],checkpoint:unknown,replaceWindow:boolean) {
  return syncStage('database_commit',async()=>{
  const {error}=await this.client.rpc('commit_calendar_sync',{payload:{lease_token:this.lease,calendar_id:calendar.id,expected_revision:expectedRevision,window_start:window.start,window_end:window.end,changes,checkpoint,replace_window:replaceWindow}})
  if(error) throw error
  },true)
 }
}
