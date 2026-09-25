import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { defaultDisplayPreferences, parseDisplayPreferences, selectRenderer, selectSequence, displayClock, visibleContext } from '../src/display/preferences.ts'
import { atLocalTime } from '../src/lib/time.ts'
import { normalizeWeek } from '../src/lib/persistentSchedule.ts'
import { householdFixture, decision } from './fixtures/externalCalendars.mjs'
const now=new Date('2026-09-23T14:30:00Z')
const picture={id:'activity',kind:'school',label:'SCHOOL'}
const event=(id,start,end)=>({id,title:'School',label:'SCHOOL',startTime:`2026-09-23T${start}:00Z`,endTime:`2026-09-23T${end}:00Z`,picture,activity:{id:'school',picture},people:[{id:'dad',name:'Dad',picture:{id:'dad',kind:'dad',label:'DAD'}}],place:{id:'school-place',name:'School',picture:{id:'school-place',kind:'school',label:'SCHOOL'}}})
const day={id:'today',date:'2026-09-23',timeZone:'UTC',primaryEventId:'current',events:[event('done','12:00','13:00'),event('current','14:00','15:00'),event('next','15:00','16:00'),event('then','16:00','17:00'),event('later','17:00','18:00')]}
const schedule={days:[day],timeZone:'UTC'}
test('missing preferences preserve approved Week defaults; unsupported modes and malformed settings rejected',()=>{
 assert.deepEqual(parseDisplayPreferences(),defaultDisplayPreferences());assert.equal(selectRenderer(parseDisplayPreferences()),'week')
 assert.equal(selectRenderer(defaultDisplayPreferences('first-next-then')),'first-next-then')
 assert.equal(defaultDisplayPreferences('first-next-then').allowNavigation,false)
 for(const change of [{displayMode:'half-day'},{showWho:null},{maxVisibleItems:0},{motionPreference:'animated'},{version:2}]) assert.throws(()=>parseDisplayPreferences({...defaultDisplayPreferences(),...change}))
})
test('immediate sequence uses current/upcoming timing, advances at exclusive end, and never fills blank cards',()=>{
 assert.deepEqual(selectSequence(schedule,now).map(i=>i.event.id),['current','next','then'])
 assert.deepEqual(selectSequence(schedule,new Date('2026-09-23T15:00:00Z')).map(i=>i.event.id),['next','then','later'])
 assert.equal(selectSequence(schedule,new Date('2026-09-23T17:30:00Z')).length,1)
 assert.equal(selectSequence(schedule,new Date('2026-09-23T18:00:00Z')).length,0)
 assert.equal(selectSequence(schedule,new Date('2026-09-24T10:00:00Z')).length,0)
 assert.equal(selectSequence(schedule,now,1).length,1);assert.equal(selectSequence(schedule,now,7).length,3)
 assert.equal(selectSequence(schedule,now)[0].event,day.events[1])
 const prefs=defaultDisplayPreferences('first-next-then'),later=new Date('2026-09-23T16:30:00Z')
 assert.equal(displayClock(later,now,prefs),later);assert.equal(displayClock(later,now,{...prefs,autoAdvance:false}),now)
})
test('WHO and WHERE preferences independently hide context without mutating schedule',()=>{
 const prefs=defaultDisplayPreferences('first-next-then'),item=day.events[1]
 assert.deepEqual(visibleContext(item,prefs),{people:[],place:undefined})
 assert.equal(visibleContext(item,{...prefs,showWho:true}).people.length,1)
 assert.equal(visibleContext(item,{...prefs,showWhere:true}).place,item.place)
 assert.equal(item.people.length,1)
})
test('both actual renderers consume engine-normalized schedules; restricted mode has no navigation or hidden context',async()=>{
 const server=await createServer({configFile:false,cacheDir:'node_modules/.vite-display-tests',plugins:[react()],server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true}})
 try {
  const {DisplayRenderer}=await server.ssrLoadModule('/src/display/DisplayRenderer.tsx')
  const data=householdFixture();data.integration.mappings=[decision]
  const normalized={days:normalizeWeek(data,'soren',now),timeZone:data.household.time_zone}
  const props={schedule:normalized,profileName:'Soren',now,preferences:defaultDisplayPreferences()}
  const week=renderToStaticMarkup(createElement(DisplayRenderer,props))
  assert.match(week,/data-display-mode="week"/);assert.equal((week.match(/data-date=/g)||[]).length,7);assert.match(week,/MY WEEK/);assert.match(week,/TODAY/)
  const first=renderToStaticMarkup(createElement(DisplayRenderer,{...props,preferences:defaultDisplayPreferences('first-next-then')}))
  assert.match(first,/data-display-mode="first-next-then"/);assert.match(first,/SPEECH/);assert.match(first,/FIRST/)
  assert.doesNotMatch(first,/<button|<nav|WHO|WHERE|<time|MY WEEK/)
  const context=renderToStaticMarkup(createElement(DisplayRenderer,{...props,schedule,preferences:{...defaultDisplayPreferences('first-next-then'),showWho:true,showWhere:true,showTimes:true}}))
  assert.match(context,/WHO/);assert.match(context,/WHERE/);assert.match(context,/<time/)
  const fixedWeek=renderToStaticMarkup(createElement(DisplayRenderer,{...props,preferences:{...props.preferences,allowNavigation:false}}))
  assert.equal((fixedWeek.match(/disabled=""/g)||[]).length,7);assert.doesNotMatch(fixedWeek,/TAP A DAY|Open day/)
  const thursdayProps={...props,schedule:datedSchedule,preferences:defaultDisplayPreferences('first-next-then'),now:new Date(atLocalTime('2026-09-24','19:30',zone))}
  const sleepOnly=renderToStaticMarkup(createElement(DisplayRenderer,thursdayProps))
  assert.equal((sleepOnly.match(/data-event-id=/g)||[]).length,1)
  assert.match(sleepOnly,/data-event-id="2026-09-24-sleep"/)
  assert.doesNotMatch(sleepOnly,/>NEXT<|>THEN</)
 } finally {await server.close()}
})

// Each day deliberately contains events: selecting the first nonempty day is incorrect.
const zone='America/Chicago'
function datedDay(date) {
 const make=(id,start,end)=>({...event(id,'12:00','13:00'),id:date+'-'+id,startTime:atLocalTime(date,start,zone),endTime:end?atLocalTime(date,end,zone):undefined})
 const sleep={...make('sleep','20:00'),label:'SLEEP',sleepLocation:day.events[0].place}
 return {id:date,date,timeZone:zone,events:[make('done','07:00','08:00'),make('active','09:00','10:00'),make('later','11:00','12:00'),sleep]}
}
const datedSchedule={timeZone:zone,days:['2026-09-21','2026-09-22','2026-09-23','2026-09-24','2026-09-25','2026-09-26','2026-09-27'].map(datedDay)}
const ids=(input,instant)=>selectSequence(input,new Date(instant)).map(item=>item.event.id)

test('Thursday selects its active/upcoming events regardless of week start, day order, or selected-day hints',()=>{
 const instant=atLocalTime('2026-09-24','09:30',zone)
 const expected=['2026-09-24-active','2026-09-24-later','2026-09-24-sleep']
 assert.deepEqual(ids(datedSchedule,instant),expected)
 assert.deepEqual(ids({...datedSchedule,days:[...datedSchedule.days].reverse()},instant),expected)
 // Week selection is renderer-local, not an input to the sequence selector.
 for(const selectedDate of ['2026-09-21','2026-09-27']) {
  assert.deepEqual(ids({...datedSchedule,selectedDate},instant),expected)
 }
 assert.deepEqual(ids({...datedSchedule,days:datedSchedule.days.filter(d=>d.date!=='2026-09-24')},instant),[])
})

test('timezone midnight boundaries choose household today, including a different UTC date and week',()=>{
 assert.deepEqual(ids(datedSchedule,'2026-09-25T04:59:59Z'),['2026-09-24-sleep'])
 assert.equal(ids(datedSchedule,'2026-09-25T05:00:00Z')[0],'2026-09-25-done')
 // UTC has reached Monday; Chicago is still Sunday in the existing week.
 assert.deepEqual(ids(datedSchedule,'2026-09-28T04:59:59Z'),['2026-09-27-sleep'])
 assert.deepEqual(ids(datedSchedule,'2026-09-28T05:00:00Z'),[])
 const tokyo='Asia/Tokyo',date='2026-09-25'
 const tokyoDay={...datedDay(date),timeZone:tokyo,events:[{...day.events[0],id:'tokyo-friday',startTime:atLocalTime(date,'01:00',tokyo),endTime:atLocalTime(date,'02:00',tokyo)}]}
 assert.deepEqual(ids({days:[tokyoDay],timeZone:tokyo},'2026-09-24T15:00:00Z'),['tokyo-friday'])
})

test('Thursday completed events leave the sequence; a remaining sleep renders exactly one item',()=>{
 for(const time of ['12:00','19:30','20:00','23:59']) {
  const items=selectSequence(datedSchedule,new Date(atLocalTime('2026-09-24',time,zone)))
  assert.equal(items.length,1)
  assert.equal(items[0].event.id,'2026-09-24-sleep')
  assert.equal(items[0].position,'FIRST')
 }
})

test('the persistent normalizer and sequence selector agree on household Thursday after UTC midnight',()=>{
 const data=householdFixture()
 data.events=[{...data.events[0],source_kind:'local',id:'thursday-school',start_time:atLocalTime('2026-09-24','08:00',zone),end_time:atLocalTime('2026-09-24','15:00',zone)}]
 data.visuals=[{id:'visual',event_id:'thursday-school',profile_id:'soren',activity_id:'speech',place_id:'clinic',visible:true,is_primary:true}]
 data.homeRules=[{id:'home',profile_id:'soren',weekday:4,override_date:null,place_id:'clinic',bedtime:'20:00'}]
 const morning=new Date(atLocalTime('2026-09-24','09:00',zone))
 const normalized={timeZone:zone,days:normalizeWeek(data,'soren',morning)}
 assert.equal(selectSequence(normalized,morning)[0].event.label,'SPEECH')
 const evening=new Date('2026-09-25T04:30:00Z')
 const remaining=selectSequence({timeZone:zone,days:normalizeWeek(data,'soren',evening)},evening)
 assert.deepEqual(remaining.map(i=>i.event.label),['SLEEP'])
 assert.equal(remaining[0].event.id,'2026-09-24-sleep')
})
