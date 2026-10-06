import test from 'node:test'
import assert from 'node:assert/strict'
import {OpenMeteoProvider,normalizeForecast} from '../server/weather/openMeteo.ts'
import {refreshWeather} from '../server/weather/service.ts'
import {weatherHandler} from '../server/weather/handlers.ts'
import {WeatherDiagnosticError,logWeatherFailure} from '../server/weather/diagnostics.ts'
const privateText='https://private-provider.example/?apikey=secret-key latitude=38.84 longitude=-97.61 JWT-private service-role-private Family Name raw-provider-body'
const row={household_id:'00000000-0000-4000-8000-000000000001',revision:2,lease_id:'lease',location:{label:'Family Name',latitude:38.84,longitude:-97.61}}
const raw={current:{time:'2026-09-30T21:45',temperature_2m:21.5,weather_code:1},daily:{time:['2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06'],weather_code:[63,65,3,1,2,1,3],temperature_2m_max:[25,24,22,26,27,26,25],temperature_2m_min:[15,14,12,16,17,16,15],precipitation_probability_max:[90,95,20,0,10,0,20]}}
const providerFor=(body=raw)=>new OpenMeteoProvider('secret-key',async()=>Response.json(body))
function store({lookupFailure=false,finishFailure=false}={}) {
 const finishes=[]
 return {finishes,rpc:async(name,args)=>{if(name==='claim_weather_refresh')return {data:[row]};finishes.push(args);return {error:finishFailure?new Error(privateText):null}},from:()=>({select:()=>({eq:()=>({single:async()=>lookupFailure?{error:new Error(privateText)}:{data:{time_zone:'America/Chicago'}}})})})}
}
function capture(t) {
 const logs=[]
 for(const name of ['error','warn','info','log'])t.mock.method(console,name,(...args)=>logs.push(args))
 return logs
}
function check(logs,stage,category) {
 assert.deepEqual(logs,[[JSON.stringify({event:'weather_refresh_failed',stage,category})]])
 assert.doesNotMatch(JSON.stringify(logs),/38\.84|-97\.61|private|secret-key|Family Name|apikey/)
}
test('representative hosted Open-Meteo shape with seven daily dates is accepted',()=>{
 const normalized=normalizeForecast(raw,'America/Chicago')
 assert.equal(normalized.current.date,'2026-09-30');assert.equal(normalized.current.condition,'partly-cloudy')
 assert.deepEqual(normalized.daily.map(d=>d.condition),['rain','rain','cloudy','partly-cloudy','partly-cloudy','partly-cloudy','cloudy'])
})
test('lookup and unknown provider exceptions log only controlled fields and finish with null',async t=>{
 const logs=capture(t)
 for(const [lookupFailure,stage,category] of [[true,'household_lookup','household_unavailable'],[false,'provider_forecast','unknown']]){
  logs.length=0;const db=store({lookupFailure})
  assert.deepEqual(await refreshWeather(db,{forecast:async()=>{throw new Error(privateText)}}),{processed:1,failed:1})
  check(logs,stage,category);assert.deepEqual(db.finishes,[{hid:row.household_id,expected_revision:2,lease:'lease',result:null}])
 }
})
test('HTTP, network, JSON decode and timeout failures are safe provider-stage diagnostics',async t=>{
 const logs=capture(t)
 for(const [request,category] of [[async()=>new Response(privateText,{status:503}),'provider_unavailable'],[async()=>{throw new Error(privateText)},'provider_unavailable'],[async()=>new Response(privateText),'provider_unavailable'],[async()=>{throw new DOMException(privateText,'TimeoutError')},'timeout']]){
  logs.length=0;const db=store();await refreshWeather(db,new OpenMeteoProvider('secret-key',request))
  check(logs,'provider_forecast',category);assert.equal(db.finishes[0].result,null)
 }
})
test('normalization failures retain their precise safe category; arbitrary malformed bodies use unknown',async t=>{
 const logs=capture(t)
 for(const [body,category] of [[{...raw,daily:{...raw.daily,time:[]}},'invalid_forecast_horizon'],[{...raw,current:{...raw.current,temperature_2m:privateText}},'invalid_weather_number'],[{...raw,current:{...raw.current,time:privateText}},'invalid_weather_date'],[{...raw,current:{...raw.current,weather_code:123456}},'unsupported_weather_condition'],[{privateText},'unknown']]){
  logs.length=0;const db=store();await refreshWeather(db,providerFor(body))
  check(logs,'forecast_normalization',category);assert.equal(db.finishes[0].result,null)
 }
})
test('finish RPC errors and rejected requests log finish_refresh without leaking database details',async t=>{
 const logs=capture(t)
 for(const rejected of [false,true]){
  logs.length=0;const db=store({finishFailure:true}),rpc=db.rpc
  if(rejected)db.rpc=async(name,args)=>{if(name==='finish_weather_refresh')throw new Error(privateText);return rpc(name,args)}
  await assert.rejects(refreshWeather(db,providerFor()),e=>e instanceof WeatherDiagnosticError&&e.category==='database_finish_failed'&&!e.message.includes(privateText))
  check(logs,'finish_refresh','database_finish_failed')
 }
})
test('diagnostic metadata itself is allowlisted at runtime',t=>{
 const logs=capture(t),error=new WeatherDiagnosticError('provider_forecast','unknown')
 error.stage=privateText;error.category=privateText;error.message=privateText
 logWeatherFailure(error);check(logs,'provider_forecast','unknown')
})
test('authenticated action keeps compact response and never stores diagnostic text in the finish payload',async t=>{
 const logs=capture(t),finishes=[]
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const url=new URL(input)
  if(url.pathname==='/auth/v1/user')return Response.json({id:'user'})
  if(url.pathname.endsWith('/household_members'))return Response.json({id:'member'})
  if(url.pathname.endsWith('/households'))return Response.json({time_zone:'America/Chicago'})
  if(url.pathname.endsWith('/claim_weather_refresh'))return Response.json([row])
  if(url.pathname.endsWith('/finish_weather_refresh')){finishes.push(JSON.parse(init.body));return new Response(null,{status:204})}
  assert.fail('Unexpected request')
 })
 const handler=weatherHandler({url:'https://test.supabase.co',anonKey:'public',serviceRoleKey:'service-role-private',allowedOrigins:['https://local.example'],schedulerSecret:''},providerFor({...raw,current:{...raw.current,weather_code:123456}}))
 const response=await handler(new Request('https://local.example',{method:'POST',headers:{authorization:'Bearer JWT-private','content-type':'application/json'},body:JSON.stringify({action:'refresh',householdId:row.household_id})}))
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{processed:1,failed:1,saved:false})
 assert.equal(finishes[0].result,null);assert.doesNotMatch(JSON.stringify(finishes),/private|Family Name|secret-key|38\.84|-97\.61/)
 check(logs,'forecast_normalization','unsupported_weather_condition')
})
