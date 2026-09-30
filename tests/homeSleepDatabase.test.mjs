import test from 'node:test'
import assert from 'node:assert/strict'
import { database, asUser, userA, userB } from './fixtures/database.mjs'
test('Home sleep mappings persist atomically with typed effects, household FKs and existing RLS',async()=>{
 const db=await database()
 try {
  await asUser(db,userA)
  const hid=(await db.query("select public.create_household('Home test','America/Chicago') id")).rows[0].id
  await db.query("select public.seed_sample_household($1,'2026-09-21')",[hid])
  const profile=(await db.query('select id from public.profiles where household_id=$1',[hid])).rows[0].id
  const sibling=(await db.query("insert into public.profiles(household_id,name) values($1,'Second child') returning id",[hid])).rows[0].id
  const place=(await db.query('select id from public.places where household_id=$1 limit 1',[hid])).rows[0].id
  const person=(await db.query('select id from public.people where household_id=$1 limit 1',[hid])).rows[0].id
  const activity=(await db.query('select id from public.activities where household_id=$1 limit 1',[hid])).rows[0].id
  const before=(await db.query('select * from public.home_rules order by id')).rows
  await db.exec('reset role; set role service_role;')
  const conn=(await db.query("insert into public.calendar_connections(household_id,provider,label,status) values($1,'google','Test','connected') returning id",[hid])).rows[0].id
  const cal=(await db.query("insert into public.external_calendars(household_id,connection_id,external_calendar_id,name,time_zone,enabled,behavior) values($1,$2,'family','Family','America/Chicago',true,'evaluate') returning id",[hid,conn])).rows[0].id
  const event={provider:'google',connectionId:conn,calendarId:cal,externalCalendarId:'family',externalEventId:'overnight',externalSeriesId:'custody',originalStart:'2026-09-23',title:'Overnight',description:'',start:'2026-09-23',end:'2026-09-24',allDay:true,timeZone:'America/Chicago',locationText:'',recurrence:null,kind:'occurrence',status:'confirmed'}
  await db.query('select public.commit_calendar_sync($1)',[JSON.stringify({calendar_id:cal,expected_revision:0,window_start:'2026-09-01T00:00:00Z',window_end:'2026-12-01T00:00:00Z',replace_window:true,checkpoint:{token:'one'},changes:[{type:'upsert',event}]})])
  await asUser(db,userA)
  const payload={household_id:hid,calendar_id:cal,group_key:'series:custody',profile_ids:[profile,sibling],target:'home_sleep',sleep_place_id:place,sleep_caregiver_id:person,bedtime_mode:'use_normal_bedtime'}
  const save=p=>db.query('select public.save_external_mapping($1)',[JSON.stringify(p)])
  await save(payload)
  let rows=(await db.query('select * from public.event_profile_mappings order by profile_id')).rows
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.target==='home_sleep'&&r.activity_id===null&&r.place_id===null&&r.sleep_place_id===place&&r.bedtime_override===null))
  assert.deepEqual((await db.query('select * from public.home_rules order by id')).rows,before)
  await save({...payload,profile_ids:[profile],group_key:'event:overnight',bedtime_mode:'explicit',bedtime_override:'20:15'})
  assert.equal((await db.query("select bedtime_override from public.event_profile_mappings where group_key='event:overnight'")).rows[0].bedtime_override,'20:15:00')
  for(const bad of [{sleep_place_id:null},{bedtime_mode:'explicit'},{bedtime_mode:'use_normal_bedtime',bedtime_override:'21:00'},{bedtime_mode:'invalid'},{bedtime_mode:'explicit',bedtime_override:'24:00'},{create_rule:true,rule_title:'Overnight'}]) await assert.rejects(save({...payload,...bad}))
  await db.query('update public.profiles set active=false where id=$1',[sibling])
  await assert.rejects(save({...payload,bedtime_mode:'explicit',bedtime_override:'22:00'}),/active household profile/)
  assert.equal((await db.query("select bedtime_mode from public.event_profile_mappings where group_key='series:custody' and profile_id=$1",[profile])).rows[0].bedtime_mode,'use_normal_bedtime')
  await db.query('update public.profiles set active=true where id=$1',[sibling])
  await asUser(db,userB)
  assert.equal((await db.query('select * from public.event_profile_mappings')).rows.length,0)
  await assert.rejects(save(payload),/Not authorized/)
  const other=(await db.query("select public.create_household('Other','UTC') id")).rows[0].id
  await db.query("select public.seed_sample_household($1,'2026-09-21')",[other])
  const otherPlace=(await db.query('select id from public.places limit 1')).rows[0].id
  const otherPerson=(await db.query('select id from public.people limit 1')).rows[0].id
  await asUser(db,userA)
  await assert.rejects(save({...payload,sleep_place_id:otherPlace}),/foreign key/)
  await assert.rejects(save({...payload,sleep_caregiver_id:otherPerson}),/foreign key/)
  await save({...payload,target:'activity',action:'include',activity_id:activity,place_id:place})
  rows=(await db.query("select * from public.event_profile_mappings where group_key='series:custody'")).rows
  assert.ok(rows.every(r=>r.activity_id===activity&&r.sleep_place_id===null&&r.bedtime_mode===null))
  await save({...payload,target:'ignore',action:'ignore'})
  assert.ok((await db.query("select * from public.event_profile_mappings where group_key='series:custody'")).rows.every(r=>r.target==='ignore'&&r.sleep_place_id===null))
  await db.exec('reset role; set role anon;')
  await assert.rejects(save(payload),/permission denied/)
  await assert.rejects(db.query('select * from public.event_profile_mappings'),/permission denied/)
 } finally {await db.close()}
})
