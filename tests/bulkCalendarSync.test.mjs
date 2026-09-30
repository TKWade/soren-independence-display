import test from 'node:test'
import assert from 'node:assert/strict'
import { database, applyMigration, migrations, asUser, userA } from './fixtures/database.mjs'

async function setup(db) {
 await asUser(db,userA)
 const hid=(await db.query("select public.create_household('Bulk sync','UTC') id")).rows[0].id
 await db.exec('reset role; set role service_role;')
 const conn=(await db.query("insert into public.calendar_connections(household_id,provider,label,status) values($1,'google','Test','connected') returning id",[hid])).rows[0].id
 return {hid,conn}
}
async function batchFor(db,{hid,conn},count) {
 const cal=(await db.query("insert into public.external_calendars(household_id,connection_id,external_calendar_id,name,time_zone,enabled,behavior) values($1,$2,gen_random_uuid()::text,'Test','UTC',true,'evaluate') returning *",[hid,conn])).rows[0]
 const event=i=>({provider:'google',connectionId:conn,calendarId:cal.id,externalCalendarId:cal.external_calendar_id,externalEventId:'event-'+i,externalSeriesId:'series',originalStart:'2026-09-23T14:00:00Z',title:'Event '+i,description:'Private fixture',start:'2026-09-23T14:00:00Z',end:'2026-09-23T15:00:00Z',allDay:false,timeZone:'UTC',locationText:'Place',recurrence:{rules:['RRULE:FREQ=WEEKLY']},kind:'occurrence',status:'confirmed',lastModified:'2026-09-20T00:00:00Z'})
 return {calendar_id:cal.id,expected_revision:0,window_start:'2026-09-01T00:00:00Z',window_end:'2026-12-01T00:00:00Z',replace_window:true,checkpoint:{token:'initial'},changes:Array.from({length:count},(_,i)=>({type:'upsert',event:event(i)}))}
}
const commit=(db,batch)=>db.query('select public.commit_calendar_sync($1)',[JSON.stringify(batch)])
const rows=async(db,batch)=>(await db.query('select e.*,s.external_event_id,s.external_series_id,s.original_start_time from public.calendar_events e join public.external_event_sources s on s.event_id=e.id where s.calendar_id=$1 order by s.external_event_id',[batch.calendar_id])).rows
const state=async(db,batch)=>(await db.query('select public.read_calendar_sync_state($1) state',[batch.calendar_id])).rows[0].state

test('commit benchmark: original versus bulk SQL, initial insert and replacement update (1/100/500/1000)',async t=>{
 const db=await database(false)
 try {
  for(const name of migrations.slice(2,migrations.indexOf('202609260003_bulk_calendar_sync.sql')))await applyMigration(db,name)
  const owner=await setup(db),timings=[]
  for(const version of ['original','bulk']) {
   if(version==='bulk'){await db.exec('reset role;');await applyMigration(db,'202609260003_bulk_calendar_sync.sql');await db.exec('set role service_role;')}
   for(const count of [1,100,500,1000]) {
    const batch=await batchFor(db,owner,count)
    let start=performance.now();await commit(db,batch);const insertMs=performance.now()-start
    const before=await rows(db,batch);assert.equal(before.length,count)
    batch.expected_revision=1;batch.checkpoint={token:'updated'}
    batch.changes=batch.changes.map(c=>({...c,event:{...c.event,title:'Updated '+c.event.title}}))
    start=performance.now();await commit(db,batch);const updateMs=performance.now()-start
    const after=await rows(db,batch)
    assert.deepEqual(after.map(e=>e.id),before.map(e=>e.id))
    assert.equal(after.every(e=>e.title.startsWith('Updated')),true)
    assert.deepEqual(after[0].recurrence,{rules:['RRULE:FREQ=WEEKLY']})
    assert.equal((await state(db,batch)).revision,2)
    const result={version,count,insertMs:Math.round(insertMs),updateMs:Math.round(updateMs)}
    timings.push(result);t.diagnostic(JSON.stringify(result))
   }
  }
 } finally {await db.close()}
})

test('bulk commit preserves metadata, ordering, cancellation, window bounds, all-day dates, CAS and rollback',async()=>{
 const db=await database()
 try {
  const owner=await setup(db),batch=await batchFor(db,owner,3)
  // The last event is outside the replacement window.
  batch.changes[2].event.start='2027-01-01T14:00:00Z';batch.changes[2].event.end='2027-01-01T15:00:00Z'
  await commit(db,batch);const before=await rows(db,batch)
  await db.exec('reset role;')
  const profile=(await db.query("insert into public.profiles(household_id,name) values($1,'Person') returning id",[owner.hid])).rows[0].id
  const activity=(await db.query("insert into public.activities(household_id,name,label,icon) values($1,'School','SCHOOL','school') returning id",[owner.hid])).rows[0].id
  const place=(await db.query("insert into public.places(household_id,name,label,icon) values($1,'Home','HOME','home') returning id",[owner.hid])).rows[0].id
  await db.query("insert into public.event_visuals(household_id,event_id,profile_id,activity_id,place_id,label_override) values($1,$2,$3,$4,$5,'MY LABEL')",[owner.hid,before[0].id,profile,activity,place])
  await db.query("insert into public.event_profile_mappings(household_id,calendar_id,group_key,profile_id,action,activity_id,place_id,label) values($1,$2,'series:series',$3,'include',$4,$5,'MY LABEL')",[owner.hid,batch.calendar_id,profile,activity,place])
  const visuals=(await db.query('select * from public.event_visuals')).rows,mappings=(await db.query('select * from public.event_profile_mappings')).rows
  await db.exec('set role service_role;')
  const next={...batch,expected_revision:1,checkpoint:{token:'replacement'},changes:[batch.changes[0]]}
  await commit(db,next)
  let after=await rows(db,batch)
  assert.deepEqual(after.map(e=>e.external_status),['confirmed','cancelled','confirmed'])
  assert.deepEqual(after.map(e=>e.id),before.map(e=>e.id))
  // Two different identities: valid first row plus a failing second row must roll back all writes and checkpoint.
  const bad={...next,expected_revision:2,changes:[{type:'upsert',event:{...batch.changes[0].event,title:'Must roll back'}},{type:'upsert',event:{...batch.changes[1].event,end:'2026-09-23T13:00:00Z'}}]}
  await assert.rejects(commit(db,bad),/check constraint/)
  assert.equal((await rows(db,batch))[0].title,'Event 0');assert.equal((await state(db,batch)).revision,2)
  assert.deepEqual((await state(db,batch)).cursor,{token:'replacement'})
  await assert.rejects(commit(db,{...bad,changes:[{type:'upsert',event:{...batch.changes[0].event,timeZone:'Not/AZone'}}]}),/Invalid timezone/)
  await assert.rejects(commit(db,next),/revision conflict/)
  // Series cancellation must include occurrences outside the active window.
  await commit(db,{...next,expected_revision:2,replace_window:false,changes:[{type:'cancel',identity:{...batch.changes[0].event,externalEventId:'series'}}]})
  assert.equal((await rows(db,batch)).every(e=>e.external_status==='cancelled'),true)
  // Ordering compatibility: later upsert revives only that occurrence; later series cancel cancels it.
  const cancel={type:'cancel',identity:{...batch.changes[0].event,externalEventId:'series'}}
  await commit(db,{...next,expected_revision:3,replace_window:false,changes:[cancel,batch.changes[0]]})
  assert.equal((await rows(db,batch))[0].external_status,'confirmed')
  await commit(db,{...next,expected_revision:4,replace_window:false,changes:[batch.changes[0],cancel]})
  assert.equal((await rows(db,batch))[0].external_status,'cancelled')
  const allDay={...batch.changes[0].event,allDay:true,start:'2026-09-24',end:'2026-09-25',originalStart:'2026-09-24',timeZone:'America/Chicago'}
  await commit(db,{...next,expected_revision:5,replace_window:false,changes:[{type:'upsert',event:allDay},{type:'upsert',event:{...allDay,title:'Last wins'}}]})
  after=await rows(db,batch);assert.equal(after[0].title,'Last wins');assert.equal(new Date(after[0].all_day_start).toISOString().slice(0,10),'2026-09-24');assert.equal(new Date(after[0].start_time).toISOString(),'2026-09-24T05:00:00.000Z')
  // Exercise all-day bulk conversion separately from duplicate-identity fallback.
  await commit(db,{...next,expected_revision:6,replace_window:false,changes:[{type:'upsert',event:allDay}]})
  assert.equal(new Date((await rows(db,batch))[0].original_start_time).toISOString(),'2026-09-24T05:00:00.000Z')
  await commit(db,{...next,expected_revision:7,replace_window:false,changes:[{type:'cancel',identity:allDay},{type:'cancel',identity:{...allDay,externalEventId:'unknown'}}]})
  assert.equal((await rows(db,batch))[0].external_status,'cancelled')
  assert.equal((await rows(db,batch)).length,3)
  // Fail after valid event writes, during checkpoint insertion, and prove everything rolls back.
  await assert.rejects(commit(db,{...next,expected_revision:8,window_start:null,window_end:null,changes:[{type:'upsert',event:{...allDay,title:'Checkpoint failure'}}]}),/not-null constraint/)
  assert.equal((await rows(db,batch))[0].title,'Event 0')
  assert.equal((await rows(db,batch))[0].external_status,'cancelled')
  assert.equal((await state(db,batch)).revision,8)
  await asUser(db,userA)
  await assert.rejects(db.query("insert into public.calendar_events(household_id,title,start_time,time_zone) values($1,'Local','2026-09-24T08:00:00Z','Invalid/Zone')",[owner.hid]),/Invalid timezone/)
  assert.deepEqual((await db.query('select * from public.event_visuals')).rows,visuals)
  assert.deepEqual((await db.query('select * from public.event_profile_mappings')).rows,mappings)
  await db.exec('reset role;')
  const settings=(await db.query("select proconfig from pg_proc where oid='public.commit_calendar_sync(jsonb)'::regprocedure")).rows[0].proconfig
  assert.ok(settings.includes('statement_timeout=30s'))
  for(const role of ['anon','authenticated']) {
   await db.exec(`reset role;set role ${role};`)
   await assert.rejects(commit(db,batch),/permission denied/)
  }
 } finally {await db.close()}
})
