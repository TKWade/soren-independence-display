import test from 'node:test'
import assert from 'node:assert/strict'
import { householdFixture, decision, rule } from './fixtures/externalCalendars.mjs'
import { calendarOvernights, overnightDates, resolveSleep, sleepReviewIssues } from '../src/calendar/homeSleep.ts'
import { calendarInbox, prepareExternalDisplay } from '../src/calendar/relevance.ts'
import { normalizeWeek } from '../src/lib/persistentSchedule.ts'
const mapping={id:'sleep-map',household_id:'h',calendar_id:'calendar',profile_id:'soren',group_key:'series:speech-series',target:'home_sleep',action:'include',sleep_place_id:'clinic',sleep_caregiver_id:'dad',bedtime_mode:'use_normal_bedtime',bedtime_override:null}
function fixture() {
 const d=householdFixture();d.homePreferences=d.profiles.map(p=>({profile_id:p.id,household_id:'h',overnight_mode:'calendar_with_local_fallback',default_bedtime:null,weekday_bedtimes:{}}));d.places.push({...d.places[0],id:'other',name:'Other home'})
 d.homeRules=d.profiles.flatMap(p=>Array.from({length:7},(_,weekday)=>({id:p.id+weekday,household_id:'h',profile_id:p.id,weekday,override_date:null,place_id:'other',caregiver_id:null,bedtime:'19:30'})))
 d.integration.mappings=[{...mapping}];return d
}
function allDay(d,start='2026-09-23',end='2026-09-24') {Object.assign(d.events[0],{all_day:true,all_day_start:start,all_day_end:end})}
function cloneOccurrence(d,date='2026-09-30') {
 const e={...d.events[0],id:'second',start_time:date+'T14:00:00Z',end_time:date+'T15:00:00Z',all_day_start:date,all_day_end:date.slice(0,8)+String(Number(date.slice(8))+1).padStart(2,'0')}
 d.events.push(e);d.sources.push({...d.sources[0],event_id:e.id,external_event_id:'second'});return e
}
test('single all-day sleep mapping affects one profile without creating an Activity',()=>{
 const d=fixture();allDay(d);const before=structuredClone(d.homeRules)
 assert.equal(resolveSleep(d,'soren','2026-09-23').assignment.place_id,'clinic')
 assert.equal(resolveSleep(d,'sister','2026-09-23').assignment.place_id,'other')
 assert.equal(resolveSleep(d,'soren','2026-09-24').origin,'weekly')
 const day=normalizeWeek(d,'soren',new Date('2026-09-23T17:00Z')).find(d=>d.date==='2026-09-23')
 assert.deepEqual(day.events.map(e=>e.label),['SLEEP']);assert.equal(day.events[0].sleepLocation.id,'clinic')
 assert.deepEqual(d.homeRules,before);assert.deepEqual(calendarInbox(d)[0].profiles,['sister'])
})
test('both profiles and newly synced recurring all-day occurrences participate automatically',()=>{
 const d=fixture();allDay(d);d.integration.mappings.push({...mapping,id:'sibling',profile_id:'sister'})
 cloneOccurrence(d,'2026-09-25')
 for(const profile of ['soren','sister']) for(const date of ['2026-09-23','2026-09-25']) assert.equal(resolveSleep(d,profile,date).origin,'external')
 assert.equal(calendarInbox(d).length,0);assert.equal(calendarInbox(d,true).length,1)
})
test('multi-day all-day dates include each night and exclude provider end across leap day',()=>{
 const d=fixture();allDay(d,'2024-02-28','2024-03-02')
 assert.deepEqual(overnightDates(d.events[0],d.household.time_zone),['2024-02-28','2024-02-29','2024-03-01'])
 assert.equal(resolveSleep(d,'soren','2024-03-02').origin,'weekly')
})
test('timed events use only local start-date night through household midnight and DST',()=>{
 const d=fixture();d.events[0].start_time='2026-03-09T04:30:00Z';d.events[0].end_time='2026-03-10T12:00:00Z'
 assert.deepEqual(overnightDates(d.events[0],d.household.time_zone),['2026-03-08'])
 d.events[0].start_time='2026-11-01T06:30:00Z';assert.deepEqual(overnightDates(d.events[0],d.household.time_zone),['2026-11-01'])
 assert.deepEqual(overnightDates(d.events[0],'Pacific/Honolulu'),['2026-10-31'])
})
test('calendar overrides weekly place, inherits changing normal bedtime, or supplies explicit time',()=>{
 const d=fixture();assert.equal(resolveSleep(d,'soren','2026-09-23').assignment.bedtime,'19:30')
 d.homeRules.find(r=>r.profile_id==='soren'&&r.weekday===3).bedtime='20:00'
 assert.equal(resolveSleep(d,'soren','2026-09-23').assignment.bedtime,'20:00')
 Object.assign(d.integration.mappings[0],{bedtime_mode:'explicit',bedtime_override:'21:15'})
 assert.equal(resolveSleep(d,'soren','2026-09-23').assignment.bedtime,'21:15')
})
test('manual date override wins including bedtime; deleting it restores external assignment',()=>{
 const d=fixture();d.homeRules.push({...d.homeRules[0],id:'manual',weekday:null,override_date:'2026-09-23',bedtime:'18:45'})
 const result=resolveSleep(d,'soren','2026-09-23');assert.equal(result.origin,'manual');assert.equal(result.assignment.place_id,'other');assert.equal(result.assignment.bedtime,'18:45')
 d.homeRules.pop();assert.equal(resolveSleep(d,'soren','2026-09-23').origin,'external')
})
test('moved, cancelled, deleted occurrences and changed recurrence remove stale nights',()=>{
 const d=fixture();allDay(d);allDay(d,'2026-09-24','2026-09-25')
 assert.equal(resolveSleep(d,'soren','2026-09-23').origin,'weekly');assert.equal(resolveSleep(d,'soren','2026-09-24').origin,'external')
 d.events[0].external_status='cancelled';assert.equal(calendarOvernights(d,'soren').size,0)
 d.events=[];assert.equal(calendarOvernights(d,'soren').size,0)
 assert.equal(d.integration.mappings.length,1)
})
test('occurrence-only Home, Ignore or Activity overrides the series decision independently',()=>{
 const d=fixture();cloneOccurrence(d,'2026-09-25')
 d.integration.mappings.push({...mapping,id:'once',group_key:'event:speech-1',sleep_place_id:'other'})
 assert.equal(resolveSleep(d,'soren','2026-09-23').assignment.place_id,'other');assert.equal(resolveSleep(d,'soren','2026-09-25').assignment.place_id,'clinic')
 d.integration.mappings[1]={...decision,id:'once',group_key:'event:speech-1',action:'ignore'}
 assert.equal(resolveSleep(d,'soren','2026-09-23').origin,'weekly')
 d.integration.mappings[1]={...decision,id:'once',group_key:'event:speech-1'}
 assert.equal(resolveSleep(d,'soren','2026-09-23').origin,'weekly');assert.equal(prepareExternalDisplay(d).visuals.length,1)
})
test('conflicting calendar assignments surface review and suppress ambiguous sleep, independent of order',()=>{
 const d=fixture();cloneOccurrence(d,'2026-09-23');d.integration.mappings.push({...mapping,id:'conflict',group_key:'event:second',sleep_place_id:'other'})
 assert.equal(resolveSleep(d,'soren','2026-09-23').issue,'conflict');assert.equal(sleepReviewIssues(d,new Date('2026-09-23T17:00Z')).length,1)
 const days=normalizeWeek(d,'soren',new Date('2026-09-23T17:00Z'));assert.equal(days.find(d=>d.date==='2026-09-23').events.length,0)
 d.events.reverse();assert.equal(resolveSleep(d,'soren','2026-09-23').issue,'conflict')
 d.homeRules.push({...d.homeRules[0],weekday:null,override_date:'2026-09-23'})
 assert.equal(resolveSleep(d,'soren','2026-09-23').origin,'manual');assert.equal(sleepReviewIssues(d,new Date('2026-09-23T17:00Z')).length,0)
})
test('identical overlapping assignments coalesce; different caregivers or bedtimes conflict',()=>{
 const d=fixture();cloneOccurrence(d,'2026-09-23');assert.equal(resolveSleep(d,'soren','2026-09-23').origin,'external')
 d.integration.mappings.push({...mapping,id:'once',group_key:'event:second',sleep_caregiver_id:null})
 assert.equal(resolveSleep(d,'soren','2026-09-23').issue,'conflict')
 Object.assign(d.integration.mappings[1],{sleep_caregiver_id:'dad',bedtime_mode:'explicit',bedtime_override:'22:00'})
 assert.equal(resolveSleep(d,'soren','2026-09-23').issue,'conflict')
})
test('missing normal bedtime needs caregiver review; explicit time works without a weekly rule',()=>{
 const d=fixture();d.homeRules=[];assert.equal(resolveSleep(d,'soren','2026-09-23').issue,'missing_bedtime')
 Object.assign(d.integration.mappings[0],{bedtime_mode:'explicit',bedtime_override:'19:45'})
 assert.equal(resolveSleep(d,'soren','2026-09-23').assignment.bedtime,'19:45')
})
test('disabled calendars, disconnected accounts and series masters cannot drive sleep',()=>{
 for(const mutate of [d=>d.integration.calendars[0].enabled=false,d=>d.integration.connections[0].status='disabled',d=>d.events[0].external_kind='seriesMaster']) {
  const d=fixture();mutate(d);assert.equal(calendarOvernights(d,'soren').size,0)
 }
})
test('existing Activity mappings and title rules are unchanged; manual Home suppresses matching Activity',()=>{
 const d=fixture();d.integration.matchingRules=[rule];assert.equal(prepareExternalDisplay(d).visuals.length,0)
 d.integration.mappings=[decision];assert.equal(prepareExternalDisplay(d).visuals[0].activity_id,'speech')
 d.integration.mappings=[];assert.equal(prepareExternalDisplay(d).visuals[0].activity_id,'speech')
})
