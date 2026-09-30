import test from 'node:test'
import assert from 'node:assert/strict'
import {database,asUser,userA,userB} from './fixtures/database.mjs'
test('safe deletion: usage blocking, archive, profiles, local vs external events, mappings, rules and private image queue',async()=>{
 const db=await database()
 try {
  await asUser(db,userA)
  const hid=(await db.query("select public.create_household('Delete test','UTC') id")).rows[0].id
  await db.query("select public.seed_sample_household($1,'2026-09-21')",[hid])
  const profile=(await db.query('select id from public.profiles limit 1')).rows[0].id
  const preview=async(entity,rid)=>(await db.query('select public.deletion_preview($1,$2,$3) p',[hid,entity,rid])).rows[0].p
  const remove=async(entity,rid)=>db.query('select public.delete_owned_record($1,$2,$3,$4)',[hid,entity,rid,(await preview(entity,rid)).name])
  for(const kind of ['people','places','activities']) {
   const referenced=(await db.query('select id from public.'+kind+' limit 1')).rows[0].id
   await db.query('update public.'+kind+' set active=false where id=$1',[referenced])
   assert.equal((await db.query('select active from public.'+kind+' where id=$1',[referenced])).rows[0].active,false)
   assert.equal((await preview(kind,referenced)).blocked,true)
   await assert.rejects(remove(kind,referenced),/Deletion blocked/)
   const id=(await db.query(`insert into public.${kind}(household_id,name,label,icon) values($1,'Unused','UNUSED','home') returning id`,[hid])).rows[0].id
   await remove(kind,id);assert.equal((await db.query(`select id from public.${kind} where id=$1`,[id])).rows.length,0)
  }
  assert.equal((await preview('profiles',profile)).blocked,true)
  const sibling=(await db.query("insert into public.profiles(household_id,name) values($1,'Sibling') returning id",[hid])).rows[0].id
  await db.exec('reset role;')
  const connection=(await db.query("insert into public.calendar_connections(household_id,provider,label,status) values($1,'google','Account','connected') returning id",[hid])).rows[0].id
  const calendar=(await db.query("insert into public.external_calendars(household_id,connection_id,external_calendar_id,name,time_zone) values($1,$2,'external','Calendar','UTC') returning id",[hid,connection])).rows[0].id
  await asUser(db,userA)
  const mapping=(await db.query("insert into public.event_profile_mappings(household_id,calendar_id,group_key,profile_id,action,target) values($1,$2,'series:school',$3,'ignore','ignore') returning id",[hid,calendar,profile])).rows[0].id
  const original=(await db.query('select * from public.event_visuals limit 1')).rows[0]
  await db.query('insert into public.event_visuals(household_id,event_id,profile_id,activity_id,place_id) values($1,$2,$3,$4,$5)',[hid,original.event_id,sibling,original.activity_id,original.place_id])
  await assert.rejects(db.query('select public.delete_owned_record($1,$2,$3,$4)',[hid,'profiles',profile,'wrong']),/Confirmation/)
  await db.query('update public.profiles set active=false where id=$1',[profile])
  assert.equal((await db.query('select active from public.profiles where id=$1',[profile])).rows[0].active,false)
  const count=(await db.query('select count(*)::int n from public.calendar_events')).rows[0].n
  await remove('profiles',profile)
  assert.equal((await db.query('select id from public.event_profile_mappings where id=$1',[mapping])).rows.length,0)
  assert.equal((await db.query('select count(*)::int n from public.calendar_events')).rows[0].n,count)
  assert.equal((await db.query('select id from public.event_visuals where profile_id=$1',[sibling])).rows.length,1)
  assert.equal((await db.query('select * from public.profile_home_preferences where profile_id=$1',[profile])).rows.length,0)
  assert.equal((await db.query('select * from public.home_rules where profile_id=$1',[profile])).rows.length,0)
  for(const recurring of [false,true]) {
   const id=(await db.query("insert into public.calendar_events(household_id,title,start_time,time_zone,source_kind) values($1,'Local','2026-09-23T08:00Z','UTC','local') returning id",[hid])).rows[0].id
   if(recurring) await db.query(`update public.calendar_events set end_time='2026-09-23T09:00Z',local_recurrence='{"version":1,"frequency":"daily","interval":1,"startDate":"2026-09-23","endDate":null}' where id=$1`,[id])
   await remove('calendar_events',id)
  }
  // Seed provider-owned cache as the database owner, not a browser role.
  await db.exec('reset role;')
  const eid=(await db.query("insert into public.calendar_events(household_id,title,start_time,time_zone,source_kind) values($1,'External','2026-09-23T08:00Z','UTC','external') returning id",[hid])).rows[0].id
  await asUser(db,userA);await assert.rejects(remove('calendar_events',eid),/Deletion blocked/)
  for(const date of [null,'2026-10-01']) {
   const id=(await db.query('insert into public.home_rules(household_id,profile_id,weekday,override_date,place_id) values($1,$2,$3,$4,$5) returning id',[hid,sibling,date?null:1,date,original.place_id])).rows[0].id
   await remove('home_rules',id)
  }
  const rule=(await db.query("insert into public.event_matching_rules(household_id,profile_id,name,title_operator,title_value,action) values($1,$2,'Ignore','contains','Test','ignore') returning id",[hid,sibling])).rows[0].id
  await remove('event_matching_rules',rule)
  for(const target of ['activity','home_sleep']) {
   const id=(await db.query("insert into public.event_profile_mappings(household_id,calendar_id,group_key,profile_id,action,target,activity_id,place_id,sleep_place_id,bedtime_mode) values($1,$2,'event:one',$3,'include',$4,$5,$6,$7,$8) returning id",[hid,calendar,sibling,target,target==='activity'?original.activity_id:null,target==='activity'?original.place_id:null,target==='home_sleep'?original.place_id:null,target==='home_sleep'?'use_normal_bedtime':null])).rows[0].id
   await remove('event_profile_mappings',id)
   assert.equal((await db.query('select id from public.calendar_events where id=$1',[eid])).rows.length,1)
  }
  // Shared images survive until the final referencing item is deleted.
  const path=hid+'/images/shared/display.png'
  const imageIds=[]
  for(let i=0;i<2;i++)imageIds.push((await db.query("insert into public.people(household_id,name,label,icon,image_path,source_image_path) values($1,'Image','IMAGE','dad',$2,$2) returning id",[hid,path])).rows[0].id)
  await remove('people',imageIds[0]);await db.exec('reset role;set role service_role;')
  assert.deepEqual((await db.query('select public.claim_image_cleanup($1) paths',[hid])).rows[0].paths,[])
  await asUser(db,userA);await remove('people',imageIds[1]);await db.exec('reset role;set role service_role;')
  assert.deepEqual((await db.query('select public.claim_image_cleanup($1) paths',[hid])).rows[0].paths,[path])
  await asUser(db,userA)
  await assert.rejects(db.query("insert into public.people(household_id,name,label,icon,image_path) values($1,'Reuse','REUSE','dad',$2)",[hid,path]),/Image no longer available/)
  await assert.rejects(db.query('select public.claim_image_cleanup($1)',[hid]),/permission denied/)
  await asUser(db,userB);await assert.rejects(preview('profiles',sibling),/Not authorized/)
  await assert.rejects(db.query('select public.delete_owned_record($1,$2,$3,$4)',[hid,'profiles',sibling,'Sibling']),/Not authorized/)
 } finally {await db.close()}
})
