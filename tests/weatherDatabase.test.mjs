import test from 'node:test'
import assert from 'node:assert/strict'
import {database,applyMigration,migrations,asUser,userA,userB} from './fixtures/database.mjs'
test('weather migration: RLS, server-only writes, claims, location changes, failure retention and independent cron',async()=>{
 const db=await database()
 try{
  await asUser(db,userA);const hid=(await db.query("select public.create_household('Weather','America/Chicago') id")).rows[0].id
  await db.exec('reset role;set role service_role;')
  const settings={enabled:true,location:{label:'Salina',latitude:38.84,longitude:-97.61},temperature_unit:'fahrenheit'}
  const configure=()=>db.query('select public.configure_household_weather($1,$2)',[hid,settings])
  await configure()
  const claim=async()=>(await db.query('select * from public.claim_weather_refresh($1)',[hid])).rows
  const [first]=await claim();assert.ok(first.lease_id);assert.equal((await claim()).length,0)
  const finish=(row,result)=>db.query('select public.finish_weather_refresh($1,$2,$3,$4)',[hid,row.revision,row.lease_id,result])
  const forecast={fetchedAt:'2026-09-30T12:00:00Z',daily:[]}
  await finish(first,forecast)
  assert.deepEqual((await db.query('select forecast from public.household_weather')).rows[0].forecast,forecast)
  await db.exec("update public.household_weather set last_attempt_at=now()-interval '31 minutes'")
  const [second]=await claim();await finish(second,null)
  const failed=(await db.query('select * from public.household_weather')).rows[0];assert.equal(failed.refresh_failed,true);assert.deepEqual(failed.forecast,forecast)
  await db.exec("update public.household_weather set last_attempt_at=now()-interval '31 minutes'")
  const [old]=await claim();settings.location={label:'Chicago',latitude:41.88,longitude:-87.63};settings.temperature_unit='celsius';await configure();await finish(old,forecast)
  const changed=(await db.query('select * from public.household_weather')).rows[0];assert.equal(changed.forecast,null);assert.equal(changed.temperature_unit,'celsius');assert.equal(changed.last_success_at,null)
  settings.enabled=false;settings.location=null;await configure();assert.equal((await claim()).length,0)
  await asUser(db,userA);assert.equal((await db.query('select * from public.household_weather')).rows.length,1)
  await assert.rejects(configure(),/permission denied/);await assert.rejects(db.query('update public.household_weather set enabled=true'),/permission denied/)
  await assert.rejects(claim(),/permission denied/)
  await asUser(db,userB);assert.equal((await db.query('select * from public.household_weather')).rows.length,0)
  await db.exec('reset role;set role anon;');await assert.rejects(db.query('select * from public.household_weather'),/permission denied/)
  await db.exec('reset role;');const jobs=(await db.query('select jobname,schedule from cron.job order by jobname')).rows
  assert.deepEqual(jobs,[{jobname:'calendar-sync-15m',schedule:'*/15 * * * *'},{jobname:'weather-refresh-30m',schedule:'7,37 * * * *'}])
  assert.equal((await db.query('select count(*)::int n from public.calendar_events')).rows[0].n,0)
 }finally{await db.close()}
})


test('weather household grant permits only filtered id/time_zone reads as service_role and is idempotent',async()=>{
 const db=await database(false)
 const migration='202610010001_weather_household_read.sql'
 try {
  // Build the real pre-fix schema. No implicit service-role table SELECT is granted by this fixture.
  for(const name of migrations.slice(2,migrations.indexOf(migration)))await applyMigration(db,name)
  await asUser(db,userA)
  const hid=(await db.query("select public.create_household('Weather permission test','America/Chicago') id")).rows[0].id
  await db.exec('reset role;')
  const permissions=async()=>(await db.query(`
   select r.role_name,c.column_name,p.privilege,
    has_column_privilege(r.role_name,'public.households',c.column_name,p.privilege) allowed
   from (values ('anon'),('authenticated'),('service_role')) r(role_name)
   cross join information_schema.columns c
   cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
   where c.table_schema='public' and c.table_name='households'
   order by r.role_name,c.column_name,p.privilege`)).rows
  const before=await permissions()
  assert.equal((await db.query("select has_table_privilege('service_role','public.households','SELECT') allowed")).rows[0].allowed,false)
  assert.ok(before.filter(r=>r.role_name==='service_role').every(r=>!r.allowed))
  const policies=(await db.query("select * from pg_policies where schemaname='public' and tablename='households'")).rows
  await db.exec('set role service_role;')
  await assert.rejects(db.query('select time_zone from public.households where id=$1',[hid]),/permission denied/)
  await db.exec('reset role;')
  await applyMigration(db,migration)
  const after=await permissions()
  assert.deepEqual(after,before.map(r=>r.role_name==='service_role'&&r.privilege==='SELECT'&&['id','time_zone'].includes(r.column_name)?{...r,allowed:true}:r))
  assert.deepEqual((await db.query("select * from pg_policies where schemaname='public' and tablename='households'")).rows,policies)
  // Simulates an already-patched database: applying the recorded grant again is harmless.
  await applyMigration(db,migration)
  assert.deepEqual(await permissions(),after)
  for(const privilege of ['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']){
   assert.equal((await db.query("select has_table_privilege('service_role','public.households',$1) allowed",[privilege])).rows[0].allowed,false)
  }
  await db.exec('set role service_role;')
  assert.equal((await db.query('select current_user as role')).rows[0].role,'service_role')
  assert.deepEqual((await db.query('select time_zone from public.households where id=$1',[hid])).rows,[{time_zone:'America/Chicago'}])
  assert.deepEqual((await db.query('select id,time_zone from public.households where id=$1',[hid])).rows,[{id:hid,time_zone:'America/Chicago'}])
  await assert.rejects(db.query('select name from public.households where id=$1',[hid]),/permission denied/)
  await assert.rejects(db.query('select * from public.households where id=$1',[hid]),/permission denied/)
  await assert.rejects(db.query("update public.households set time_zone='UTC' where id=$1",[hid]),/permission denied/)
  await assert.rejects(db.query("insert into public.households(name,time_zone) values('Not allowed','UTC')"),/permission denied/)
  await assert.rejects(db.query('delete from public.households where id=$1',[hid]),/permission denied/)
  await db.exec('reset role;set role anon;')
  await assert.rejects(db.query('select id,time_zone from public.households where id=$1',[hid]),/permission denied/)
  await asUser(db,userB)
  assert.deepEqual((await db.query('select id,time_zone from public.households where id=$1',[hid])).rows,[])
 } finally {await db.close()}
})
