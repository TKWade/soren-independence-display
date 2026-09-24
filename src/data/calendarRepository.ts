import { client } from './supabase'
import type { CalendarMatchingRule } from '../types/externalCalendar'
export async function setCalendarSelection(id:string,householdId:string,enabled:boolean,behavior:'evaluate'|'ignore') {
 const {error}=await client().from('external_calendars').update({enabled,behavior}).eq('id',id).eq('household_id',householdId)
 if(error) throw error
}
export async function saveExternalMapping(payload:Record<string,unknown>) {
 const {error}=await client().rpc('save_external_mapping',{payload});if(error) throw error
}
export async function saveMatchingRule(rule:Partial<CalendarMatchingRule>) {
 const {error}=await client().from('event_matching_rules').upsert(rule);if(error) throw error
}
export async function deleteMatchingRule(id:string,householdId:string) {
 const {error}=await client().from('event_matching_rules').delete().eq('id',id).eq('household_id',householdId);if(error) throw error
}
/** No provider token, account secret, sync cursor or raw provider URL enters browser storage. */
export async function requestCalendarAction(householdId:string,action:'connect'|'listCalendars'|'sync',id:string) {
 const {data,error}=await client().functions.invoke('calendar-actions',{body:{householdId,action,id}})
 if(error||data?.error) throw new Error('Calendar service unavailable. Provider setup is required.')
 return data
}
