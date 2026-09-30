import test from 'node:test'
import assert from 'node:assert/strict'
import {clockText,activityTime,orderedActivities,startMinuteClock} from '../src/display/standardTime.ts'
import {defaultDisplayPreferences} from '../src/display/preferences.ts'
import {cleanupImages} from '../server/calendar/imageCleanup.ts'
const zone='America/Chicago'
test('household clock: DST, 12/24 hour, all-day, chronological times and profile defaults',()=>{
 assert.equal(clockText(new Date('2026-03-08T07:59Z'),zone),'1:59 AM')
 assert.equal(clockText(new Date('2026-03-08T08:00Z'),zone),'3:00 AM')
 assert.equal(clockText(new Date('2026-09-29T20:30Z'),zone),'3:30 PM')
 assert.equal(clockText(new Date('2026-09-29T20:30Z'),zone,'24h'),'15:30')
 assert.equal(clockText(new Date('2026-11-01T06:30Z'),zone),clockText(new Date('2026-11-01T07:30Z'),zone))
 const late={id:'late',startTime:'2026-09-29T20:30Z'},early={id:'early',startTime:'2026-09-29T13:00Z'}
 assert.equal(activityTime(late,zone),'3:30 PM');assert.equal(activityTime({...late,allDay:true},zone),'All day')
 assert.deepEqual(orderedActivities([late,{...early,id:'sleep',sleepLocation:{}},early]).map(e=>e.id),['early','late'])
 for(const mode of ['week','first-next-then','standard-calendar']) {
  const p=defaultDisplayPreferences(mode);assert.equal(p.showClock,mode==='standard-calendar');assert.equal(p.showActivityTimes,mode==='standard-calendar');assert.equal(p.clockFormat,'12h')
 }
})
test('minute-aligned clock updates and catches up after wake, then removes timer/listener',()=>{
 let now=Date.parse('2026-09-29T20:30:25Z'),timer,wake,delay,removed=false,cleared=false;const updates=[]
 const stop=startMinuteClock(d=>updates.push(d.toISOString()),{now:()=>now,set:(fn,ms)=>{timer=fn;delay=ms;return 1},clear:()=>{cleared=true},listen:fn=>{wake=fn;return()=>{removed=true}}})
 assert.equal(delay,35000);now+=35000;timer();assert.equal(delay,60000)
 now+=3700000;wake();assert.equal(updates.at(-1),new Date(now).toISOString());assert.equal(delay,60000-now%60000)
 stop();assert.ok(removed&&cleared)
})
test('private image cleanup completes only after successful storage removal; failures are retryable',async()=>{
 const calls=[];let fail=true
 const service={rpc:async(name,args)=>{calls.push([name,args]);return {data:name==='claim_image_cleanup'?['h/image.png']:null,error:null}},storage:{from:bucket=>({remove:async paths=>{calls.push([bucket,paths]);return {error:fail?new Error('private storage failure'):null}}})}}
 assert.deepEqual(await cleanupImages(service,'h'),{pending:true});assert.equal(calls.some(c=>c[0]==='finish_image_cleanup'),false)
 fail=false;assert.deepEqual(await cleanupImages(service,'h'),{pending:false});assert.deepEqual(calls.at(-1),['finish_image_cleanup',{paths:['h/image.png']}])
})
