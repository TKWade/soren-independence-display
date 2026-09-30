import test from 'node:test'
import assert from 'node:assert/strict'
import {householdFixture} from './fixtures/externalCalendars.mjs'
import {homePreferences,normalBedtime,eligibleSleepCalendar} from '../src/calendar/homePreferences.ts'
import {resolveSleep,sleepReviewIssues} from '../src/calendar/homeSleep.ts'
import {normalizeWeek} from '../src/lib/persistentSchedule.ts'
const date='2026-09-23',now=new Date(date+'T17:00:00Z')
function fixture(mode='local') {
 const d=householdFixture()
 d.places.push({...d.places[0],id:'local-home'})
 d.homePreferences=d.profiles.map(p=>({household_id:'h',profile_id:p.id,overnight_mode:mode,default_bedtime:'20:00',weekday_bedtimes:{}}))
 d.homeRules=[{id:'weekly',profile_id:'soren',household_id:'h',weekday:3,override_date:null,bedtime:'19:30',bedtime_override:null,place_id:'local-home',caregiver_id:null}]
 d.integration.mappings=[{id:'home-map',household_id:'h',profile_id:'soren',calendar_id:'calendar',group_key:'series:speech-series',target:'home_sleep',action:'include',sleep_place_id:'clinic',sleep_caregiver_id:'dad',bedtime_mode:'use_normal_bedtime',bedtime_override:null}]
 return d
}
const rule=d=>d.homeRules.push({...d.homeRules[0],id:'manual',weekday:null,override_date:date,bedtime:null,bedtime_override:null})
test('fully local household without integrations uses weekly location, independent default bedtime and child sleep card',()=>{
 const d=fixture();delete d.integration;d.events=[];d.sources=[]
 const r=resolveSleep(d,'soren',date);assert.equal(r.origin,'weekly');assert.equal(r.assignment.place_id,'local-home');assert.equal(r.assignment.bedtime,'20:00')
 assert.equal(eligibleSleepCalendar(d),false)
 assert.equal(normalizeWeek(d,'soren',now).find(d=>d.date===date).events[0].label,'SLEEP')
 rule(d);assert.equal(resolveSleep(d,'soren',date).origin,'manual')
})
test('legacy or new profiles default to Local regardless of connections or existing mappings',()=>{
 const d=fixture();delete d.homePreferences
 assert.equal(homePreferences(d,'soren').overnight_mode,'local')
 assert.equal(resolveSleep(d,'soren',date).assignment.place_id,'local-home')
 assert.equal(resolveSleep(d,'soren',date).assignment.bedtime,'19:30')
})
test('bedtime priority: assignment explicit, profile weekday, profile default, legacy weekday, unresolved',()=>{
 const d=fixture();d.homePreferences[0].weekday_bedtimes={3:'21:00'}
 assert.equal(normalBedtime(d,'soren',date,'22:00'),'22:00')
 assert.equal(resolveSleep(d,'soren',date).assignment.bedtime,'21:00')
 d.homePreferences[0].weekday_bedtimes={};assert.equal(normalBedtime(d,'soren',date),'20:00')
 d.homePreferences[0].default_bedtime=null;assert.equal(normalBedtime(d,'soren',date),'19:30')
 d.homeRules[0].bedtime=null;assert.equal(resolveSleep(d,'soren',date).issue,'missing_bedtime')
 d.homeRules[0].bedtime_override='22:30';assert.equal(resolveSleep(d,'soren',date).assignment.bedtime,'22:30')
})
test('normal bedtime can be configured without any location rule in every mode',()=>{
 for(const mode of ['local','calendar_with_local_fallback','calendar_driven']) {
  const d=fixture(mode);d.homeRules=[]
  assert.equal(normalBedtime(d,'soren',date),'20:00')
  if(mode==='local') assert.equal(resolveSleep(d,'soren',date).issue,'missing_assignment')
  else {assert.equal(resolveSleep(d,'soren',date).origin,'external');assert.equal(resolveSleep(d,'soren',date).assignment.bedtime,'20:00')}
 }
})
test('fallback mode prefers external assignment, then weekly when unavailable',()=>{
 const d=fixture('calendar_with_local_fallback');assert.equal(resolveSleep(d,'soren',date).assignment.place_id,'clinic')
 d.events=[];assert.equal(resolveSleep(d,'soren',date).assignment.place_id,'local-home')
})
test('calendar-driven never uses weekly custody fallback, including when disconnected',()=>{
 for(const mutation of [d=>d.events=[],d=>d.integration.connections[0].status='disabled',d=>d.integration.calendars[0].enabled=false]) {
  const d=fixture('calendar_driven');mutation(d)
  assert.equal(resolveSleep(d,'soren',date).issue,'missing_assignment');assert.equal(resolveSleep(d,'soren',date).assignment,undefined)
  assert.ok(sleepReviewIssues(d,now,'soren').some(i=>i.date===date&&i.issue==='missing_assignment'))
 }
 const d=fixture('calendar_with_local_fallback');d.integration.connections[0].status='disabled';assert.equal(resolveSleep(d,'soren',date).origin,'weekly')
})
test('manual date override wins in all modes and uses independent normal or explicit bedtime',()=>{
 for(const mode of ['local','calendar_with_local_fallback','calendar_driven']) {
  const d=fixture(mode);rule(d)
  assert.equal(resolveSleep(d,'soren',date).origin,'manual');assert.equal(resolveSleep(d,'soren',date).assignment.bedtime,'20:00')
  d.homeRules[1].bedtime_override='18:45';assert.equal(resolveSleep(d,'soren',date).assignment.bedtime,'18:45')
 }
})
test('switching modes retains all configuration; two profiles independently select sources',()=>{
 const d=fixture(),rules=structuredClone(d.homeRules),mappings=structuredClone(d.integration.mappings)
 d.integration.mappings.push({...mappings[0],id:'second',profile_id:'sister'})
 d.homePreferences[1].overnight_mode='calendar_driven'
 assert.equal(resolveSleep(d,'soren',date).assignment.place_id,'local-home');assert.equal(resolveSleep(d,'sister',date).assignment.place_id,'clinic')
 d.homePreferences[0].overnight_mode='calendar_driven';assert.equal(resolveSleep(d,'soren',date).assignment.place_id,'clinic')
 d.homePreferences[0].overnight_mode='local';assert.equal(resolveSleep(d,'soren',date).assignment.place_id,'local-home')
 assert.deepEqual(d.homeRules,rules);assert.deepEqual(d.integration.mappings[0],mappings[0])
 assert.deepEqual(normalizeWeek(d,'sister',now).find(d=>d.date===date).events.map(e=>e.label),['SLEEP'])
})
