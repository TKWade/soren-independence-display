import test from 'node:test'
import assert from 'node:assert/strict'
import {condition,normalizeForecast,OpenMeteoProvider} from '../server/weather/openMeteo.ts'
import {weatherForDate,temperature} from '../src/weather/presentation.ts'
import {refreshWeather} from '../server/weather/service.ts'
import {weatherHandler} from '../server/weather/handlers.ts'
import {defaultDisplayPreferences,parseDisplayPreferences} from '../src/display/preferences.ts'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const now=new Date('2026-09-30T01:00:00Z'),zone='America/Chicago'
const raw={current:{time:'2026-09-29T20:00',temperature_2m:22,weather_code:0},daily:{time:['2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05'],weather_code:[0,2,3,61,95,71,45],temperature_2m_max:[25,26,27,28,29,30,31],temperature_2m_min:[10,11,12,13,14,15,16],precipitation_probability_max:[0,10,20,90,80,70,20]}}
const forecast=normalizeForecast(raw,zone,now),weather={household_id:'h',enabled:true,location:{label:'Salina',latitude:38.84,longitude:-97.61},temperature_unit:'fahrenheit',revision:1,forecast,refresh_failed:false}
test('normalization maps current/local dates, daily horizon, precipitation and all supported semantic codes',()=>{
 assert.equal(forecast.current.date,'2026-09-29');assert.equal(forecast.daily.length,7);assert.equal(forecast.daily[3].precipitationProbability,90)
 assert.deepEqual(forecast.daily.map(d=>d.condition),['sunny','partly-cloudy','cloudy','rain','storm','snow','fog'])
 for(const code of [51,53,55,56,57,61,63,65,66,67,80,81,82])assert.equal(condition(code),'rain')
 for(const code of [71,73,75,77,85,86])assert.equal(condition(code),'snow')
 assert.throws(()=>condition(999));assert.throws(()=>normalizeForecast({...raw,current:{...raw.current,temperature_2m:null}},zone))
 assert.equal(temperature(25,'fahrenheit'),'77°');assert.equal(temperature(25,'celsius'),'25°')
})
test('disabled, missing date, stale, expired, timezone mismatch and midnight behavior',()=>{
 assert.equal(weatherForDate({...weather,enabled:false},'2026-09-29',now,zone),null)
 assert.equal(weatherForDate(weather,'2026-10-12',now,zone),null)
 assert.equal(weatherForDate(weather,'2026-09-29',now,'UTC'),null)
 assert.equal(weatherForDate(weather,'2026-09-29',now,zone).current.temperature,22)
 const stale=weatherForDate(weather,'2026-09-30',new Date(now.getTime()+2*3600000),zone)
 assert.equal(stale.stale,true);assert.equal(stale.current,undefined)
 assert.equal(weatherForDate(weather,'2026-09-30',new Date(now.getTime()+25*3600000),zone),null)
 assert.equal(weatherForDate({...weather,refresh_failed:true},'2026-09-29',now,zone).stale,true)
 assert.equal(defaultDisplayPreferences().showWeather,true);assert.equal(defaultDisplayPreferences().weatherDetail,'simple')
 assert.equal(defaultDisplayPreferences('first-next-then').showWeather,false)
 assert.equal(defaultDisplayPreferences('standard-calendar').weatherDetail,'standard')
 assert.throws(()=>parseDisplayPreferences({...defaultDisplayPreferences(),showWeather:'yes'}))
})
test('provider location lookup accepts city/region and ZIP, returns normalized choices and uses stored coordinates for forecast',async()=>{
 const urls=[];const provider=new OpenMeteoProvider('',async input=>{const url=new URL(input);urls.push(url);return Response.json(url.pathname.includes('search')?{results:[{name:'Salina',admin1:'Kansas',country:'United States',latitude:38.84,longitude:-97.61}]}:raw)})
 const locations=await provider.search('Salina, KS');assert.equal(locations[0].label,'Salina, Kansas, United States');assert.equal(urls[0].searchParams.get('name'),'Salina, KS')
 await provider.search('67401');assert.equal(urls[1].searchParams.get('name'),'67401')
 await provider.forecast(locations[0],zone);assert.equal(urls[2].searchParams.get('timezone'),zone);assert.equal(urls[2].searchParams.get('forecast_days'),'7');assert.equal(urls[2].searchParams.get('latitude'),'38.84')
 const commercial=new OpenMeteoProvider('server-secret',async url=>{assert.equal(new URL(url).host,'customer-api.open-meteo.com');return new Response('private provider body',{status:500})})
 await assert.rejects(commercial.forecast(locations[0],zone),e=>e.message==='Weather provider unavailable')
})
test('refresh failure finishes lease without replacing successful cache; successful refresh passes revision and normalized data',async()=>{
 const finishes=[]
 const service={rpc:async(name,args)=>name==='claim_weather_refresh'?{data:[{...weather,lease_id:'lease'}]}:(finishes.push(args),{}),from:()=>({select:()=>({eq:()=>({single:async()=>({data:{time_zone:zone}})})})})}
 assert.deepEqual(await refreshWeather(service,{forecast:async()=>{throw new Error('secret / private response')}}),{processed:1,failed:1})
 assert.equal(finishes[0].result,null);assert.equal(finishes[0].expected_revision,1);assert.equal(finishes[0].lease,'lease')
 await refreshWeather(service,{forecast:async()=>forecast});assert.deepEqual(finishes[1].result,forecast)
 const skipped=await refreshWeather({rpc:async()=>({data:[]})},{forecast:()=>assert.fail()});assert.equal(skipped.processed,0)
})
test('server denies unauthenticated actions and untrusted worker requests before provider calls',async()=>{
 const config={url:'http://localhost',anonKey:'public',serviceRoleKey:'secret',allowedOrigins:['http://localhost:5173'],schedulerSecret:'a'.repeat(40)}
 const provider={search:()=>assert.fail(),forecast:()=>assert.fail()}
 const action=weatherHandler(config,provider),worker=weatherHandler(config,provider,true)
 assert.equal((await action(new Request('http://localhost',{method:'POST'}))).status,401)
 assert.equal((await action(new Request('http://localhost',{method:'POST',headers:{origin:'https://evil.example'}}))).status,403)
 const r=await worker(new Request('http://localhost',{method:'POST',headers:{'x-weather-scheduler-secret':'wrong'},body:'{}'}));assert.equal(r.status,401);assert.deepEqual(await r.json(),{error:'not_authorized'})
})
test('Week and Day render simple cues; Standard is richer; First/Next/Then and schedule are unchanged',async()=>{
 const vite=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true},appType:'custom'})
 try{
  const {WeatherCue}=await vite.ssrLoadModule('/src/weather/WeatherCue.tsx')
  const {DisplayRenderer}=await vite.ssrLoadModule('/src/display/DisplayRenderer.tsx')
  const {default:Day}=await vite.ssrLoadModule('/src/components/DayTimelineB.tsx')
  const schedule={timeZone:zone,days:[{id:'day',date:'2026-09-29',timeZone:zone,events:[],primaryEventId:''}]},before=JSON.stringify(schedule)
  const cue=renderToStaticMarkup(createElement(WeatherCue,{weather,date:'2026-09-29',now,zone}));assert.match(cue,/77°/);assert.doesNotMatch(cue,/weather-range|weather-condition/)
  const day=renderToStaticMarkup(createElement(Day,{weather,day:schedule.days[0],now}));assert.match(day,/72°/)
  assert.match(renderToStaticMarkup(createElement(Day,{weather,day:{...schedule.days[0],timeZone:undefined},now})),/72°/)
  const standard=renderToStaticMarkup(createElement(WeatherCue,{weather,date:'2026-09-29',now,zone,detail:'standard',day:true}));assert.match(standard,/weather-range/);assert.match(standard,/SUNNY/)
  const props={schedule,profileName:'Soren',now,preferences:defaultDisplayPreferences('first-next-then')}
  assert.equal(renderToStaticMarkup(createElement(DisplayRenderer,{...props,weather})),renderToStaticMarkup(createElement(DisplayRenderer,props)))
  const week=renderToStaticMarkup(createElement(DisplayRenderer,{...props,weather,preferences:defaultDisplayPreferences()}));assert.match(week,/weather-cue/)
  assert.equal(JSON.stringify(schedule),before)
 }finally{await vite.close()}
})
