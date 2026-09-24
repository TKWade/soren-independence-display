import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWeek, resolveHomeRule } from '../src/lib/persistentSchedule.ts'
import { atLocalTime, dateInZone } from '../src/lib/time.ts'
import { getTimelineState, summarizeDay } from '../src/lib/schedule.ts'
const row=(id,icon='home')=>({id,household_id:'h',name:id,label:id.toUpperCase(),icon,image_path:null,active:true})
const base={
 household:{id:'h',name:'Household',time_zone:'America/Chicago'},
 profiles:[{id:'child',household_id:'h',name:'Child',active:true}],
 people:[row('dad','dad'),row('mom','mom')],places:[row('home'),row('school','school'),row('other')],activities:[row('school','school')],
 events:[{id:'event',household_id:'h',title:'Provider title',start_time:'2026-09-23T13:00:00Z',end_time:'2026-09-23T20:00:00Z',time_zone:'America/Chicago',source_kind:'local',recurrence:null,all_day:false}],
 visuals:[{id:'visual',household_id:'h',event_id:'event',profile_id:'child',activity_id:'school',place_id:'school',label_override:'CLASS',visible:true,is_primary:true}],
 eventPeople:[{visual_id:'visual',person_id:'dad'}],sources:[],imageUrls:{},
 homeRules:[{id:'weekly',household_id:'h',profile_id:'child',weekday:3,override_date:null,bedtime:'19:30:00',place_id:'home',caregiver_id:'dad'}],
}
const now=new Date('2026-09-23T17:00:00Z')
test('weekly home rule and date override resolution is independent of row order',()=>{
 const override={...base.homeRules[0],id:'override',weekday:null,override_date:'2026-09-23',place_id:'other',caregiver_id:'mom'}
 for(const rules of [[override,...base.homeRules],[...base.homeRules,override]]) assert.equal(resolveHomeRule(rules,'child','2026-09-23').id,'override')
 assert.equal(resolveHomeRule(base.homeRules,'child','2026-09-23').id,'weekly')
 assert.equal(resolveHomeRule([override],'child','2026-09-30'),undefined)
 assert.equal(resolveHomeRule(base.homeRules,'sibling','2026-09-23'),undefined)
})
test('database records project timezone-aware approved child models',()=>{
 const days=normalizeWeek(base,'child',now)
 assert.equal(days.length,7)
 const day=days[2]
 assert.equal(day.date,'2026-09-23')
 assert.equal(day.events[0].label,'CLASS')
 assert.equal(day.events[0].people[0].name,'dad')
 assert.equal(day.events[0].place.id,'school')
 assert.equal(summarizeDay(day).activity.label,'CLASS')
 assert.equal(summarizeDay(day).sleep.id,'home')
 assert.equal(day.events[1].startTime,'2026-09-24T00:30:00Z')
 assert.equal(getTimelineState(day,now).currentId,'event')
 assert.equal(getTimelineState(day,new Date('2026-09-24T04:59:00Z')).currentId,'2026-09-23-sleep')
 assert.equal(getTimelineState(day,new Date('2026-09-24T05:00:00Z')).currentId,undefined)
})
test('override replaces sleep location/caregiver and disappears when removed',()=>{
 const override={...base.homeRules[0],id:'override',weekday:null,override_date:'2026-09-23',place_id:'other',caregiver_id:'mom'}
 const day=normalizeWeek({...base,homeRules:[...base.homeRules,override]},'child',now)[2]
 assert.equal(summarizeDay(day).sleep.id,'other')
 assert.equal(day.events.at(-1).people[0].id,'mom')
 assert.equal(summarizeDay(normalizeWeek(base,'child',now)[2]).sleep.id,'home')
})
test('visibility, inactive profiles, photos and missing visual links fail safely',()=>{
 assert.deepEqual(normalizeWeek(base,'missing',now),[])
 assert.deepEqual(normalizeWeek({...base,profiles:[{...base.profiles[0],active:false}]},'child',now),[])
 const hidden=normalizeWeek({...base,visuals:[{...base.visuals[0],visible:false}]},'child',now)[2]
 assert.equal(hidden.events.length,1)
 const photoData={...base,activities:[{...base.activities[0],image_path:'h/test.png'}],imageUrls:{'h/test.png':'https://example.invalid/signed-image'}}
 assert.equal(normalizeWeek(photoData,'child',now)[2].events[0].picture.photoUrl,'https://example.invalid/signed-image')
 assert.equal(normalizeWeek({...base,activities:[]},'child',now)[2].events.length,1)
})
test('no events still shows app-owned sleep; overnight events appear on both days',()=>{
 assert.equal(normalizeWeek({...base,events:[]},'child',now)[2].events[0].sleepLocation.id,'home')
 const overnight={...base.events[0],start_time:'2026-09-24T04:00:00Z',end_time:'2026-09-24T06:00:00Z'}
 const days=normalizeWeek({...base,events:[overnight]},'child',now)
 assert.ok(days[2].events.some(e=>e.id==='event'))
 assert.ok(days[3].events.some(e=>e.id==='event'))
})
test('timezone conversion observes DST and rejects ambiguous explicit input',()=>{
 assert.equal(dateInZone(new Date('2026-09-24T02:00:00Z'),'America/Chicago'),'2026-09-23')
 assert.equal(atLocalTime('2026-01-01','19:30','America/Chicago'),'2026-01-02T01:30:00Z')
 assert.equal(atLocalTime('2026-07-01','19:30','America/Chicago'),'2026-07-02T00:30:00Z')
 assert.throws(()=>atLocalTime('2026-03-08','02:30','America/Chicago'))
 assert.equal(atLocalTime('2026-03-08','02:30','America/Chicago','compatible'),'2026-03-08T08:30:00Z')
})

test('recurring occurrences feed Week summaries and Day NOW/NEXT with profile-specific enrichment',()=>{
 const series={...base.events[0],start_time:atLocalTime('2026-09-01','08:00','America/Chicago'),end_time:atLocalTime('2026-09-01','15:00','America/Chicago'),
  local_recurrence:{version:1,frequency:'weekly',interval:1,startDate:'2026-09-01',endDate:'2027-05-20',weekdays:[1,2,3,4,5]}}
 const data={...base,events:[series]}
 const days=normalizeWeek(data,'child',now)
 assert.equal(days.filter(d=>d.events.some(e=>e.id.startsWith('event@'))).length,5)
 const day=days[2]
 assert.equal(day.primaryEventId,'event@2026-09-23')
 assert.equal(summarizeDay(day).activity.label,'CLASS')
 assert.equal(getTimelineState(day,now).currentId,'event@2026-09-23')
 assert.equal(getTimelineState(day,new Date('2026-09-23T12:00:00Z')).nextId,'event@2026-09-23')
 assert.equal(getTimelineState(day,new Date('2026-09-23T21:00:00Z')).currentId,undefined)
 const sibling={...base.profiles[0],id:'sibling'}
 const siblingVisual={...base.visuals[0],id:'sibling-visual',profile_id:'sibling',label_override:'THERAPY'}
 assert.equal(normalizeWeek({...data,profiles:[...data.profiles,sibling],visuals:[...data.visuals,siblingVisual]},'sibling',now)[2].events[0].label,'THERAPY')
})
