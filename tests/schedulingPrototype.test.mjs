import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile,readdir} from 'node:fs/promises'
import {createFixture,visibleEvents,overlapLayout,moveEvent,copyDay,applyRoutine,reviewImports,rangeDates,shiftRange,addDays,TODAY,ordered} from './browser/scheduling/model.ts'

test('fictional scenarios have distinct profiles, dense quarter-hour schedules and no accepted pending imports',()=>{
 const family=createFixture('family'),home=createFixture('residential')
 assert.deepEqual(family.profiles.map(p=>p.name),['Soren','Siv'])
 assert.equal(family.events.filter(e=>e.review==='pending').length,9)
 assert.ok(visibleEvents(family,'soren').every(e=>e.review==='included'&&e.profileIds.includes('soren')))
 assert.ok(home.profiles.length>=4);assert.ok(home.events.every(e=>e.origin==='local'))
 assert.ok(home.events.filter(e=>e.profileIds.includes('alex')&&e.date===TODAY&&e.end-e.start===15).length>=12)
 for(const e of [...home.events,...family.events]){assert.equal(e.start%15,0);assert.equal(e.end%15,0);assert.ok(e.end>e.start)}
})
test('timeline gestures snap, retain duration, bound endpoints and keep imported timing read-only',()=>{
 const e={...createFixture('family').events[0],start:915,end:960}
 assert.deepEqual([moveEvent(e,45).start,moveEvent(e,45).end],[960,1005])
 assert.equal(moveEvent(e,22).start,930)
 assert.equal(moveEvent(e,-5000).start,0);assert.equal(moveEvent(e,5000).end,1440)
 assert.equal(moveEvent(e,-5000,true).end,e.start+15);assert.equal(moveEvent(e,5000,true).end,1440)
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
