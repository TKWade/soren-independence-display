import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeGoogleEvent, normalizeMicrosoftEvent } from '../server/calendar/normalization.ts'
import { syncCalendar, SyncCursorExpired } from '../server/calendar/provider.ts'
import { calendarActionHandler } from '../server/calendar/actions.ts'
import { calendarInbox } from '../src/calendar/relevance.ts'
import { normalizeWeek } from '../src/lib/persistentSchedule.ts'
import { calendar,googleEvent,microsoftEvent,syncedAt,householdFixture,decision,rule,fixtureProvider } from './fixtures/externalCalendars.mjs'
const now=new Date('2026-09-23T14:30:00Z')
const day=data=>normalizeWeek(data,'soren',now)[2]
test('Google and Microsoft normalize to shared occurrence scheduling and source identity',()=>{
 const google=normalizeGoogleEvent(googleEvent,calendar,syncedAt).event
 const microsoft=normalizeMicrosoftEvent(microsoftEvent,calendar,syncedAt).event
 for(const field of ['title','description','start','end','locationText','externalSeriesId','kind','status','lastModified']) assert.equal(google[field],microsoft[field])
 assert.equal(google.start,'2026-09-23T14:00:00Z');assert.equal(google.provider,'google');assert.equal(microsoft.provider,'microsoft')
 assert.equal(google.connectionId,'connection');assert.equal(google.externalCalendarId,'family')
 assert.equal(normalizeGoogleEvent({id:'gone',status:'cancelled'},calendar,syncedAt).type,'cancel')
 assert.equal(normalizeMicrosoftEvent({id:'gone','@removed':{reason:'deleted'}},calendar,syncedAt).type,'cancel')
 assert.equal(normalizeMicrosoftEvent({...microsoftEvent,isCancelled:true},calendar,syncedAt).type,'cancel')
 assert.throws(()=>normalizeGoogleEvent({...googleEvent,end:{dateTime:'2026-09-23T08:00:00-05:00'}},calendar,syncedAt),/range/)
 assert.throws(()=>normalizeMicrosoftEvent({...microsoftEvent,start:{dateTime:'2026-09-23T14:00:00',timeZone:'Pacific Standard Time'}},calendar,syncedAt))
})
test('unmatched inbox groups series; one manual decision applies to multiple profiles and future instances',()=>{
 const data=householdFixture();assert.equal(day(data).events.length,0);assert.deepEqual(calendarInbox(data)[0].profiles,['soren','sister'])
 data.events.push({...data.events[0],id:'external-2',start_time:'2026-09-24T14:00:00Z',end_time:'2026-09-24T15:00:00Z'})
 data.sources.push({...data.sources[0],event_id:'external-2',external_event_id:'speech-2'})
 assert.equal(calendarInbox(data).length,1);assert.equal(calendarInbox(data)[0].count,2)
 data.integration.mappings=[decision,{...decision,id:'sister-decision',profile_id:'sister',label:'THERAPY'}]
 assert.equal(calendarInbox(data).length,0);assert.equal(day(data).events[0].label,'SPEECH')
 assert.equal(normalizeWeek(data,'sister',now)[2].events[0].label,'THERAPY')
 assert.equal(normalizeWeek(data,'soren',now)[3].events[0].label,'SPEECH')
})
test('matching rules auto-apply with deterministic priority, scope and per-profile ignores',()=>{
 const data=householdFixture();data.integration.matchingRules=[rule,{...rule,id:'sister-rule',profile_id:'sister',action:'ignore'}]
 assert.equal(day(data).events[0].label,'SPEECH');assert.equal(normalizeWeek(data,'sister',now)[2].events.length,0);assert.equal(calendarInbox(data).length,0)
 data.integration.matchingRules.push({...rule,id:'z',priority:20,label:'HIGH'})
 assert.equal(day(data).events[0].label,'HIGH')
 data.integration.matchingRules.push({...rule,id:'a',priority:20,label:'FIRST'})
 assert.equal(day(data).events[0].label,'FIRST')
 data.integration.mappings=[{...decision,action:'ignore'}];assert.equal(day(data).events.length,0)
 data.integration.mappings.push({...decision,id:'one-occurrence',group_key:'event:speech-1',label:'OVERRIDE'})
 assert.equal(day(data).events[0].label,'OVERRIDE')
 data.integration.mappings=[];data.integration.matchingRules=[{...rule,source_filter:{provider:'microsoft'}}]
 assert.equal(day(data).events.length,0)
 data.integration.matchingRules=[{...rule,activity_id:null}];assert.equal(calendarInbox(data).length,1)
})
test('provider updates preserve independent visuals; cancellations, disabled calendars and masters disappear',()=>{
 const data=householdFixture();data.integration.mappings=[decision]
 data.events[0]={...data.events[0],title:'Speech changed externally',location:'New provider address',start_time:'2026-09-23T16:00:00Z',end_time:'2026-09-23T17:00:00Z'}
 assert.equal(day(data).events[0].label,'SPEECH');assert.equal(day(data).events[0].place.id,'clinic');assert.equal(day(data).events[0].startTime,'2026-09-23T16:00:00Z')
 for(const update of [{external_status:'cancelled'},{external_kind:'seriesMaster'}]) {const copy=structuredClone(data);Object.assign(copy.events[0],update);assert.equal(day(copy).events.length,0);assert.equal(calendarInbox(copy).length,0)}
 data.integration.calendars[0].enabled=false;assert.equal(day(data).events.length,0)
 data.integration.calendars[0].enabled=true;data.integration.calendars[0].behavior='ignore';assert.equal(day(data).events.length,0)
 assert.deepEqual(data.integration.mappings,[decision])
})
test('all-day dates retain exclusive end; local events and provider occurrences share display contracts',()=>{
 const normalized=normalizeGoogleEvent({id:'holiday',summary:'Holiday',start:{date:'2026-09-23'},end:{date:'2026-09-25'}},calendar,syncedAt).event
 assert.equal(normalized.allDay,true);assert.equal(normalized.end,'2026-09-25')
 const graph=normalizeMicrosoftEvent({...microsoftEvent,isAllDay:true,start:{dateTime:'2026-09-23T00:00:00',timeZone:'UTC'},end:{dateTime:'2026-09-25T00:00:00',timeZone:'UTC'}},calendar,syncedAt).event
 assert.equal(graph.start,normalized.start)
 const data=householdFixture('microsoft');data.integration.mappings=[decision]
 Object.assign(data.events[0],{all_day:true,all_day_start:normalized.start,all_day_end:normalized.end})
 data.events.push({...data.events[0],id:'local',source_kind:'local',all_day:false,external_status:null,external_kind:null})
 data.visuals.push({id:'local-visual',event_id:'local',profile_id:'soren',activity_id:'speech',place_id:'clinic',label_override:'LOCAL',visible:true,is_primary:false})
 const week=normalizeWeek(data,'soren',now)
 assert.equal(week[2].events.length,2);assert.equal(week[3].events.length,1);assert.equal(week[4].events.length,0)
 for(const event of week[2].events) {assert.equal('provider' in event,false);assert.ok(event.activity&&event.picture&&event.place)}
})
const window={start:'2026-09-01T00:00:00Z',end:'2026-12-01T00:00:00Z'}
function store(state=null) {return {state,commits:[],readState:async()=>state,commit:async function(...args){this.commits.push(args)}}}
test('sync commits pages and final cursor together, then uses incremental state',async()=>{
 const change=normalizeGoogleEvent(googleEvent,calendar,syncedAt)
 const adapter=fixtureProvider({initial:[{changes:[change],nextPage:1},{changes:[],checkpoint:{opaque:'final-token'}}]})
 const db=store();await syncCalendar(adapter,calendar,db,window)
 assert.equal(db.commits.length,1);assert.deepEqual(db.commits[0][4],{opaque:'final-token'});assert.equal(db.commits[0][5],true)
 const next=fixtureProvider({incremental:[{changes:[{type:'cancel',identity:change.event,lastSyncedAt:syncedAt}],checkpoint:{opaque:'next'}}]})
 const existing=store({revision:1,cursor:{opaque:'final-token'},window:{start:'2026-09-01T00:00:00+00:00',end:'2026-12-01T00:00:00.000Z'}});await syncCalendar(next,calendar,existing,window)
 assert.equal(next.calls[0][0],'incremental');assert.equal(existing.commits[0][1],1);assert.equal(existing.commits[0][5],false)
})
test('partial failures never advance state; expired cursors reset once and disabled calendars do not fetch',async()=>{
 const db=store({revision:2,cursor:'old',window})
 const adapter=fixtureProvider({incremental:[new SyncCursorExpired()],initial:[{changes:[],checkpoint:'reset'}]})
 await syncCalendar(adapter,calendar,db,window);assert.deepEqual(adapter.calls.map(c=>c[0]),['incremental','initial']);assert.equal(db.commits[0][5],true)
 const fail=store();await assert.rejects(syncCalendar(fixtureProvider({initial:[{changes:[],nextPage:1},new Error('interrupted')]}),calendar,fail,window));assert.equal(fail.commits.length,0)
 const disabled=fixtureProvider();assert.equal((await syncCalendar(disabled,{...calendar,enabled:false},store(),window)).skipped,true);assert.equal(disabled.calls.length,0)
 const wrong=normalizeGoogleEvent(googleEvent,{...calendar,id:'other'},syncedAt)
 await assert.rejects(syncCalendar(fixtureProvider({initial:[{changes:[wrong],checkpoint:'x'}]}),calendar,store(),window),/outside/)
})
test('trusted action boundary rejects missing authentication and unapproved origins before any network access',async()=>{
 const handle=calendarActionHandler({url:'https://example.invalid',anonKey:'public',serviceRoleKey:'server-only',allowedOrigins:['http://localhost:5173']})
 assert.equal((await handle(new Request('https://server.invalid',{method:'POST'}))).status,401)
 assert.equal((await handle(new Request('https://server.invalid',{method:'POST',headers:{Origin:'https://untrusted.invalid'}}))).status,403)
 assert.equal((await handle(new Request('https://server.invalid',{method:'OPTIONS',headers:{Origin:'http://localhost:5173'}}))).status,204)
})
