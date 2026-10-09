import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {createFixture,visibleEvents,overlapLayout,changeEventStart,moveEvent,copyDay,applyRoutine,reviewImports,rangeDates,shiftRange,addDays,TODAY,ordered} from './browser/scheduling/model.ts'

test('fictional scenarios have distinct profiles, dense quarter-hour schedules and no accepted pending imports',()=>{
 const family=createFixture('family'),home=createFixture('residential')
 assert.deepEqual(family.profiles.map(p=>p.name),['Soren','Siv'])
 assert.equal(family.events.filter(e=>e.review==='pending').length,9)
 assert.ok(visibleEvents(family,'soren').every(e=>e.review==='included'&&e.profileIds.includes('soren')))
 assert.ok(home.profiles.length>=4);assert.ok(home.events.every(e=>e.origin==='local'))
 assert.ok(home.events.filter(e=>e.profileIds.includes('alex')&&e.date===TODAY&&e.end-e.start===15).length>=12)
 for(const e of [...home.events,...family.events]){assert.equal(e.start%15,0);assert.equal(e.end%15,0);assert.ok(e.end>e.start)}
})
test('editing Start immediately repairs an earlier or equal End to 30 minutes later',()=>{
 const event={...createFixture('family').events[0],start:900,end:945}
 const repaired=changeEventStart(event,990)
 assert.deepEqual([repaired.start,repaired.end],[990,1020]) // 4:30–5:00 PM
 assert.equal(changeEventStart(event,945).end,975) // Equal endpoints also need repair.
 assert.equal(event.end,945)
})

test('editing Start preserves a valid later End instead of preserving duration',()=>{
 const event={...createFixture('family').events[0],start:900,end:1050}
 const edited=changeEventStart(event,990)
 assert.deepEqual([edited.start,edited.end],[990,1050]) // 4:30–5:30 PM
 assert.equal(changeEventStart(event,840).end,1050)
})

test('editing Start keeps quarter-hour alignment and caps repaired End at same-day midnight',()=>{
 const event={...createFixture('family').events[0],start:900,end:945}
 assert.deepEqual([changeEventStart(event,1425).start,changeEventStart(event,1425).end],[1425,1440])
 for(let minutes=0;minutes<=1440;minutes++){
  const edited=changeEventStart(event,minutes)
  assert.equal(edited.start%15,0);assert.equal(edited.end%15,0)
  assert.ok(edited.end>edited.start&&edited.end<=1440)
 }
 assert.equal(changeEventStart(event,NaN),event)
})

test('timeline gestures snap, retain duration, bound endpoints and keep imported timing read-only',()=>{
 const e={...createFixture('family').events[0],start:915,end:960}
 assert.deepEqual([moveEvent(e,45).start,moveEvent(e,45).end],[960,1005])
 assert.equal(moveEvent(e,22).start,930)
 assert.equal(moveEvent(e,-5000).start,0);assert.equal(moveEvent(e,5000).end,1440)
 assert.equal(moveEvent(e,-5000,true).end,e.start+15);assert.equal(moveEvent(e,5000,true).end,1440)
 const existing={...e,start:900,end:945}
 assert.deepEqual([moveEvent(existing,60).start,moveEvent(existing,60).end],[960,1005]) // 3:00–3:45 → 4:00–4:45
 for(const delta of [-5000,-61,-22,22,60,5000]){
  const moved=moveEvent(existing,delta)
  assert.equal(moved.end-moved.start,45)
  assert.equal(moved.start%15,0);assert.equal(moved.end%15,0)
 }
 const imported={...e,origin:'imported'};assert.equal(moveEvent(imported,30),imported)
 assert.deepEqual(ordered([{...e,id:'late',start:1000},{...e,id:'early',start:500}]).map(e=>e.id),['early','late'])
})
test('connected overlaps use stable collision-free lanes and touching activities share a lane',()=>{
 const base=createFixture('family').events[0]
 const input=[{...base,id:'a',start:540,end:600},{...base,id:'b',start:555,end:570},{...base,id:'c',start:570,end:615},{...base,id:'d',start:615,end:630}]
 const result=overlapLayout(input)
 assert.deepEqual(result.map(x=>[x.event.id,x.lane,x.lanes]),[['a',0,2],['b',1,2],['c',1,2],['d',0,1]])
 for(const a of result)for(const b of result)if(a!==b&&a.event.start<b.event.end&&a.event.end>b.event.start)assert.notEqual(a.lane,b.lane)
})
test('copy/routines append new local identities for only the selected profile; inputs are immutable',()=>{
 const data=createFixture('family'),before=JSON.stringify(data),tomorrow=addDays(TODAY,1);let n=0
 const copied=copyDay(data,'soren',TODAY,tomorrow,()=>`copy-${n++}`),added=copied.events.filter(e=>e.id.startsWith('copy-'))
 assert.equal(added.length,visibleEvents(data,'soren').filter(e=>e.date===TODAY).length)
 assert.ok(added.every(e=>e.date===tomorrow&&e.profileIds.join()==='soren'&&e.origin==='local'))
 assert.equal(new Set(copied.events.map(e=>e.id)).size,copied.events.length)
 for(const routine of ['School Day','Weekend','No School'])assert.equal(applyRoutine(data,'siv',tomorrow,routine,()=>`routine-${n++}`).events.length,data.events.length+3)
 assert.equal(JSON.stringify(data),before)
})
test('bulk import review selects exact events/profiles and never changes calendar timing',()=>{
 const data=createFixture('family'),ids=['import-0','import-1','import-2'],sivBefore=visibleEvents(data,'siv')
 const next=reviewImports(data,ids,'included',['soren'])
 assert.equal(visibleEvents(next,'soren').length,visibleEvents(data,'soren').length+3)
 assert.deepEqual(visibleEvents(next,'siv'),sivBefore)
 for(const id of ids){const old=data.events.find(e=>e.id===id),e=next.events.find(e=>e.id===id);assert.equal(e.start,old.start);assert.equal(e.end,old.end);assert.equal(e.date,old.date)}
 assert.equal(next.events.filter(e=>e.review==='pending').length,6)
 assert.equal(reviewImports(data,ids,'included',[]),data)
 const ignored=reviewImports(next,['import-0'],'ignored',[]);assert.ok(!visibleEvents(ignored,'soren').some(e=>e.id==='import-0'))
})
test('title-wide future review preserves already-reviewed events and earlier occurrences',()=>{
 const data=createFixture('family'),chosen=data.events.find(e=>e.id==='import-3')
 data.events.push({...chosen,id:'earlier',date:addDays(chosen.date,-1)},{...chosen,id:'decided',date:addDays(chosen.date,1),review:'ignored'})
 const next=reviewImports(data,[chosen.id],'included',['soren','siv'],'therapy',true)
 assert.equal(next.rules.length,1)
 assert.equal(next.events.find(e=>e.id==='earlier').review,'pending')
 assert.equal(next.events.find(e=>e.id==='decided').review,'ignored')
 assert.ok(next.events.filter(e=>e.origin==='imported'&&e.review==='included').every(e=>e.profileIds.length===2))
})
test('visibility ranges include day/week/month horizons and handle date boundaries',()=>{
 for(const horizon of [1,2,3,4,5,6,7,14,21,28])assert.equal(rangeDates(TODAY,horizon).length,horizon)
 assert.equal(addDays('2028-02-28',1),'2028-02-29');assert.equal(addDays('2026-12-31',1),'2027-01-01')
 assert.equal(shiftRange('2026-12-31','month',1),'2027-01-01')
 const month=rangeDates('2026-10-06','month');assert.equal(month.length,42);assert.ok(month.includes('2026-10-01'));assert.ok(month.includes('2026-10-31'))
})
test('prototype entry is development guarded and production code cannot import fixture modules',async()=>{
 const entry=await readFile(new URL('./browser/scheduling-main.tsx',import.meta.url),'utf8')
 assert.ok(entry.indexOf('if(!import.meta.env.DEV)')<entry.indexOf("await import('./scheduling/"))
 async function walk(path){for(const item of await readdir(path,{withFileTypes:true})){const child=new URL(item.name+(item.isDirectory()?'/':''),path);if(item.isDirectory())await walk(child);else if(/\.(tsx?|css)$/.test(item.name))assert.doesNotMatch(await readFile(child,'utf8'),/tests\/browser\/scheduling|scheduling-prototype|SchedulingPrototype/)}}
 await walk(new URL('../src/',import.meta.url))
 const app=await readFile(new URL('./browser/scheduling/SchedulingPrototype.tsx',import.meta.url),'utf8')
 assert.doesNotMatch(app,/supabase|functions\.invoke|localStorage|fetch\(/)
})


test('timeline initial focus uses today context, first event on other dates, and daytime for empty days',async()=>{
 const {initialTimelineMinute,visibleTimelineMinute}=await import('./browser/scheduling/timelineInteraction.ts')
 const events=[{...createFixture('family').events[0],start:600}]
 assert.equal(initialTimelineMinute(TODAY,events),840)
 assert.equal(initialTimelineMinute('2026-10-07',events),585)
 assert.equal(initialTimelineMinute(TODAY,[]),540)
 assert.equal(visibleTimelineMinute(480,1140,-580,100,2),825)
 assert.equal(visibleTimelineMinute(480,1140,500,100,2),480)
 assert.equal(visibleTimelineMinute(480,1140,-9000,100,2),1125)
})

test('long-press waits 500ms; early swipes/scrolling cancel without moving events',async()=>{
 const {TimelineGesture,HOLD_MS}=await import('./browser/scheduling/timelineInteraction.ts')
 const event={...createFixture('family').events[0],start:900,end:945},g=new TimelineGesture()
 g.begin(event,100,200,0,0);assert.equal(g.activate(HOLD_MS-1),false)
 assert.equal(g.finish(true),undefined) // Short tap remains an editor action, no move.
 g.begin(event,100,200,0,0);g.update(102,210,0,2)
 assert.equal(g.activate(600),false);assert.equal(g.finish(true),undefined)
 g.begin(event,100,200,0,0);g.update(100,200,12,2)
 assert.equal(g.activate(600),false);assert.equal(g.finish(true),undefined)
 g.begin(event,100,200,0,0);g.update(103,204,0,2)
 assert.equal(g.activate(HOLD_MS),true)
 assert.equal(g.finish(true),undefined) // Holding without movement does not write.
})

test('activated hold preserves duration, snaps, accounts for autoscroll and cancels atomically',async()=>{
 const {TimelineGesture}=await import('./browser/scheduling/timelineInteraction.ts')
 const event={...createFixture('family').events[0],start:900,end:945},g=new TimelineGesture()
 g.begin(event,100,200,0,0);g.activate(500);g.update(100,260,0,2)
 assert.equal(g.state.preview.start,930);assert.equal(g.state.preview.end,975)
 g.update(100,260,60,2)
 const moved=g.finish(true);assert.equal(moved.start,960);assert.equal(moved.end,1005)
 for(const delta of [-9999,63,9999]){
  g.begin(event,100,200,0,0);g.activate(500);g.update(100,200+delta,0,2)
  assert.equal(g.state.preview.end-g.state.preview.start,45)
  assert.equal(g.state.preview.start%15,0);assert.equal(g.state.preview.end%15,0)
  assert.equal(g.finish(false),undefined) // Escape, pointer cancel and Cancel move share this path.
  assert.equal(g.state,undefined)
 }
 assert.equal(event.start,900);assert.equal(event.end,945)
 assert.equal(g.begin({...event,origin:'imported'},0,0,0,0),false)
})

test('handle bypasses hold delay and edge scroll respects sticky toolbar and frame duration',async()=>{
 const {TimelineGesture,edgeScrollDelta}=await import('./browser/scheduling/timelineInteraction.ts')
 const event={...createFixture('family').events[0],start:900,end:945},g=new TimelineGesture()
 g.begin(event,100,200,0,0,true);g.update(100,260,0,2)
 assert.equal(g.finish(true).start,930)
 g.begin(event,100,200,0,0,true,true);g.update(100,230,0,2)
 assert.equal(g.finish(true).end,960)
 assert.equal(edgeScrollDelta(400,110,800,16),0)
 assert.ok(edgeScrollDelta(120,110,800,16)<0)
 assert.ok(edgeScrollDelta(790,110,800,16)>0)
 assert.equal(edgeScrollDelta(790,110,800,1000),edgeScrollDelta(790,110,800,32))
})


test('cross-day moves preserve identity, exact time, duration, profile and visual context',async()=>{
 const {moveEventToDay,nearbyWeek}=await import('./browser/scheduling/model.ts')
 const event={...createFixture('family').events[0],date:'2026-10-06',start:900,end:945}
 const moved=moveEventToDay(event,'2026-10-07')
 assert.deepEqual(moved,{...event,date:'2026-10-07'})
 assert.equal(moved.end-moved.start,45);assert.equal(event.date,'2026-10-06')
 assert.equal(moveEventToDay(event,'2026-02-30'),event)
 assert.equal(moveEventToDay(event,event.date),event)
 const imported={...event,origin:'imported'};assert.equal(moveEventToDay(imported,'2026-10-07'),imported)
 assert.deepEqual(nearbyWeek('2026-10-06'),['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11'])
 assert.ok(nearbyWeek('2027-01-01').includes('2026-12-31'))
})

test('calendar handle drag commits only valid drops; cancellation, clicks and narrow screens do not move',async()=>{
 const {CalendarDrag}=await import('./browser/scheduling/calendarInteraction.ts')
 const event={...createFixture('family').events[0],date:'2026-10-06',start:900,end:945},drag=new CalendarDrag()
 assert.equal(drag.begin(event,100,200,false),false)
 assert.equal(drag.begin({...event,origin:'imported'},100,200,true),false)
 drag.begin(event,100,200,true);drag.update(103,204,'2026-10-07');assert.equal(drag.finish(true),undefined)
 drag.begin(event,100,200,true);drag.update(300,200,'2026-10-07')
 assert.equal(drag.state.date,'2026-10-07');assert.deepEqual(drag.finish(true),{...event,date:'2026-10-07'})
 for(const date of [undefined,'2026-10-06','invalid']){drag.begin(event,100,200,true);drag.update(300,200,date);assert.equal(drag.finish(true),undefined)}
 drag.begin(event,100,200,true);drag.update(300,200,'2026-10-07');assert.equal(drag.finish(false),undefined)
 assert.equal(event.date,'2026-10-06')
})

test('Week returns to its horizontal position at the same width and starts at Today after a layout change',async()=>{
 const {restoreWeekScroll}=await import('./browser/scheduling/calendarInteraction.ts')
 assert.equal(restoreWeekScroll(undefined,373,1940),0)
 const saved={left:331.2,width:373}
 assert.equal(restoreWeekScroll(saved,373,1940),331.2)
 assert.equal(restoreWeekScroll(saved,373.5,1940),331.2)
 assert.equal(restoreWeekScroll(saved,373,200),200)
 assert.equal(restoreWeekScroll(saved,373,0),0)
 assert.equal(restoreWeekScroll(saved,793,3879),0)
 assert.equal(restoreWeekScroll({left:-20,width:373},373,1940),0)
 assert.equal(restoreWeekScroll({left:NaN,width:373},373,1940),0)
 assert.deepEqual(saved,{left:331.2,width:373})
})

test('caregiver setup keeps per-profile preferences and identity separate from scheduling undo',async()=>{
 const {updatePrototypeProfile,moveEventToDay,restoreScheduleSnapshot}=await import('./browser/scheduling/model.ts')
 const original=createFixture('family'),configured=updatePrototypeProfile(original,'siv','Siv','moon','month')
 assert.equal(configured.profiles.find(p=>p.id==='siv').visibility,'month')
 assert.equal(configured.profiles.find(p=>p.id==='soren').visibility,7)
 assert.equal(configured.events,original.events)
 const moved={...configured,events:configured.events.map((e,i)=>i===0?moveEventToDay(e,'2026-10-07'):e)}
 const renamed=updatePrototypeProfile(moved,'caregiver','Caregiver Lee','flower')
 const undone=restoreScheduleSnapshot(renamed,original)
 assert.deepEqual(undone.events,original.events)
 assert.equal(undone.profiles.find(p=>p.id==='siv').visibility,'month')
 assert.equal(undone.caregiver.name,'Caregiver Lee')
 assert.equal(undone.caregiver.avatar,'flower')
 assert.equal(updatePrototypeProfile(configured,'siv',' ','moon','month'),configured)
 assert.equal(updatePrototypeProfile(configured,'siv','Siv','unknown','month'),configured)
 assert.equal(updatePrototypeProfile(configured,'siv','Siv','sun',99),configured)
})

test('each setup visibility renders its range; Month is six Sunday–Saturday rows and Now/Next skips other concurrent events',async()=>{
 const {HORIZONS,updatePrototypeProfile,currentAndNext}=await import('./browser/scheduling/model.ts')
 const data=createFixture('family')
 for(const h of HORIZONS){
  const configured=updatePrototypeProfile(data,'siv','Siv','flower',h.value),profile=configured.profiles.find(p=>p.id==='siv')
  assert.equal(profile.visibility,h.value)
  assert.equal(rangeDates(TODAY,profile.visibility).length,h.value==='month'?42:Math.max(1,h.value))
  assert.equal(configured.profiles.find(p=>p.id==='soren').visibility,7)
 }
 const month=rangeDates('2026-10-06','month')
 assert.equal(new Date(month[0]+'T12:00:00Z').getUTCDay(),0)
 assert.equal(new Date(month.at(-1)+'T12:00:00Z').getUTCDay(),6)
 assert.equal(month.filter(d=>d.startsWith('2026-10')).length,31)
 const result=currentAndNext(visibleEvents(data,'soren'))
 assert.equal(result.length,2);assert.equal(result[0].activityId,'pt');assert.equal(result[1].activityId,'rest')
})
