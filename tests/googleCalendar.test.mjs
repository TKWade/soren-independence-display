import test from 'node:test'
import assert from 'node:assert/strict'
import { GoogleCalendarAdapter, GOOGLE_SCOPES, googleToken, GoogleAuthorizationExpired } from '../server/calendar/google.ts'
import { googleOAuthHandler, hashSecret, beginGoogleOAuth, pkceChallenge, validateGoogleConfig } from '../server/calendar/googleOAuth.ts'
import { disconnectGoogle, googleAdapter } from '../server/calendar/googleCredentials.ts'
import { syncCalendar } from '../server/calendar/provider.ts'
import { calendar, googleEvent } from './fixtures/externalCalendars.mjs'
const window={start:'2026-09-01T00:00:00Z',end:'2026-12-01T00:00:00Z'}
const config={clientId:'client',clientSecret:'server-secret',redirectUri:'https://project.supabase.co/functions/v1/google-oauth/callback',returnUrl:'http://localhost:5173/admin'}
function transport(responses) {
 const calls=[]
 const http=async(url,options)=>{calls.push({url:new URL(url),options});const response=responses.shift();assert.ok(response,'Unexpected request');return Response.json(response.body??response,{status:response.status??200})}
 return {http,calls}
}
function store(state=null) {return {readState:async()=>state,commits:[],async commit(...args){this.commits.push(args)}}}
test('Google discovers readable calendars across pages, without write or identity scopes',async()=>{
 const mock=transport([{items:[{id:'parent@example.test',primary:true,summary:'Parent',timeZone:'UTC'}],nextPageToken:'page2'},{items:[{id:'shared',summary:'Family',timeZone:'America/Chicago'}]}])
 const result=await new GoogleCalendarAdapter('server-access',mock.http).discover()
 assert.equal(result.length,2);assert.equal(result[0].primary,true)
 assert.equal(mock.calls[1].url.searchParams.get('pageToken'),'page2')
 assert.equal(mock.calls[0].url.searchParams.get('minAccessRole'),'reader')
 assert.deepEqual(GOOGLE_SCOPES,['https://www.googleapis.com/auth/calendar.calendarlist.readonly','https://www.googleapis.com/auth/calendar.events.readonly'])
})
test('Google initial sync checkpoints the unexpanded stream before a bounded recurring/all-day snapshot',async()=>{
 const holiday={id:'holiday',summary:'Holiday',start:{date:'2026-09-25'},end:{date:'2026-09-27'}}
 const mock=transport([{items:[{id:'series',recurrence:['RRULE:FREQ=DAILY']}],nextPageToken:'page2'},{items:[],nextSyncToken:'initial-token'},{items:[googleEvent,holiday]}])
 const db=store();await syncCalendar(new GoogleCalendarAdapter('access',mock.http),calendar,db,window)
 assert.equal(db.commits[0][3].length,2);assert.equal(db.commits[0][3][0].event.kind,'occurrence');assert.equal(db.commits[0][3][1].event.end,'2026-09-27')
 assert.deepEqual(db.commits[0][4],{syncToken:'initial-token'});assert.equal(db.commits[0][5],true)
 assert.equal(mock.calls[0].url.searchParams.get('singleEvents'),'false');assert.equal(mock.calls[2].url.searchParams.get('timeMax'),window.end)
 assert.ok(mock.calls.every(c=>!c.options.method||c.options.method==='GET'))
})
test('Google incremental pagination uses the same token; cancellations reconcile and empty deltas skip snapshot',async()=>{
 const mock=transport([{items:[{id:'series',status:'cancelled'}],nextPageToken:'more'},{items:[],nextSyncToken:'new'},{items:[]}])
 const db=store({revision:4,cursor:{syncToken:'old'},window})
 await syncCalendar(new GoogleCalendarAdapter('access',mock.http),calendar,db,window)
 assert.equal(db.commits[0][1],4);assert.equal(db.commits[0][5],true);assert.deepEqual(db.commits[0][3],[])
 for(const call of mock.calls.slice(0,2)) {assert.equal(call.url.searchParams.get('syncToken'),'old');assert.equal(call.url.searchParams.has('timeMin'),false)}
 const empty=transport([{items:[],nextSyncToken:'newer'}]),emptyDb=store({revision:5,cursor:{syncToken:'new'},window})
 await syncCalendar(new GoogleCalendarAdapter('access',empty.http),calendar,emptyDb,window)
 assert.equal(empty.calls.length,1);assert.equal(emptyDb.commits[0][5],false)
})
test('Google 410 resets once; interrupted snapshots and missing final tokens never commit',async()=>{
 const mock=transport([{status:410,body:{}},{items:[],nextSyncToken:'reset'},{items:[googleEvent]}]),db=store({revision:7,cursor:{syncToken:'expired'},window})
 await syncCalendar(new GoogleCalendarAdapter('access',mock.http),calendar,db,window)
 assert.equal(mock.calls[1].url.searchParams.has('syncToken'),false);assert.equal(db.commits[0][5],true)
 for(const responses of [[{items:[]}],[{nextSyncToken:'x'},{status:503,body:{}}]]) {
  const failure=store();await assert.rejects(syncCalendar(new GoogleCalendarAdapter('access',transport(responses).http),calendar,failure,window));assert.equal(failure.commits.length,0)
 }
})
test('OAuth callback rejects missing state/cookie and copied kickoff before exchange; state consumed before token POST',async()=>{
 const calls=[];const state='a'.repeat(64),binding='b'.repeat(64),stateHash=await hashSecret(state)
 const service={auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},rpc:async(_,args)=>{calls.push(args);return {data:{id:'pending',verifier:'v'.repeat(64)},error:null}}}
 const google=transport([{access_token:'access',refresh_token:'refresh',token_type:'Bearer',scope:GOOGLE_SCOPES.join(' ')},{items:[{id:'parent@example.test',primary:true,timeZone:'UTC'}]}])
 const handle=googleOAuthHandler(service,config,google.http)
 for(const url of [config.redirectUri,config.redirectUri+'?state='+state+'&code=code',config.redirectUri.replace('callback','start')+'?ticket='+state]) {
  const response=await handle(new Request(url));assert.match(response.headers.get('location'),/failed/)
 }
 assert.equal(calls.length,0);assert.equal(google.calls.length,0)
 const response=await handle(new Request(config.redirectUri+'?state='+state+'&code=code',{headers:{cookie:`__Host-gcal-${stateHash.slice(0,16)}=${binding}`}}))
 assert.equal(calls[0].operation,'consume');assert.equal(calls[0].payload.bindingHash,await hashSecret(binding));assert.equal(calls[1].operation,'finish')
 assert.match(response.headers.get('location'),/connected/);assert.equal(response.headers.get('location').includes('refresh'),false)
 assert.deepEqual(Object.fromEntries(google.calls[0].options.body),{client_id:'client',client_secret:'server-secret',grant_type:'authorization_code',code:'code',redirect_uri:config.redirectUri,code_verifier:'v'.repeat(64)})
})
test('OAuth start authenticates browser and generates offline, read-only authorization with S256 PKCE',async()=>{
 const calls=[];const service={auth:{getUser:async token=>({data:{user:token==='app-session'?{id:'user'}:null}})},rpc:async(_,args)=>{calls.push(args);return {data:{verifier:'v'.repeat(64)}}}}
 const form=new URLSearchParams({ticket:'a'.repeat(64),access_token:'app-session'})
 const response=await googleOAuthHandler(service,config)(new Request(config.redirectUri.replace('callback','start'),{method:'POST',headers:{origin:'http://localhost:5173'},body:form}))
 const url=new URL(response.headers.get('location'))
 assert.equal(url.origin,'https://accounts.google.com');assert.equal(url.searchParams.get('access_type'),'offline');assert.equal(url.searchParams.get('scope'),GOOGLE_SCOPES.join(' '));assert.equal(calls[0].payload.userId,'user')
 assert.match(response.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax; Max-Age=600/)
 assert.equal(url.searchParams.get('prompt'),'consent select_account')
 assert.equal(url.searchParams.get('response_type'),'code')
 assert.equal(url.searchParams.get('redirect_uri'),config.redirectUri)
 assert.equal(url.searchParams.get('client_id'),config.clientId)
 for(const key of ['code_verifier','client_secret']) assert.equal(url.searchParams.has(key),false)
 assert.equal(url.searchParams.get('code_challenge_method'),'S256')
 assert.equal(url.searchParams.get('code_challenge'),await pkceChallenge('v'.repeat(64)))
 assert.doesNotMatch(url.toString(),/%0[ad]/i)
 assert.equal(url.toString().includes('v'.repeat(64)),false)
 const state=url.searchParams.get('state');assert.match(state,/^[a-f0-9]{64}$/)
 assert.equal(calls[0].payload.stateHash,await hashSecret(state))
 const second=await googleOAuthHandler(service,config)(new Request(config.redirectUri.replace('callback','start'),{method:'POST',headers:{origin:'http://localhost:5173'},body:form}))
 assert.notEqual(new URL(second.headers.get('location')).searchParams.get('state'),state)
 assert.notEqual(second.headers.get('set-cookie'),response.headers.get('set-cookie'))
 const count=calls.length
 for(const [origin,token] of [['https://untrusted.example','app-session'],['http://localhost:5173','invalid']]) {
  const rejected=await googleOAuthHandler(service,config)(new Request(config.redirectUri.replace('callback','start'),{method:'POST',headers:{origin},body:new URLSearchParams({ticket:'a'.repeat(64),access_token:token})}))
  assert.match(rejected.headers.get('location'),/failed/)
 }
 assert.equal(calls.length,count)
 await beginGoogleOAuth(service,config,'household','user')
 assert.deepEqual(Object.keys(calls.at(-1).payload).sort(),['householdId','ticketHash','userId','verifier'])
})
test('Refresh uses server token endpoint; invalid grants are classified without leaking upstream details',async()=>{
 const mock=transport([{status:400,body:{error:'invalid_grant',error_description:'private details'}}])
 await assert.rejects(googleToken(config,{grant_type:'refresh_token',refresh_token:'private-refresh'},mock.http),GoogleAuthorizationExpired)
 assert.equal(mock.calls[0].options.body.get('refresh_token'),'private-refresh')
})
test('Disconnect finishes locally even without remote credentials and returns no secrets',async()=>{
 const calls=[];const result=await disconnectGoogle({rpc:async(_,args)=>{calls.push(args);return {data:{refreshToken:null}}}},'connection')
 assert.equal(calls[0].operation,'disconnect');assert.deepEqual(result,{disconnected:true,revoked:false})
})

test('Disconnect revokes remotely after local removal; network failure cannot restore credentials',async()=>{
 const operations=[],service={rpc:async(_,args)=>{operations.push(args.operation);return {data:{refreshToken:'server-refresh'}}}}
 const result=await disconnectGoogle(service,'connection',async(url,options)=>{
  assert.deepEqual(operations,['disconnect']);assert.equal(String(url),'https://oauth2.googleapis.com/revoke');assert.equal(options.body.get('token'),'server-refresh');throw new Error('offline')
 })
 assert.deepEqual(result,{disconnected:true,revoked:false});assert.equal(JSON.stringify(result).includes('server-refresh'),false)
 const success=await disconnectGoogle(service,'connection',async()=>new Response(null,{status:200}));assert.equal(success.revoked,true)
})


test('Vault refresh rotation and expired grants use the credential generation; no browser token result',async()=>{
 const calls=[],service={rpc:async(_,args)=>{calls.push(args);return {data:{refreshToken:'refresh',secretId:'generation'}}}}
 await assert.rejects(googleAdapter(service,config,'connection',transport([{status:400,body:{error:'invalid_grant'}}]).http),GoogleAuthorizationExpired)
 assert.deepEqual(calls.map(c=>c.operation),['read','expired']);assert.equal(calls[1].payload.secretId,'generation')
 calls.length=0
 const adapter=await googleAdapter(service,config,'connection',transport([{access_token:'new-access',refresh_token:'new-refresh',token_type:'Bearer'},{items:[]}]).http)
 assert.deepEqual(calls.map(c=>c.operation),['read','rotate']);assert.equal(calls[1].payload.refreshToken,'new-refresh');assert.deepEqual(await adapter.listCalendars(),[])
})

test('callback rejects mismatched state/binding and replay before any further Google request',async()=>{
 const state='a'.repeat(64),binding='b'.repeat(64),stateHash=await hashSecret(state),bindingHash=await hashSecret(binding)
 let consumed=false
 const google=transport([{access_token:'access',refresh_token:'refresh',token_type:'Bearer',scope:GOOGLE_SCOPES.join(' ')},{items:[{id:'parent@example.test',primary:true,timeZone:'UTC'}]}])
 const service={rpc:async(_,args)=>{
  if(args.operation==='consume') {
   if(consumed||args.payload.stateHash!==stateHash||args.payload.bindingHash!==bindingHash) return {error:new Error('Invalid state')}
   consumed=true;assert.equal(google.calls.length,0);return {data:{id:'pending',verifier:'v'.repeat(64)}}
  }
  return {data:{householdId:'household'}}
 }}
 const handle=googleOAuthHandler(service,config,google.http)
 const request=async(s,b)=>handle(new Request(config.redirectUri+'?state='+s+'&code=code',{headers:{cookie:`__Host-gcal-${(await hashSecret(s)).slice(0,16)}=${b}`}}))
 for(const [s,b] of [[state,'c'.repeat(64)],['c'.repeat(64),binding]]) assert.match((await request(s,b)).headers.get('location'),/failed/)
 assert.equal(google.calls.length,0)
 assert.match((await request(state,binding)).headers.get('location'),/connected/)
 assert.match((await request(state,binding)).headers.get('location'),/failed/)
 assert.equal(google.calls.length,2)
})

test('PKCE uses independent RFC-compatible verifiers and the S256 base64url test vector',async()=>{
 assert.equal(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
 const payloads=[],service={rpc:async(_,args)=>{payloads.push(args.payload);return {data:{}}}}
 const responses=[]
 for(let i=0;i<8;i++) responses.push(await beginGoogleOAuth(service,config,'household','user'))
 assert.equal(new Set(payloads.map(p=>p.verifier)).size,8)
 for(const [i,p] of payloads.entries()) {
  assert.match(p.verifier,/^[A-Za-z0-9._~-]{43,128}$/)
  assert.equal(p.verifier.length,64)
  assert.match(await pkceChallenge(p.verifier),/^[A-Za-z0-9_-]{43}$/)
  assert.equal(JSON.stringify(responses[i]).includes(p.verifier),false)
 }
})

test('URL configuration rejects whitespace/newlines/userinfo before generating any authorization URL',async()=>{
 const {parseAllowedOrigins}=await import('../server/calendar/configuration.ts')
 let calls=0;const service={rpc:async()=>{calls++;return {data:{}}}}
 for(const field of ['redirectUri','returnUrl']) {
  for(const value of [config[field]+'\n',config[field]+'\r\n',' '+config[field],config[field]+' ',config[field].replace('://',':/\n/'),config[field].replace('://','://user:pass@'),config[field].replace('://','://@'),config[field]+'%0A','not a url','https://']) {
   const bad={...config,[field]:value}
   assert.throws(()=>validateGoogleConfig(bad))
   await assert.rejects(beginGoogleOAuth(service,bad,'household','user'))
   const response=await googleOAuthHandler(service,bad)(new Request(config.redirectUri))
   assert.equal(response.status,503);assert.equal(response.headers.has('location'),false)
  }
 }
 assert.equal(calls,0)
 for(const value of ['https://example.test\n',' https://example.test','https://example.test, https://other.test','https://user@example.test','https://example.test/path','https://example.test/','https://example.test,','https://example.test\r\n','']) assert.throws(()=>parseAllowedOrigins(value))
 assert.deepEqual(parseAllowedOrigins('https://example.test,http://localhost:5173'),['https://example.test','http://localhost:5173'])
 assert.doesNotThrow(()=>validateGoogleConfig({...config,redirectUri:'https://pvkrwzieiyuztqupxifj.supabase.co/functions/v1/google-oauth/callback',clientSecret:' unchanged secret\n'}))
})

test('transaction verifier matches its authorization challenge; mismatch fails and consumed attempts cannot retry',async()=>{
 for(const corrupt of [false,true]) {
  let pending,challenge,exchanges=0,finished=false
  const service={auth:{getUser:async()=>({data:{user:{id:'user'}}})},rpc:async(_,args)=>{
   if(args.operation==='begin') {pending={...args.payload};return {data:{}}}
   if(args.operation==='start') {Object.assign(pending,args.payload);return {data:{verifier:pending.verifier}}}
   if(args.operation==='consume') {
    if(pending.consumed||args.payload.stateHash!==pending.stateHash||args.payload.bindingHash!==pending.bindingHash) return {error:new Error('Invalid state')}
    const verifier=pending.verifier;pending.verifier=null;pending.consumed=true
    return {data:{id:'pending',verifier:corrupt?'wrong'.repeat(16):verifier}}
   }
   finished=true;return {data:{householdId:'household'}}
  }}
  const http=async(url,options)=>{
   if(String(url)==='https://oauth2.googleapis.com/token') {
    exchanges++;assert.equal(pending.verifier,null)
    const matches=await pkceChallenge(options.body.get('code_verifier'))===challenge
    return matches?Response.json({access_token:'access',refresh_token:'refresh',token_type:'Bearer',scope:GOOGLE_SCOPES.join(' ')}):Response.json({error:'invalid_grant'},{status:400})
   }
   return Response.json({items:[{id:'parent@example.test',primary:true,timeZone:'UTC'}]})
  }
  const kickoff=await beginGoogleOAuth(service,config,'household','user'),ticket=new URL(kickoff.authorizationUrl).searchParams.get('ticket')
  const handler=googleOAuthHandler(service,config,http)
  const start=await handler(new Request(config.redirectUri.replace('callback','start'),{method:'POST',headers:{origin:'http://localhost:5173'},body:new URLSearchParams({ticket,access_token:'session'})}))
  const auth=new URL(start.headers.get('location'));challenge=auth.searchParams.get('code_challenge')
  const callback=()=>new Request(config.redirectUri+'?state='+auth.searchParams.get('state')+'&code=authorization-code',{headers:{cookie:start.headers.get('set-cookie').split(';')[0]}})
  assert.match((await handler(callback())).headers.get('location'),corrupt?/failed/:/connected/)
  assert.equal(finished,!corrupt)
  assert.match((await handler(callback())).headers.get('location'),/failed/)
  assert.equal(exchanges,1)
 }
})
