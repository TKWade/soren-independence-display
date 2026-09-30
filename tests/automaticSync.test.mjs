import test from 'node:test'
import assert from 'node:assert/strict'
import {database,asUser,userA} from './fixtures/database.mjs'
import {scheduledSyncHandler} from '../server/calendar/scheduled.ts'
import {normalizeGoogleEvent} from '../server/calendar/normalization.ts'
import {runCalendarSync} from '../server/calendar/runSync.ts'
import {GoogleAuthorizationExpired} from '../server/calendar/google.ts'
const secret='dedicated-test-scheduler-secret-1234567890',taint='ACCESS_TOKEN REFRESH_TOKEN JWT PKCE_VERIFIER PRIVATE_EVENT_BODY'
test('scheduled/manual runner: initial/incremental, eligibility, isolation, expiry, fencing, diagnostics and Cron ACLs',async()=>{
 const db=await database(),logs=[],oldError=console.error,oldInfo=console.info
 console.error=(...args)=>logs.push(args);console.info=(...args)=>logs.push(args)
 try {
  await asUser(db,userA);const hid=(await db.query("select public.create_household('Sync','UTC') id")).rows[0].id
  await db.exec('reset role;set role service_role;')
  const addConnection=async()=> (await db.query("insert into public.calendar_connections(household_id,provider,label,status) values($1,'google','Test','connected') returning *",[hid])).rows[0]
  const addCalendar=async(conn,enabled=true,behavior='evaluate')=>(await db.query("insert into public.external_calendars(household_id,connection_id,external_calendar_id,name,time_zone,enabled,behavior) values($1,$2,gen_random_uuid()::text,'Test','UTC',$3,$4) returning *",[hid,conn.id,enabled,behavior])).rows[0]
  const connection=await addConnection(),cal=await addCalendar(connection),second=await addConnection(),other=await addCalendar(second)
  await addCalendar(second,false);await addCalendar(second,true,'ignore')
  const service={async rpc(name,args={}){try {const keys=Object.keys(args),values=keys.map(k=>typeof args[k]==='object'&&args[k]!==null?JSON.stringify(args[k]):args[k]);return {data:(await db.query(`select public.${name}(${keys.map((k,i)=>k+'=>$'+(i+1)).join(',')}) value`,values)).rows[0].value,error:null}}catch(error){return {data:null,error}}},storage:{from(){return {remove:async()=>({error:null})}}}}
  let initial=0,incremental=0,fail=false
  const adapter={provider:'google',async initialSync(calendar){initial++;return {changes:[normalizeGoogleEvent({id:'cached',summary:'Cached activity',start:{dateTime:new Date().toISOString()},end:{dateTime:new Date(Date.now()+3600000).toISOString()}},calendar,new Date().toISOString())],checkpoint:{token:'initial'}}},async incrementalSync(){incremental++;if(fail)throw new Error(taint);return {changes:[],checkpoint:{token:'incremental'}}}}
  const config={url:'https://project.supabase.co',anonKey:'',serviceRoleKey:'test-server',allowedOrigins:[],schedulerSecret:secret}
  const handler=scheduledSyncHandler(config,{google:async()=>adapter},service)
  const request=(key=secret,body='{}')=>new Request('https://edge.test',{method:'POST',headers:{'x-calendar-scheduler-secret':key},body})
  assert.equal((await handler(request('bad'))).status,401)
  assert.equal((await handler(request(secret,'{"calendarId":"arbitrary"}'))).status,400)
  const first=await (await handler(request())).json();assert.equal(first.processed,2);assert.equal(first.failed,0);assert.equal(initial,2)
  await handler(request());assert.equal(incremental,2)
  const checkpoint=async()=> (await service.rpc('read_calendar_sync_state',{cid:cal.id})).data
  const before=await checkpoint();fail=true
  await handler(request());assert.deepEqual(await checkpoint(),before);fail=false
  assert.equal(JSON.stringify(logs).includes(taint),false)
  // Concurrent scheduled/manual paths share the same persisted claim.
  let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r)
  const running=runCalendarSync(service,cal,connection,async()=>{entered();await gate;return adapter})
  await ready
  const skipped=await runCalendarSync(service,cal,connection,async()=>{throw new Error('Must not enter provider')})
  assert.equal(skipped.skipped,true);release();await running
  const revoked=scheduledSyncHandler(config,{google:async conn=>{if(conn.id===connection.id){await db.query("update public.calendar_connections set status='needs_authorization' where id=$1",[conn.id]);throw new GoogleAuthorizationExpired(taint)}return adapter}},service)
  const beforeRevocation=await checkpoint()
  const result=await (await revoked(request())).json();assert.equal(result.failed,1)
  assert.deepEqual(await checkpoint(),beforeRevocation)
  assert.equal((await db.query('select count(*)::int n from public.external_event_sources where calendar_id=$1',[cal.id])).rows[0].n,1)
  assert.equal(JSON.stringify(logs).includes(taint),false)
  assert.equal(JSON.stringify(result).includes(taint),false)
  const next=await (await revoked(request())).json();assert.equal(next.processed,1);assert.equal(next.failed,0)
  assert.equal((await db.query('select last_error_category from public.external_calendars where id=$1',[cal.id])).rows[0].last_error_category,'authorization_required')
  // A stale worker cannot commit after lease replacement or bypass an active lease.
  const token=(await service.rpc('claim_calendar_sync',{cid:other.id})).data
  const batch={calendar_id:other.id,expected_revision:2,window_start:'2026-09-01T00:00Z',window_end:'2026-12-01T00:00Z',changes:[],checkpoint:{},replace_window:false}
  assert.ok((await service.rpc('commit_calendar_sync',{payload:batch})).error)
  assert.ok((await service.rpc('commit_calendar_sync',{payload:{...batch,lease_token:'00000000-0000-4000-8000-000000000001'}})).error)
  await service.rpc('finish_calendar_sync',{cid:other.id,lease_token:token,error_category:'RAW SECRET '+taint})
  assert.equal((await db.query('select last_error_category from public.external_calendars where id=$1',[other.id])).rows[0].last_error_category,'unknown_sync_failure')
  await db.query('update public.external_calendars set enabled=false')
  assert.equal((await (await handler(request())).json()).processed,0)
  await asUser(db,userA)
  await assert.rejects(db.query('select public.claim_calendar_sync($1)',[other.id]),/permission denied/)
  await assert.rejects(db.query('select public.eligible_calendar_syncs()'),/permission denied/)
  await assert.rejects(db.query('select private.dispatch_calendar_sync()'),/permission denied/)
  await db.exec('reset role;')
  const job=(await db.query('select * from cron.job')).rows[0];assert.equal(job.jobname,'calendar-sync-15m');assert.equal(job.schedule,'*/15 * * * *');assert.doesNotMatch(job.command,/secret|Bearer/)
  await assert.rejects(db.query('select private.dispatch_calendar_sync()'),/Scheduler dispatch unavailable/)
 } finally {console.error=oldError;console.info=oldInfo;await db.close()}
})

test('authorization expiry retains the visible cache; disconnect and disabled calendars still hide it',async()=>{
 const {householdFixture}=await import('./fixtures/externalCalendars.mjs')
 const {availableExternalEvents}=await import('../src/calendar/relevance.ts')
 const data=householdFixture();data.integration.connections[0].status='needs_authorization'
 assert.equal(availableExternalEvents(data).length,1)
 data.integration.connections[0].status='disabled';assert.equal(availableExternalEvents(data).length,0)
 data.integration.connections[0].status='needs_authorization';data.integration.calendars[0].enabled=false
 assert.equal(availableExternalEvents(data).length,0)
})
