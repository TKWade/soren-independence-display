import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import assert from 'node:assert/strict'

const userA='00000000-0000-4000-8000-000000000001'
const userB='00000000-0000-4000-8000-000000000002'
const migrations=['202609210001_foundation.sql','202609210002_sample_data.sql','202609230001_recurrence_images.sql','202609230002_external_calendars.sql','202609240001_google_calendar.sql','202609240002_profile_display_preferences.sql']
async function applyMigration(db,name,transform=sql=>sql) {
 let sql=await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')
 if(name==='202609240001_google_calendar.sql') {
  // PGlite cannot load Supabase Vault. This SQL test double tests access/lifecycle, NOT encryption.
  await db.exec(`create schema vault; create table vault.secrets(id uuid primary key default gen_random_uuid(),secret text);
   create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
   create function vault.create_secret(value text) returns uuid language sql as $$ insert into vault.secrets(secret) values(value) returning id $$;
   create function vault.update_secret(sid uuid,value text) returns void language sql as $$ update vault.secrets set secret=value where id=sid $$;`)
  sql=sql.replace('create extension if not exists supabase_vault with schema vault;','-- Vault extension replaced by explicit test double above.')
 }
 await db.exec(transform(sql))
}
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
 for(const name of (includeLatest?migrations:migrations.slice(0,2))) await applyMigration(db,name)
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
  for(const file of migrations.slice(2)) await applyMigration(db,file)
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


test('Google OAuth state is one-use, browser/user bound, expiring; Vault credentials and disconnect are protected',async()=>{
 const db=await database()
 try {
  await asUser(db,userA)
  const hid=(await db.query(`select public.create_household('Google test','UTC') id`)).rows[0].id
  await assert.rejects(db.query("select public.google_calendar_credentials('begin','{}')"),/permission denied/)
  await assert.rejects(db.query('select * from vault.decrypted_secrets'),/permission denied/)
  await db.exec('reset role; set role service_role;')
  const call=async(operation,payload)=>(await db.query('select public.google_calendar_credentials($1,$2) value',[operation,JSON.stringify(payload)])).rows[0].value
  const begin=()=>call('begin',{householdId:hid,userId:userA,ticketHash:'ticket',verifier:'verifier'})
  await assert.rejects(call('begin',{householdId:hid,userId:userB,ticketHash:'bad',verifier:'bad'}),/Not a member/)
  await begin()
  await assert.rejects(call('start',{ticketHash:'ticket',userId:userB,stateHash:'state',bindingHash:'cookie'}),/Invalid OAuth start/)
  assert.equal((await call('start',{ticketHash:'ticket',userId:userA,stateHash:'state',bindingHash:'cookie'})).verifier,'verifier')
  await assert.rejects(call('consume',{stateHash:'wrong',bindingHash:'cookie'}),/Invalid OAuth state/)
  await assert.rejects(call('consume',{stateHash:'state',bindingHash:'wrong'}),/Invalid OAuth state/)
  const pending=await call('consume',{stateHash:'state',bindingHash:'cookie'})
  await assert.rejects(call('consume',{stateHash:'state',bindingHash:'cookie'}),/Invalid OAuth state/)
  const finish={pendingId:pending.id,account:'parent@example.test',refreshToken:'private-refresh',calendars:[{externalCalendarId:'primary',name:'Family',timeZone:'UTC'}]}
  const {connectionId}=await call('finish',finish)
  await assert.rejects(call('finish',finish),/no rows/)
  const credential=await call('read',{connectionId});assert.equal(credential.refreshToken,'private-refresh')
  await asUser(db,userA)
  const publicConnection=(await db.query('select * from public.calendar_connections')).rows[0]
  assert.equal(publicConnection.label,'parent@example.test');assert.equal(JSON.stringify(publicConnection).includes('private-refresh'),false)
  const calendar=(await db.query('select * from public.external_calendars')).rows[0]
  await db.query("update public.external_calendars set enabled=true,behavior='evaluate' where id=$1",[calendar.id])
  await db.exec('reset role; set role service_role;')
  await begin();await call('start',{ticketHash:'ticket',userId:userA,stateHash:'state2',bindingHash:'cookie'})
  const inflight=await call('consume',{stateHash:'state2',bindingHash:'cookie'})
  assert.equal((await call('disconnect',{connectionId})).refreshToken,'private-refresh')
  await assert.rejects(call('finish',{...finish,pendingId:inflight.id}),/no rows/)
  await assert.rejects(call('rotate',{connectionId,secretId:credential.secretId,refreshToken:'resurrect'}),/Authorization required/)
  await assert.rejects(call('read',{connectionId}),/Authorization required/)
  assert.equal((await call('disconnect',{connectionId})).refreshToken,null)
  await db.exec('reset role;')
  assert.equal((await db.query('select count(*)::int n from vault.secrets')).rows[0].n,0)
  assert.equal((await db.query('select enabled from public.external_calendars')).rows[0].enabled,false)
  assert.equal((await db.query('select status from public.calendar_connections')).rows[0].status,'disabled')
  await begin();await db.query("update private.calendar_oauth_pending set expires_at=now()-interval '1 minute'")
  await assert.rejects(call('start',{ticketHash:'ticket',userId:userA,stateHash:'expired',bindingHash:'cookie'}),/Invalid OAuth start/)
 } finally {await db.close()}
})

test('Google migration only changes application ACLs and denies browser credential access',async()=>{
 const sql=await readFile(new URL('../supabase/migrations/202609240001_google_calendar.sql',import.meta.url),'utf8')
 const statements=sql.replace(/--[^\n]*/g,'').split(';').map(s=>s.trim())
 for(const statement of statements.filter(s=>/^(grant|revoke)\b/i.test(s))) {
  assert.doesNotMatch(statement,/\bvault\b/i,'Never change managed Vault ACLs')
  assert.match(statement,/\bon\s+(?:function\s+)?(?:public|private)\./i,'ACLs must target named application objects')
 }
 assert.doesNotMatch(sql.replace(/--[^\n]*/g,''),/\balter\s+(?:function|table|view|schema|extension)\s+(?:vault\b|supabase_vault\b)/i)
 const db=await database()
 try {
  const cleanupOid=(await db.query("select 'private.delete_calendar_vault_secret()'::regprocedure::oid id")).rows[0].id
  for(const role of ['anon','authenticated']) {
   await db.exec(`reset role; set role ${role};`)
   await assert.rejects(db.query("select public.google_calendar_credentials('read','{}')"),/permission denied/)
   for(const table of ['private.calendar_oauth_pending','private.calendar_connection_secrets','private.calendar_sync_state','vault.decrypted_secrets']) {
    await assert.rejects(db.query('select * from '+table),/permission denied/)
   }
   const permissions=(await db.query(`select has_function_privilege(current_user,'public.google_calendar_credentials(text,jsonb)','execute') credential,
    has_function_privilege(current_user,$1::oid,'execute') cleanup`,[cleanupOid])).rows[0]
   assert.deepEqual(permissions,{credential:false,cleanup:false})
  }
 } finally {await db.close()}
})

test('late Google migration failure rolls back DDL and function moves; corrected migration retries cleanly',async()=>{
 const db=await database(false)
 try {
  for(const name of migrations.slice(2,4)) await applyMigration(db,name)
  const original=(await db.query("select pg_get_functiondef('public.commit_calendar_sync(jsonb)'::regprocedure) definition")).rows[0].definition
  await assert.rejects(applyMigration(db,migrations[4],sql=>sql.replace(/commit;\s*$/i,()=>"do $$ begin raise exception 'simulated late migration failure'; end $$; commit;")),/simulated late migration failure/)
  await db.exec('rollback;')
  assert.equal((await db.query("select to_regclass('private.calendar_oauth_pending') pending")).rows[0].pending,null)
  assert.equal((await db.query("select to_regprocedure('public.google_calendar_credentials(text,jsonb)') rpc")).rows[0].rpc,null)
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and table_name='calendar_connections' and column_name='provider_account_id'")).rows[0].n,0)
  assert.equal((await db.query("select pg_get_functiondef('public.commit_calendar_sync(jsonb)'::regprocedure) definition")).rows[0].definition,original)
  // The test Vault was installed outside the migration transaction; reuse it for retry.
  const sql=await readFile(new URL('../supabase/migrations/'+migrations[4],import.meta.url),'utf8')
  await db.exec(sql.replace('create extension if not exists supabase_vault with schema vault;',''))
  assert.equal((await db.query("select to_regclass('private.calendar_oauth_pending') pending")).rows[0].pending,'private.calendar_oauth_pending')
 } finally {await db.close()}
})


test('display preferences backfill Week defaults, validate settings, save atomically and isolate households',async()=>{
 const db=await database(false)
 try {
  await asUser(db,userA)
  const hid=(await db.query("select public.create_household('Display A','UTC') id")).rows[0].id
  const pid=(await db.query("insert into public.profiles(household_id,name) values($1,'Soren') returning id",[hid])).rows[0].id
  await db.exec('reset role;')
  for(const name of migrations.slice(2)) await applyMigration(db,name)
  await asUser(db,userA)
  const preferences=(await db.query('select preferences from public.profile_display_preferences where profile_id=$1',[pid])).rows[0].preferences
  assert.equal(preferences.displayMode,'week');assert.equal(preferences.allowNavigation,true);assert.equal(preferences.showWho,true);assert.equal(preferences.showWhere,true)
  const next={...preferences,displayMode:'first-next-then',maxVisibleItems:3,allowNavigation:false,showWho:false,showWhere:false}
  const payload={id:pid,household_id:hid,name:'Soren',active:true,preferences:next}
  await db.query('select public.save_display_profile($1)',[JSON.stringify(payload)])
  assert.deepEqual((await db.query('select preferences from public.profile_display_preferences where profile_id=$1',[pid])).rows[0].preferences,next)
  for(const change of [{displayMode:'half-day'},{maxVisibleItems:0},{maxVisibleItems:2.5},{autoAdvance:'yes'},{showWho:null},{motionPreference:'flashing'},{version:2}]) {
   await assert.rejects(db.query('select public.save_display_profile($1)',[JSON.stringify({...payload,name:'Must roll back',preferences:{...next,...change}})]),/check constraint/)
  }
  assert.equal((await db.query('select name from public.profiles where id=$1',[pid])).rows[0].name,'Soren')
  await asUser(db,userB)
  assert.equal((await db.query('select * from public.profile_display_preferences')).rows.length,0)
  assert.equal((await db.query('update public.profile_display_preferences set preferences=$1 where profile_id=$2 returning id',[JSON.stringify(preferences),pid])).rows.length,0)
  await assert.rejects(db.query('select public.save_display_profile($1)',[JSON.stringify(payload)]),/Not authorized/)
  const other=(await db.query("select public.create_household('Display B','UTC') id")).rows[0].id
  await assert.rejects(db.query('insert into public.profile_display_preferences(household_id,profile_id) values($1,$2)',[other,pid]),/foreign key|unique/)
  const otherPid=(await db.query("insert into public.profiles(household_id,name) values($1,'Sibling') returning id",[other])).rows[0].id
  assert.equal((await db.query('select preferences from public.profile_display_preferences where profile_id=$1',[otherPid])).rows[0].preferences.displayMode,'week')
  await db.query('delete from public.profiles where id=$1',[otherPid])
  assert.equal((await db.query('select * from public.profile_display_preferences')).rows.length,0)
  await db.exec('reset role; set role anon;')
  await assert.rejects(db.query('select * from public.profile_display_preferences'),/permission denied/)
  await assert.rejects(db.query('select public.save_display_profile($1)',[JSON.stringify(payload)]),/permission denied/)
 } finally {await db.close()}
})
