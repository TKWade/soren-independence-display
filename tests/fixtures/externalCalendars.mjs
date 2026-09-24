export const calendar={id:'calendar',household_id:'h',connection_id:'connection',external_calendar_id:'family',name:'Family',time_zone:'America/Chicago',enabled:true,behavior:'evaluate',last_synced_at:null,sync_status:'idle',sync_error:null}
export const googleEvent={id:'speech-1',summary:'Speech Therapy',description:'Provider note',location:'Calendar clinic address',start:{dateTime:'2026-09-23T09:00:00-05:00',timeZone:'America/Chicago'},end:{dateTime:'2026-09-23T10:00:00-05:00'},recurringEventId:'speech-series',originalStartTime:{dateTime:'2026-09-23T09:00:00-05:00'},updated:'2026-09-20T12:00:00Z'}
export const microsoftEvent={id:'speech-1',subject:'Speech Therapy',bodyPreview:'Provider note',location:{displayName:'Calendar clinic address'},start:{dateTime:'2026-09-23T14:00:00.0000000',timeZone:'UTC'},end:{dateTime:'2026-09-23T15:00:00.0000000',timeZone:'UTC'},seriesMasterId:'speech-series',type:'occurrence',originalStart:'2026-09-23T14:00:00Z',lastModifiedDateTime:'2026-09-20T12:00:00Z'}
export const syncedAt='2026-09-23T12:00:00Z'
const library=(id,icon='home')=>({id,household_id:'h',name:id,label:id.toUpperCase(),icon,active:true,image_path:null})
export function householdFixture(provider='google') {
 const event={id:'external',household_id:'h',source_kind:'external',title:'Speech Therapy',start_time:'2026-09-23T14:00:00Z',end_time:'2026-09-23T15:00:00Z',time_zone:'America/Chicago',all_day:false,recurrence:null,external_kind:'occurrence',external_status:'confirmed',location:'Provider clinic text'}
 return {household:{id:'h',name:'Test household',time_zone:'America/Chicago'},profiles:[{id:'soren',name:'Soren',active:true},{id:'sister',name:'Sister',active:true}],
  activities:[library('speech','school')],places:[library('clinic')],people:[library('dad','dad')],events:[event],sources:[{event_id:event.id,calendar_id:calendar.id,provider,external_calendar_id:calendar.external_calendar_id,external_event_id:'speech-1',external_series_id:'speech-series'}],visuals:[],eventPeople:[],homeRules:[],imageUrls:{},
  integration:{connections:[{id:'connection',household_id:'h',provider,label:'Family account',status:'connected'}],calendars:[{...calendar}],mappings:[],matchingRules:[]}}
}
export const decision={id:'decision',household_id:'h',calendar_id:'calendar',group_key:'series:speech-series',profile_id:'soren',action:'include',activity_id:'speech',place_id:'clinic',caregiver_id:'dad',picture_person_id:null,label:'SPEECH',visible:true,is_primary:true}
export const rule={...decision,id:'rule',name:'Speech',enabled:true,priority:10,title_operator:'contains',title_value:'speech',case_sensitive:false,source_filter:null}
/** Test adapter only; no HTTP and no auth simulation in the application. */
export function fixtureProvider({provider='google',initial=[],incremental=[],calendars=[{externalCalendarId:'family',name:'Family',timeZone:'America/Chicago'}],normalizeEvent}={}) {
 const calls=[]
 return {provider,calls,normalizeEvent,listCalendars:async()=>calendars,
  initialSync:async(_calendar,_window,page)=>{calls.push(['initial',page]);const result=initial[page??0];if(result instanceof Error) throw result;return result},
  incrementalSync:async(_calendar,_state,page)=>{calls.push(['incremental',page]);const result=incremental[page??0];if(result instanceof Error) throw result;return result}}
}
