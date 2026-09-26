import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarInboxChoices } from '../src/calendar/inboxChoices.ts'
import { calendarInbox, eventKey, seriesKey } from '../src/calendar/relevance.ts'
import { householdFixture } from './fixtures/externalCalendars.mjs'
const now=new Date('2026-09-26T17:00:00Z')
function dataFor(rows) {
 const data=householdFixture(),base=data.events[0],source=data.sources[0]
 data.events=rows.map((r,i)=>({...base,id:'event-'+i,title:'Title',external_kind:r.series?'occurrence':'single',start_time:r.start,end_time:r.end??r.start,...(r.allDay?{all_day:true,all_day_start:r.allDay,all_day_end:'2026-09-30'}:{})}))
 data.sources=rows.map((r,i)=>({...source,event_id:'event-'+i,external_event_id:'external-'+i,external_series_id:r.series??null}))
 return data
}
test('timed single uses concise household-local en-US time and singular occurrence',()=>{
 const data=dataFor([{start:'2026-09-29T20:30:00Z'}])
 assert.equal(calendarInboxChoices(data,false,now)[0].label,'Title · Sep 29, 3:30 PM · Family · 1 occurrence')
})
test('all-day dates do not shift with provider UTC times; today remains upcoming',()=>{
 const data=dataFor([{start:'2026-09-29T00:00:00Z',allDay:'2026-09-29'}])
 const item=calendarInboxChoices(data,false,new Date('2026-09-29T22:00:00Z'))[0]
 assert.equal(item.label,'Title · Sep 29 · All day · Family · 1 occurrence');assert.equal(item.upcoming,true)
})
test('recurring series labels next occurrence but preserves original selected event and mapping IDs',()=>{
 const data=dataFor([{start:'2026-09-22T20:30:00Z',series:'weekly'},...Array.from({length:7},(_,i)=>({start:new Date(Date.UTC(2026,8,29+i*7,20,30)).toISOString(),series:'weekly'}))])
 const original=calendarInbox(data)[0],item=calendarInboxChoices(data,false,now)[0]
 assert.equal(item.label,'Title · Next: Sep 29, 3:30 PM · Family · 8 occurrences')
 assert.equal(item.event,original.event);assert.equal(item.source,original.source)
 assert.equal(eventKey(item.source),eventKey(original.source));assert.equal(seriesKey(item.source),'series:weekly')
 assert.deepEqual(item.profiles,original.profiles)
})
test('past-only recurring series labels the latest occurrence',()=>{
 const data=dataFor([{start:'2026-09-15T20:30:00Z',series:'weekly'},{start:'2026-09-22T20:30:00Z',series:'weekly'}])
 assert.equal(calendarInboxChoices(data,false,now)[0].label,'Title · Last: Sep 22, 3:30 PM · Family · 2 occurrences')
})
test('timezone conversion uses household date across midnight and observes daylight saving',()=>{
 const data=dataFor([{start:'2026-09-30T01:30:00Z'}])
 assert.equal(calendarInboxChoices(data,false,now)[0].label,'Title · Sep 29, 8:30 PM · Family · 1 occurrence')
 data.household.time_zone='Asia/Tokyo'
 assert.equal(calendarInboxChoices(data,false,now)[0].label,'Title · Sep 30, 10:30 AM · Family · 1 occurrence')
})
test('choices sort by next upcoming start, past-only last, without changing input order',()=>{
 const data=dataFor([{start:'2026-10-01T20:30:00Z'},{start:'2026-09-23T20:30:00Z'},{start:'2026-09-22T20:30:00Z',series:'weekly'},{start:'2026-09-29T20:30:00Z',series:'weekly'},{start:'2026-09-28T20:30:00Z'}])
 const before=structuredClone(data)
 assert.deepEqual(calendarInboxChoices(data,false,now).map(i=>i.event.id),['event-4','event-2','event-0','event-1'])
 assert.deepEqual(data,before)
})
