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
export async function requestCalendarAction(householdId:string,action:'connect'|'disconnect'|'listCalendars'|'sync',id:string) {
 const {data,error}=await client().functions.invoke('calendar-actions',{body:{householdId,action,id}})
 if(error||data?.error) throw new Error('Calendar service unavailable. Provider setup is required.')
 return data
}


/** The server returns only an OAuth kickoff URL, never provider credentials. */
export async function connectGoogleCalendar(householdId:string) {
 const data=await requestCalendarAction(householdId,'connect','google')
 const url=new URL(data.authorizationUrl)
 const expected=new URL(import.meta.env.VITE_SUPABASE_URL)
 if(url.origin!==expected.origin||url.pathname!=='/functions/v1/google-oauth/start') throw new Error('Invalid calendar authorization URL')
  const {data:session}=await client().auth.getSession()
 if(!session.session) throw new Error('Sign in required')
 const form=document.createElement('form');form.method='POST';form.action=url.origin+url.pathname
 for(const [name,value] of Object.entries({ticket:url.searchParams.get('ticket')??'',access_token:session.session.access_token})) {
  const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input)
 }
 document.body.append(form);form.submit();form.remove()
}
export async function disconnectGoogleCalendar(householdId:string,connectionId:string) {
 const data=await requestCalendarAction(householdId,'disconnect',connectionId)
 if(!data.revoked) return 'Disconnected locally. Google revocation could not be confirmed; remove access in your Google account if needed.'
 return 'Google Calendar disconnected.'
}
