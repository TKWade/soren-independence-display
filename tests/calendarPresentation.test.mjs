import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarDates, navigateCalendar, calendarViewAllowed, isSubduedDay } from '../src/display/calendarPresentation.ts'
import { defaultDisplayPreferences, parseDisplayPreferences } from '../src/display/preferences.ts'
import { scheduleForDates } from '../src/lib/scheduleForDates.ts'
import { householdFixture } from './fixtures/externalCalendars.mjs'
import { database } from './fixtures/database.mjs'
const rolling=defaultDisplayPreferences(),standard=defaultDisplayPreferences('standard-calendar'),zone='America/Chicago'
const dates=(instant,p=rolling,anchor,view)=>calendarDates(p,new Date(instant),zone,anchor,view)
test('rolling Sunday to Monday keeps Today second and yesterday subdued',()=>{
 const sunday=dates('2026-09-27T17:00:00Z'),monday=dates('2026-09-28T17:00:00Z')
 assert.deepEqual(sunday,['2026-09-26','2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02'])
 assert.equal(monday[0],sunday[1]);assert.equal(monday[1],'2026-09-28')
 assert.deepEqual(monday.map(date=>isSubduedDay(date,monday[1],rolling)),[true,false,false,false,false,false,false])
})
test('rolling dates cross month/year and leap day in household timezone',()=>{
 assert.deepEqual(dates('2027-01-01T04:00:00Z').slice(0,3),['2026-12-30','2026-12-31','2027-01-01'])
 assert.deepEqual(dates('2024-03-01T04:00:00Z').slice(0,3),['2024-02-28','2024-02-29','2024-03-01'])
 assert.equal(dates('2024-03-01T06:00:00Z')[1],'2024-03-01')
 assert.equal(calendarDates(rolling,new Date('2026-09-27T16:00:00Z'),'Asia/Tokyo')[1],'2026-09-28')
})
test('standard week navigation uses Monday weeks across years; Today resets anchor',()=>{
 const now='2027-01-01T18:00:00Z',first=dates(now,standard)
 assert.equal(first[0],'2026-12-28');assert.equal(first[6],'2027-01-03')
 const next=navigateCalendar(first[0],'week',1);assert.equal(next,'2027-01-04')
 assert.equal(navigateCalendar(next,'week',-1),first[0]);assert.deepEqual(dates(now,standard,undefined),first)
})
test('month covers every date and navigation crosses leap months and years',()=>{
 const feb=dates('2024-02-15T18:00:00Z',standard,undefined,'month')
 assert.equal(feb.length,29);assert.equal(feb[0],'2024-02-01');assert.equal(feb[28],'2024-02-29')
 assert.equal(navigateCalendar('2024-01-31','month',1),'2024-02-29')
 assert.equal(navigateCalendar('2026-12-01','month',1),'2027-01-01')
 assert.equal(navigateCalendar('2027-01-01','month',-1),'2026-12-01')
 assert.equal(dates('2025-02-15T18:00:00Z',standard,undefined,'month').length,28)
})
test('profile restrictions reject invalid combinations and retain legacy defaults',()=>{
 assert.equal(calendarViewAllowed(rolling,'month'),false);assert.equal(calendarViewAllowed(standard,'month'),true)
 const weekOnly=parseDisplayPreferences({...standard,allowedViews:['week']});assert.equal(calendarViewAllowed(weekOnly,'month'),false)
 for(const change of [{allowedViews:[]},{allowedViews:['week','week']},{defaultView:'month'},{todayPosition:1},{allowCalendarNavigation:true}]) assert.throws(()=>parseDisplayPreferences({...rolling,...change}))
 const legacy=Object.fromEntries(Object.entries(rolling).filter(([key])=>!['allowedViews','defaultView','weekPresentation','todayPosition','allowCalendarNavigation'].includes(key)))
 assert.deepEqual(parseDisplayPreferences(legacy),rolling)
 assert.deepEqual(parseDisplayPreferences({...standard,allowedViews:['month'],defaultView:'month'}).allowedViews,['month'])
})
test('range assembly reuses normalized weeks beyond the current calendar week',()=>{
 const data=householdFixture(),range=dates('2026-09-27T17:00:00Z')
 const days=scheduleForDates(data,'soren',range)
 assert.deepEqual(days.map(day=>day.date),range);assert.ok(days.every(day=>day.timeZone===zone))
 const month=dates('2024-02-15T18:00:00Z',standard,undefined,'month')
 assert.equal(scheduleForDates(data,'soren',month).length,29)
})
test('database preference validation accepts legacy and standard profiles and rejects invalid restrictions',async()=>{
 const db=await database()
 try {
  for(const value of [rolling,standard,{...standard,allowedViews:['month'],defaultView:'month'}]) {
   assert.equal((await db.query('select private.valid_display_preferences($1::jsonb) as valid',[JSON.stringify(value)])).rows[0].valid,true)
  }
  for(const change of [{allowedViews:[]},{defaultView:'month'},{allowCalendarNavigation:true},{todayPosition:1},{weekPresentation:'calendar'}]) {
   assert.equal((await db.query('select private.valid_display_preferences($1::jsonb) as valid',[JSON.stringify({...rolling,...change})])).rows[0].valid,false)
  }
 } finally {await db.close()}
})
