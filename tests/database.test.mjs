import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'

const userA='00000000-0000-4000-8000-000000000001'
const userB='00000000-0000-4000-8000-000000000002'
const migrations=['202609210001_foundation.sql','202609210002_sample_data.sql','202609230001_recurrence_images.sql','202609230002_external_calendars.sql']
async function database(includeLatest=true) {
 const db=new PGlite()
 await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
  create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select,insert,update,delete on storage.objects to authenticated;
  insert into auth.users values('${userA}'),('${userB}');
 `)
 for(const name of (includeLatest?migrations:migrations.slice(0,2))) await db.exec(await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8'))
 return db
}
async function asUser(db,id) { await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${id}';`) }

test('migrations, atomic seed, household RLS, cross-household references and private storage', async()=>{
 const db=await database()
 try {
  await asUser(db,userA)
  const a=(await db.query(`select public.create_household('Household A','America/Chicago') id`)).rows[0].id
  await db.query(`select public.seed_sample_household($1,'2026-09-21')`,[a])
  assert.equal((await db.query('select count(*)::int n from public.profiles')).rows[0].n,1)
  assert.equal((await db.query('select count(*)::int n from public.calendar_events')).rows[0].n,27)
  assert.equal((await db.query('select count(*)::int n from public.home_rules')).rows[0].n,7)
  await assert.rejects(db.query(`select public.seed_sample_household($1,'2026-09-21')`,[a]),/empty household/)
  const profileA=(await db.query('select id from public.profiles')).rows[0].id
  const placeA=(await db.query('select id from public.places limit 1')).rows[0].id
  const eventA=(await db.query('select * from public.calendar_events limit 1')).rows[0]
  const activityA=(await db.query('select id from public.activities limit 1')).rows[0].id
  const invalidUpdate={id:eventA.id,household_id:a,title:'Must roll back',start_time:eventA.start_time,end_time:eventA.end_time,time_zone:'America/Chicago',
   activity_id:activityA,place_id:placeA,profile_ids:['00000000-0000-4000-8000-000000000099'],person_ids:[]}
  await assert.rejects(db.query('select public.save_local_event($1)',[JSON.stringify(invalidUpdate)]),/foreign key/)
  assert.equal((await db.query('select title from public.calendar_events where id=$1',[eventA.id])).rows[0].title,eventA.title)
  await db.query(`insert into storage.objects(bucket_id,name) values('household-images',$1)`,[a+'/photo.png'])
  await assert.rejects(db.query(`insert into public.home_rules(household_id,profile_id,place_id) values($1,$2,$3)`,[a,profileA,placeA]),/check constraint/)
  await asUser(db,userB)
  assert.equal((await db.query('select * from public.households')).rows.length,0)
  assert.equal((await db.query('select * from public.calendar_events')).rows.length,0)
  assert.equal((await db.query("update public.calendar_events set title='Intruder' where id=$1 returning id",[eventA.id])).rows.length,0)
  assert.equal((await db.query('delete from public.calendar_events where id=$1 returning id',[eventA.id])).rows.length,0)
  assert.equal((await db.query('select * from storage.objects')).rows.length,0)
  await assert.rejects(db.query(`insert into public.profiles(household_id,name) values($1,'Intruder')`,[a]),/row-level security/)
  await assert.rejects(db.query(`insert into public.household_members(household_id,user_id) values($1,$2)`,[a,userB]),/permission denied/)
  await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values('household-images',$1)`,[a+'/intruder.png']),/row-level security/)
  const b=(await db.query(`select public.create_household('Household B','UTC') id`)).rows[0].id
  const profileB=(await db.query(`insert into public.profiles(household_id,name) values($1,'Child B') returning id`,[b])).rows[0].id
  await assert.rejects(db.query(`insert into public.home_rules(household_id,profile_id,weekday,place_id) values($1,$2,1,$3)`,[b,profileB,placeA]),/foreign key/)
  assert.equal((await db.query('select * from public.profiles')).rows.length,1)
  await db.exec('reset role; set role anon;')
  await assert.rejects(db.query('select * from public.people'),/permission denied/)
  await assert.rejects(db.query(`select public.create_household('Anonymous','UTC')`),/permission denied/)
 } finally { await db.close() }
})


test('new migration saves a single series atomically, validates recurrence and isolates image metadata',async()=>{
 const db=await database(false)
 try {
  await asUser(db,userA)
  const hid=(await db.query(`select public.create_household('Recurring household','America/Chicago') id`)).rows[0].id
  await db.query(`select public.seed_sample_household($1,'2026-09-21')`,[hid])
  await db.exec('reset role;')
  await db.exec(await readFile(new URL('../supabase/migrations/202609230001_recurrence_images.sql',import.meta.url),'utf8'))
  await asUser(db,userA)
  const profile=(await db.query('select id from public.profiles')).rows[0].id
  const activity=(await db.query('select id from public.activities limit 1')).rows[0].id
  const place=(await db.query('select id from public.places limit 1')).rows[0].id
  const rule={version:1,frequency:'weekly',interval:3,startDate:'2026-09-10',endDate:'2026-12-17',weekdays:[4]}
  const payload={household_id:hid,title:'Therapy series',start_time:'2026-09-10T13:00:00Z',end_time:'2026-09-10T14:00:00Z',time_zone:'America/Chicago',
   activity_id:activity,place_id:place,profile_ids:[profile],person_ids:[],local_recurrence:rule}
  const id=(await db.query('select public.save_local_event($1) id',[JSON.stringify(payload)])).rows[0].id
  assert.equal((await db.query('select count(*)::int n from public.calendar_events')).rows[0].n,28)
  assert.deepEqual((await db.query('select local_recurrence from public.calendar_events where id=$1',[id])).rows[0].local_recurrence,rule)
  for(const invalid of [null,{}, {...rule,interval:0},{...rule,weekdays:[]},{...rule,weekdays:[4,4]},{...rule,startDate:'2026-09-11'},{...rule,endDate:'2026-09-09'},{...rule,endDate:'2026-02-30'},{...rule,frequency:'monthly',dayOfMonth:32}]) {
   if(invalid===null) continue
   await assert.rejects(db.query('select public.save_local_event($1)',[JSON.stringify({...payload,id,title:'Invalid replacement',local_recurrence:invalid})]),/check constraint/)
  }
  await assert.rejects(db.query('select public.save_local_event($1)',[JSON.stringify({...payload,id,end_time:null})]),/check constraint/)
  assert.equal((await db.query('select title from public.calendar_events where id=$1',[id])).rows[0].title,'Therapy series')
  // Older callers cannot accidentally remove a rule by omitting the new field.
  const legacy={...payload,id};delete legacy.local_recurrence
  await db.query('select public.save_local_event($1)',[JSON.stringify(legacy)])
  assert.deepEqual((await db.query('select local_recurrence from public.calendar_events where id=$1',[id])).rows[0].local_recurrence,rule)
  await db.query('select public.save_local_event($1)',[JSON.stringify({...payload,id,local_recurrence:null})])
  assert.equal((await db.query('select local_recurrence from public.calendar_events where id=$1',[id])).rows[0].local_recurrence,null)
  const crop={version:1,preset:'places',x:.2,y:.8,zoom:1.5}
  await db.query('update public.places set source_image_path=$1,image_presentation=$2 where id=$3',[hid+'/images/example/original.jpg',JSON.stringify(crop),place])
  for(const bad of [{...crop,preset:'people'},{...crop,preset:null},{...crop,zoom:4},{...crop,x:-1},{...crop,y:'0.5'},{}]) await assert.rejects(db.query('update public.places set image_presentation=$1 where id=$2',[JSON.stringify(bad),place]),/check constraint/)
  await assert.rejects(db.query('update public.places set source_image_path=$1 where id=$2',[userB+'/images/private/original.jpg',place]),/check constraint/)
  await asUser(db,userB)
  assert.equal((await db.query('select source_image_path,image_presentation from public.places')).rows.length,0)
  assert.equal((await db.query('update public.calendar_events set local_recurrence=null where id=$1 returning id',[id])).rows.length,0)
 } finally {await db.close()}
})


test('external calendar upgrade, atomic sync, protected cursors, profile mappings and household isolation',async()=>{
 const db=await database(false)
 try {
  await asUser(db,userA)
  const hid=(await db.query(`select public.create_household('External test','America/Chicago') id`)).rows[0].id
  await db.query(`select public.seed_sample_household($1,'2026-09-21')`,[hid])
  const profile=(await db.query('select id from public.profiles')).rows[0].id
  const sibling=(await db.query(`insert into public.profiles(household_id,name) values($1,'Sibling') returning id`,[hid])).rows[0].id
  const activity=(await db.query('select id from public.activities limit 1')).rows[0].id
  const place=(await db.query('select id from public.places limit 1')).rows[0].id
  await db.exec('reset role;')
  for(const file of migrations.slice(2)) await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'))
  await db.exec('set role service_role;')
  const conn=(await db.query(`insert into public.calendar_connections(household_id,provider,label,status) values($1,'google','Account','connected') returning id`,[hid])).rows[0].id
  await db.query('select public.cache_provider_calendars($1,$2)',[conn,JSON.stringify([{externalCalendarId:'family',name:'Family',timeZone:'America/Chicago'}])])
  const cal=(await db.query('select * from public.external_calendars')).rows[0]
  assert.equal(cal.enabled,false);assert.equal(cal.behavior,'ignore')
  await asUser(db,userA)
  await assert.rejects(db.query('select public.read_calendar_sync_state($1)',[cal.id]),/permission denied/)
  await assert.rejects(db.query('select * from private.calendar_connection_secrets'),/permission denied/)
  await assert.rejects(db.query('select * from private.calendar_sync_state'),/permission denied/)
  await assert.rejects(db.query(`insert into public.calendar_connections(household_id,provider,label) values($1,'google','Fake')`,[hid]),/permission denied/)
  await assert.rejects(db.query(`update public.external_calendars set external_calendar_id='other' where id=$1`,[cal.id]),/permission denied/)
  await db.query(`update public.external_calendars set enabled=true,behavior='evaluate' where id=$1`,[cal.id])
  const identity={provider:'google',connectionId:conn,calendarId:cal.id,externalCalendarId:'family',externalEventId:'speech-1'}
  const event={...identity,externalSeriesId:'series',originalStart:'2026-09-23T14:00:00Z',title:'Speech',description:'Original',start:'2026-09-23T14:00:00Z',end:'2026-09-23T15:00:00Z',allDay:false,timeZone:'America/Chicago',locationText:'Provider clinic',recurrence:null,kind:'occurrence',status:'confirmed',lastModified:'2026-09-20T00:00:00Z',lastSyncedAt:'2026-09-23T12:00:00Z'}
  const batch={calendar_id:cal.id,expected_revision:0,window_start:'2026-09-01T00:00:00Z',window_end:'2026-12-01T00:00:00Z',replace_window:true,checkpoint:{secretCursor:'not-for-browser'},changes:[{type:'upsert',event}]}
  await assert.rejects(db.query('select public.commit_calendar_sync($1)',[JSON.stringify(batch)]),/permission denied/)
  await db.exec('reset role; set role service_role;')
  await db.query('select public.commit_calendar_sync($1)',[JSON.stringify(batch)])
  const cached=(await db.query(`select * from public.calendar_events where source_kind='external'`)).rows[0]
  const state=(await db.query('select public.read_calendar_sync_state($1) state',[cal.id])).rows[0].state
  assert.equal(state.revision,1);assert.equal(state.cursor.secretCursor,'not-for-browser')
  assert.equal((await db.query('select count(*)::int n from public.calendar_events')).rows[0].n,28)
  await assert.rejects(db.query('select public.commit_calendar_sync($1)',[JSON.stringify(batch)]),/revision conflict/)
  // Discovery refresh preserves selection; newly discovered calendars stay disabled.
  await db.query('select public.cache_provider_calendars($1,$2)',[conn,JSON.stringify([{externalCalendarId:'family',name:'Family renamed',timeZone:'America/Chicago'},{externalCalendarId:'work',name:'Work',timeZone:'UTC'}])])
  assert.equal((await db.query('select enabled from public.external_calendars where id=$1',[cal.id])).rows[0].enabled,true)
  await asUser(db,userA)
  const mapping={household_id:hid,calendar_id:cal.id,group_key:'series:series',profile_ids:[profile,sibling],action:'include',activity_id:activity,place_id:place,label:'SPEECH',visible:true,create_rule:true,rule_title:'speech'}
  await db.query('select public.save_external_mapping($1)',[JSON.stringify(mapping)])
  assert.equal((await db.query('select * from public.event_profile_mappings')).rows.length,2)
  assert.equal((await db.query('select * from public.event_matching_rules')).rows.length,2)
  await db.query('select public.save_external_mapping($1)',[JSON.stringify({...mapping,profile_ids:[sibling],action:'ignore',create_rule:false})])
  const saved=(await db.query('select id,label from public.event_profile_mappings where profile_id=$1',[profile])).rows[0]
  assert.equal((await db.query('select action from public.event_profile_mappings where profile_id=$1',[sibling])).rows[0].action,'ignore')
  await assert.rejects(db.query('select public.save_external_mapping($1)',[JSON.stringify({...mapping,profile_ids:[profile],label:'BAD',create_rule:true,rule_title:''})]),/check constraint/)
  assert.equal((await db.query('select label from public.event_profile_mappings where profile_id=$1',[profile])).rows[0].label,'SPEECH')
  assert.equal((await db.query(`update public.calendar_events set title='browser write' where id=$1 returning id`,[cached.id])).rows.length,0)
  await db.exec('reset role; set role service_role;')
  const update={...batch,expected_revision:1,replace_window:false,checkpoint:{secretCursor:'next'},changes:[{type:'upsert',event:{...event,title:'Updated speech',locationText:'New provider place',lastModified:'2026-09-24T00:00:00Z'}}]}
  await db.query('select public.commit_calendar_sync($1)',[JSON.stringify(update)])
  // Failed batches roll back both earlier event writes and the cursor.
  await assert.rejects(db.query('select public.commit_calendar_sync($1)',[JSON.stringify({...update,expected_revision:2,changes:[{type:'upsert',event:{...event,title:'Must roll back'}},{type:'upsert',event:{...event,calendarId:userB}}]})]),/identity mismatch/)
  assert.equal((await db.query('select title from public.calendar_events where id=$1',[cached.id])).rows[0].title,'Updated speech')
  assert.equal((await db.query('select public.read_calendar_sync_state($1) state',[cal.id])).rows[0].state.revision,2)
  await asUser(db,userA)
  assert.deepEqual((await db.query('select id,label from public.event_profile_mappings where profile_id=$1',[profile])).rows[0],saved)
  await asUser(db,userB)
  for(const table of ['calendar_connections','external_calendars','event_profile_mappings']) assert.equal((await db.query('select * from public.'+table)).rows.length,0)
  await assert.rejects(db.query('select public.save_external_mapping($1)',[JSON.stringify(mapping)]),/Not authorized/)
  const otherHid=(await db.query(`select public.create_household('Other','UTC') id`)).rows[0].id
  const otherProfile=(await db.query(`insert into public.profiles(household_id,name) values($1,'Other') returning id`,[otherHid])).rows[0].id
  await asUser(db,userA)
  await assert.rejects(db.query('select public.save_external_mapping($1)',[JSON.stringify({...mapping,profile_ids:[otherProfile]})]),/foreign key/)
  await db.exec('reset role; set role service_role;')
  // A master cancellation also hides its cached occurrences without deleting visual decisions.
  await db.query('select public.commit_calendar_sync($1)',[JSON.stringify({...batch,expected_revision:2,replace_window:false,changes:[{type:'cancel',identity:{...identity,externalEventId:'series'},lastSyncedAt:event.lastSyncedAt}]})])
  assert.equal((await db.query('select external_status from public.calendar_events where id=$1',[cached.id])).rows[0].external_status,'cancelled')
  await asUser(db,userA)
  assert.equal((await db.query('select * from public.event_profile_mappings')).rows.length,2)
  assert.equal((await db.query('select count(*)::int n from public.home_rules')).rows[0].n,7)
  await db.exec('reset role; set role service_role;')
  const secondConnection=(await db.query(`insert into public.calendar_connections(household_id,provider,label,status) values($1,'google','Second account','connected') returning id`,[hid])).rows[0].id
  const secondCalendar=(await db.query(`insert into public.external_calendars(household_id,connection_id,external_calendar_id,name,time_zone,enabled,behavior) values($1,$2,'family','Family','UTC',true,'evaluate') returning id`,[hid,secondConnection])).rows[0].id
  await db.query('select public.commit_calendar_sync($1)',[JSON.stringify({...batch,calendar_id:secondCalendar,changes:[{type:'upsert',event:{...event,connectionId:secondConnection,calendarId:secondCalendar}}]})])
  assert.equal((await db.query(`select * from public.external_event_sources where external_event_id='speech-1'`)).rows.length,2)
  // A completed replacement snapshot removes absent events only after all pages succeeded.
  await db.query('select public.commit_calendar_sync($1)',[JSON.stringify({...batch,calendar_id:secondCalendar,expected_revision:1,changes:[]})])
  assert.equal((await db.query(`select e.external_status from public.calendar_events e join public.external_event_sources s on s.event_id=e.id where s.calendar_id=$1`,[secondCalendar])).rows[0].external_status,'cancelled')
 } finally {await db.close()}
})
