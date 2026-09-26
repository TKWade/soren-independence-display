import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarActionHandler } from '../server/calendar/actions.ts'
import { syncDiagnostic } from '../server/calendar/diagnostics.ts'
const calendarId='00000000-0000-4000-8000-000000000001',connectionId='00000000-0000-4000-8000-000000000002'
const calendar={id:calendarId,connection_id:connectionId,external_calendar_id:'private-calendar',time_zone:'UTC',enabled:true,behavior:'evaluate'}
const taint='ACCESS_TOKEN REFRESH_TOKEN AUTHORIZATION_CODE OAUTH_STATE PKCE_VERIFIER CLIENT_SECRET Bearer JWT PRIVATE_DESCRIPTION ATTENDEES PRIVATE_EVENT_BODY'
const config={url:'https://project.supabase.co',anonKey:'public',serviceRoleKey:'server-only',allowedOrigins:['http://localhost:5173'],google:{clientId:'client',clientSecret:'CLIENT_SECRET',redirectUri:'https://project.supabase.co/functions/v1/google-oauth/callback',returnUrl:'http://localhost:5173/admin'}}
const poison=()=>Object.assign(new Error(taint),{name:taint,details:taint,hint:taint,code:taint,cause:{body:taint}})
for(const stage of ['google_token_refresh','sync_state_read','google_delta_fetch','google_snapshot_fetch','event_normalization','database_commit','unknown_sync_failure']) {
 test(`sync ${stage} reports only allowlisted diagnostics across logs, response and stored error`,async()=>{
  const originalFetch=globalThis.fetch,originalLogs=Object.fromEntries(['error','warn','log','info','debug'].map(k=>[k,console[k]])),logs=[],stored=[]
  for(const method of Object.keys(originalLogs))console[method]=(...args)=>logs.push(args)
  globalThis.fetch=async(input,options={})=>{
   const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url),method=options.method??'GET'
   if(url.pathname==='/auth/v1/user')return Response.json({id:'caregiver'})
   if(url.pathname.endsWith('/household_members'))return Response.json({id:'member'})
   if(url.pathname.endsWith('/calendar_connections'))return Response.json({id:connectionId,provider:'google',status:'connected'})
   if(url.pathname.endsWith('/external_calendars')) {
    if(method==='PATCH'){stored.push(JSON.parse(options.body));return new Response(null,{status:204})}
    return Response.json(calendar)
   }
   if(url.pathname.endsWith('/google_calendar_credentials'))return Response.json({refreshToken:'REFRESH_TOKEN',secretId:'generation'})
   if(url.pathname==='/token') {
    if(stage==='google_token_refresh')return Response.json({error:taint,error_description:taint},{status:403})
    return Response.json({access_token:'ACCESS_TOKEN',token_type:'Bearer'})
   }
   if(url.pathname.endsWith('/read_calendar_sync_state')) {
    if(stage==='sync_state_read')return Response.json({message:taint,details:taint,hint:taint,code:'PGRST202'},{status:404})
    return Response.json(null)
   }
   if(url.pathname.endsWith('/commit_calendar_sync'))return Response.json({message:taint,details:taint,hint:taint,code:'57014'},{status:400})
   if(url.pathname.endsWith('/events')) {
    const snapshot=url.searchParams.get('singleEvents')==='true'
    if(stage===(snapshot?'google_snapshot_fetch':'google_delta_fetch'))return Response.json({error:{message:taint,body:taint}},{status:403})
    return Response.json(snapshot?{items:[{id:'event',summary:taint,description:taint,attendees:[{email:taint}],start:{dateTime:stage==='event_normalization'?'invalid': '2026-09-26T12:00:00Z'},end:{dateTime:'2026-09-26T13:00:00Z'}}]}:{items:[],nextSyncToken:'PRIVATE_CURSOR'})
   }
   throw poison()
  }
  try {
   const providers=stage==='unknown_sync_failure'?{google:async()=>({provider:'google',initialSync:async()=>{throw poison()}})}:{}
   const response=await calendarActionHandler(config,providers)(new Request('https://edge.test',{method:'POST',headers:{origin:'http://localhost:5173',authorization:'Bearer JWT','Content-Type':'application/json'},body:JSON.stringify({action:'sync',householdId:'household',id:calendarId})}))
   const browser=await response.json()
   assert.equal(response.status,503);assert.deepEqual(browser,{error:'calendar_sync_failed',stage})
   assert.equal(logs.length,1);const diagnostic=JSON.parse(logs[0][0])
   assert.equal(diagnostic.stage,stage);assert.equal(diagnostic.calendarId,calendarId);assert.equal(diagnostic.connectionId,connectionId)
   if(stage.startsWith('google_'))assert.equal(diagnostic.googleHttpStatus,403)
   if(stage==='sync_state_read'){assert.equal(diagnostic.databaseCode,'PGRST202');assert.equal(diagnostic.operation,'read_calendar_sync_state')}
   if(stage==='database_commit'){assert.equal(diagnostic.databaseCode,'57014');assert.equal(diagnostic.operation,'commit_calendar_sync')}
   assert.deepEqual(stored,[{sync_status:'error',sync_error:'Synchronization failed; retry or reconnect.'}])
   const serialized=JSON.stringify({logs,browser,stored})
   for(const marker of [...taint.split(' '),'PRIVATE_CURSOR','private-calendar'])assert.equal(serialized.includes(marker),false,marker)
  } finally {globalThis.fetch=originalFetch;Object.assign(console,originalLogs)}
 })
}
test('untrusted error names/messages/identifiers cannot become diagnostic fields',()=>{
 const value=syncDiagnostic(poison(),taint,taint)
 assert.deepEqual(value,{event:'calendar_sync_failed',stage:'unknown_sync_failure',errorClass:'Error',message:'Calendar synchronization failed.'})
})
