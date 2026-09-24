import test from 'node:test'
import assert from 'node:assert/strict'
import { recurrenceDates, resolveOccurrences, validateRecurrence, recurrenceSummary } from '../src/lib/recurrence.ts'
import { atLocalTime, localInput } from '../src/lib/time.ts'
const rule=(extra={})=>({version:1,frequency:'weekly',interval:1,startDate:'2026-09-10',endDate:'2026-12-17',weekdays:[4],...extra})
const event=(r,extra={})=>({id:'therapy',source_kind:'local',all_day:false,recurrence:null,time_zone:'America/Chicago',start_time:atLocalTime(r.startDate,'08:00','America/Chicago'),end_time:atLocalTime(r.startDate,'09:00','America/Chicago'),local_recurrence:r,...extra})
test('daily intervals and inclusive start/end with no pre-start dates',()=>{
 assert.deepEqual(recurrenceDates(rule({frequency:'daily',interval:2,endDate:'2026-09-14'}),'2026-09-08','2026-09-16'),['2026-09-10','2026-09-12','2026-09-14'])
})
for(const interval of [1,2,3,4]) test(`Thursday every ${interval} weeks is anchored to the start week`,()=>{
 const dates=recurrenceDates(rule({interval}),'2026-09-01','2026-12-31')
 assert.equal(dates[0],'2026-09-10')
 assert.equal(dates.length,Math.floor(98/(interval*7))+1)
 assert.equal(dates[1],{1:'2026-09-17',2:'2026-09-24',3:'2026-10-01',4:'2026-10-08'}[interval])
 assert.ok(dates.every(date=>new Date(date+'T12:00Z').getUTCDay()===4&&date<='2026-12-17'))
})
test('Monday-Friday and multi-day rules do not depend on requested range start',()=>{
 const school=rule({startDate:'2026-08-20',endDate:'2027-05-20',weekdays:[1,2,3,4,5]})
 assert.deepEqual(recurrenceDates(school,'2026-09-21','2026-09-27'),['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25'])
 const multi=rule({interval:3,weekdays:[2,4]})
 assert.deepEqual(recurrenceDates(multi,'2026-09-01','2026-10-05'),['2026-09-10','2026-09-29','2026-10-01'])
 assert.deepEqual(recurrenceDates(multi,'2026-09-30','2026-10-02'),['2026-10-01'])
})
test('monthly day 15, interval, missing month days and leap year',()=>{
 assert.deepEqual(recurrenceDates(rule({frequency:'monthly',dayOfMonth:15}),'2026-09-01','2026-12-31'),['2026-09-15','2026-10-15','2026-11-15','2026-12-15'])
 assert.deepEqual(recurrenceDates(rule({frequency:'monthly',interval:2,dayOfMonth:15}),'2026-09-01','2026-12-31'),['2026-09-15','2026-11-15'])
 assert.deepEqual(recurrenceDates(rule({frequency:'monthly',dayOfMonth:31,startDate:'2026-01-31',endDate:null}),'2026-01-01','2026-04-30'),['2026-01-31','2026-03-31'])
 assert.deepEqual(recurrenceDates(rule({frequency:'monthly',dayOfMonth:29,startDate:'2028-01-29',endDate:null}),'2028-02-01','2028-02-29'),['2028-02-29'])
})
test('local time stays 08:00 across spring and autumn DST changes',()=>{
 for(const [start,through,offsets] of [['2026-03-07','2026-03-09',['14:00','13:00','13:00']],['2026-10-31','2026-11-02',['13:00','14:00','14:00']]]) {
  const occurrences=resolveOccurrences(event(rule({frequency:'daily',startDate:start,endDate:null})),start,through)
  assert.deepEqual(occurrences.map(o=>o.start_time.slice(11,16)),offsets)
  assert.ok(occurrences.every(o=>localInput(o.start_time,o.time_zone).endsWith('08:00')))
 }
})
test('DST gap moves forward, fold chooses earlier; invalid zero-length occurrence is skipped',()=>{
 const r=rule({frequency:'daily',startDate:'2026-03-07',endDate:null})
 const e=event(r,{start_time:atLocalTime(r.startDate,'02:30','America/Chicago'),end_time:atLocalTime(r.startDate,'04:00','America/Chicago')})
 assert.equal(resolveOccurrences(e,'2026-03-08','2026-03-08')[0].start_time,'2026-03-08T08:30:00Z')
 assert.deepEqual(resolveOccurrences({...e,end_time:atLocalTime(r.startDate,'03:00','America/Chicago')},'2026-03-08','2026-03-08'),[])
 const fold=rule({frequency:'daily',startDate:'2026-10-31',endDate:null})
 assert.equal(resolveOccurrences(event(fold,{start_time:atLocalTime(fold.startDate,'01:30','America/Chicago')}),'2026-11-01','2026-11-01')[0].start_time,'2026-11-01T06:30:00Z')
})
test('overnight overlap, stable original identities, no huge expansion',()=>{
 const r=rule({frequency:'daily',startDate:'2026-09-10',endDate:null})
 const e=event(r,{start_time:atLocalTime(r.startDate,'23:00','America/Chicago'),end_time:atLocalTime('2026-09-11','01:00','America/Chicago')})
 const occurrences=resolveOccurrences(e,'2026-09-21','2026-09-21')
 assert.deepEqual(occurrences.map(o=>o.id),['therapy@2026-09-20','therapy@2026-09-21'])
 assert.equal(occurrences[0].seriesEventId,e.id)
 assert.equal(occurrences[0].originalLocalDate,'2026-09-20')
 assert.throws(()=>recurrenceDates(r,'2026-01-01','2030-01-01'),/at most/)
 assert.equal(resolveOccurrences({...e,local_recurrence:null},'2026-09-21','2026-09-21')[0].id,'therapy')
 assert.deepEqual(resolveOccurrences({...e,recurrence:{rules:['provider-owned']}},'2026-09-21','2026-09-21'),[])
})
test('invalid rules fail clearly; readable every-third-Thursday summary',()=>{
 for(const bad of [{interval:0},{interval:1.5},{weekdays:[]},{weekdays:[0]},{weekdays:[4,4]},{endDate:'2026-01-01'},{frequency:'monthly',dayOfMonth:32}]) assert.throws(()=>validateRecurrence(rule(bad)))
 assert.equal(recurrenceSummary(rule({interval:3})),'Every 3 weeks on Thursday, 2026-09-10 — 2026-12-17')
})
