import test from 'node:test'
import assert from 'node:assert/strict'
import {database,applyMigration,migrations,asUser,userA,userB} from './fixtures/database.mjs'
test('profile home migration preserves rules, defaults Local, backfills explicit dates and enforces household isolation',async()=>{
 const db=await database(false)
 try {
  await asUser(db,userA)
  const hid=(await db.query("select public.create_household('Home modes','UTC') id")).rows[0].id
  await db.query("select public.seed_sample_household($1,'2026-09-21')",[hid])
  const profile=(await db.query('select id from public.profiles limit 1')).rows[0].id
  const place=(await db.query('select id from public.places limit 1')).rows[0].id
  await db.query("insert into public.home_rules(household_id,profile_id,override_date,place_id,bedtime) values($1,$2,'2026-09-23',$3,'18:45')",[hid,profile,place])
  const before=(await db.query('select id,bedtime,weekday,override_date,place_id from public.home_rules order by id')).rows
  await db.exec('reset role;')
  for(const name of migrations.slice(2,migrations.indexOf('202609290003_profile_home_preferences.sql'))) await applyMigration(db,name)
  const conn=(await db.query("insert into public.calendar_connections(household_id,provider,label,status) values($1,'google','Test','connected') returning id",[hid])).rows[0].id
  const cal=(await db.query("insert into public.external_calendars(household_id,connection_id,external_calendar_id,name,time_zone,enabled,behavior) values($1,$2,'family','Family','UTC',true,'evaluate') returning id",[hid,conn])).rows[0].id
  await db.query("insert into public.event_profile_mappings(household_id,profile_id,calendar_id,group_key,target,action,sleep_place_id,bedtime_mode) values($1,$2,$3,'series:overnights','home_sleep','include',$4,'use_normal_bedtime')",[hid,profile,cal,place])
  await applyMigration(db,'202609290003_profile_home_preferences.sql')
  await asUser(db,userA)
  const pref=(await db.query('select * from public.profile_home_preferences')).rows[0]
  assert.equal(pref.overnight_mode,'local');assert.equal(pref.default_bedtime,null);assert.deepEqual(pref.weekday_bedtimes,{})
  assert.deepEqual((await db.query('select id,bedtime,weekday,override_date,place_id from public.home_rules order by id')).rows,before)
  assert.equal((await db.query('select bedtime_override from public.home_rules where override_date is not null')).rows[0].bedtime_override,'18:45:00')
  await db.query("update public.profile_home_preferences set default_bedtime='20:00',weekday_bedtimes='{\"0\":\"21:00\",\"6\":\"21:15\"}' where profile_id=$1",[profile])
  for(const mode of ['calendar_driven','calendar_with_local_fallback','local']) await db.query('update public.profile_home_preferences set overnight_mode=$1 where profile_id=$2',[mode,profile])
  assert.equal((await db.query('select count(*)::int n from public.home_rules')).rows[0].n,8)
  assert.equal((await db.query('select count(*)::int n from public.event_profile_mappings')).rows[0].n,1)
  for(const value of ['[]','{"7":"20:00"}','{"1":"24:00"}','{"1":null}','{"1":2030}']) await assert.rejects(db.query('update public.profile_home_preferences set weekday_bedtimes=$1::jsonb',[value]),/check constraint/)
  await assert.rejects(db.query("update public.profile_home_preferences set overnight_mode='google'"),/check constraint/)
  await assert.rejects(db.query("update public.profile_home_preferences set default_bedtime='24:00'"),/check constraint/)
  const second=(await db.query("insert into public.profiles(household_id,name) values($1,'Local child') returning id",[hid])).rows[0].id
  assert.equal((await db.query('select overnight_mode from public.profile_home_preferences where profile_id=$1',[second])).rows[0].overnight_mode,'local')
  await db.query("insert into public.home_rules(household_id,profile_id,weekday,place_id) values($1,$2,1,$3)",[hid,second,place])
  assert.equal((await db.query('select bedtime from public.home_rules where profile_id=$1',[second])).rows[0].bedtime,null)
  await asUser(db,userB)
  assert.equal((await db.query('select * from public.profile_home_preferences')).rows.length,0)
  assert.equal((await db.query("update public.profile_home_preferences set overnight_mode='calendar_driven' returning profile_id")).rows.length,0)
  const other=(await db.query("select public.create_household('Other','UTC') id")).rows[0].id
  await assert.rejects(db.query('insert into public.profile_home_preferences(household_id,profile_id) values($1,$2)',[other,profile]),/foreign key|duplicate key/)
  await db.exec('reset role;set role anon;')
  await assert.rejects(db.query('select * from public.profile_home_preferences'),/permission denied/)
 } finally {await db.close()}
})
