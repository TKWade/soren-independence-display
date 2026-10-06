import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {readDevicePreferences,saveDevicePreference,deviceHouseholdPreference,launchHousehold,selectDeviceProfile} from '../src/device/preferences.ts'
import {startWakeLock} from '../src/device/wakeLock.ts'
import {startHouseholdRefresh} from '../src/hooks/householdRefresh.ts'
import {startDisplayClock} from '../src/hooks/displayClock.ts'
import {calendarDates} from '../src/display/calendarPresentation.ts'
import {defaultDisplayPreferences} from '../src/display/preferences.ts'
import {getTimelineState,dateKey} from '../src/lib/schedule.ts'
import {weatherForDate} from '../src/weather/presentation.ts'
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()}
const storage=()=>{const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),values}}
const profiles=[{id:'p',household_id:'h',name:'Child',active:true},{id:'s',household_id:'h',name:'Sibling',active:true}]
function host(){
 const events=new Map(),timers=new Map();let visible=true
 return {visible:()=>visible,setVisible:value=>{visible=value},setInterval:(fn,ms)=>{timers.set(fn,ms);return fn},clearInterval:id=>timers.delete(id),listen:(name,fn)=>{if(!events.has(name))events.set(name,new Set());events.get(name).add(fn);return ()=>events.get(name).delete(fn)},emit:name=>{for(const fn of events.get(name)??[])fn()},tick:()=>{for(const fn of timers.keys())fn()},timers,events}
}
test('device launch preferences isolate account/household; explicit URLs win and invalid defaults never select siblings',()=>{
 const local=storage();assert.equal(readDevicePreferences('a',local),null)
 saveDevicePreference('a','h',{profileId:'p',keepAwake:true},local)
 let p=readDevicePreferences('a',local)
 assert.deepEqual(launchHousehold('',p,false),{householdId:'h',strict:true})
 assert.equal(selectDeviceProfile('',p,'h',profiles).id,'p')
 assert.equal(selectDeviceProfile('?household=h&profile=s',p,'h',profiles).id,'s')
 assert.equal(selectDeviceProfile('?household=h&profile=missing',p,'h',profiles),undefined)
 assert.equal(selectDeviceProfile('',p,'h',profiles.filter(p=>p.id!=='p')),undefined)
 assert.equal(selectDeviceProfile('',p,'h',profiles.map(p=>({...p,active:false}))),undefined)
 assert.equal(selectDeviceProfile('',p,'other',profiles),undefined)
 assert.equal(selectDeviceProfile('?household=other&profile=p',p,'h',profiles),undefined)
 assert.equal(readDevicePreferences('b',local),null)
 assert.deepEqual(launchHousehold('',p,true),{householdId:'',strict:false})
 assert.deepEqual(launchHousehold('?household=other&profile=x',p,false),{householdId:'other',strict:true})
 saveDevicePreference('a','other',{profileId:'x'},local);p=readDevicePreferences('a',local)
 assert.equal(p.householdId,'other');assert.equal(deviceHouseholdPreference(p,'h').profileId,'p');assert.equal(deviceHouseholdPreference(p,'other').keepAwake,false)
 assert.deepEqual(launchHousehold('?profile=s',p,false),{householdId:'',strict:false})
 assert.equal(selectDeviceProfile('',null,'h',profiles),undefined)
 assert.throws(()=>saveDevicePreference('a','h',{profileId:'p'},undefined))
 assert.equal(readDevicePreferences('a',{getItem:()=>'{broken'}),null)
 assert.equal(readDevicePreferences('a',{getItem:()=>{throw new Error('blocked')}}),null)
 assert.doesNotMatch([...local.values.values()].join(''),/Child|Sibling|token|password|latitude/)
})
function sentinel(){const listeners=new Set();return {released:false,releaseCount:0,async release(){this.released=true;this.releaseCount++;for(const fn of listeners)fn()},addEventListener:(_name,fn)=>listeners.add(fn),removeEventListener:(_name,fn)=>listeners.delete(fn)}}
test('wake lock enables once, releases on hide/leave, reacquires on resume and has no duplicate listeners',async()=>{
 const h=host(),locks=[];const stop=startWakeLock({...h,request:async()=>{const lock=sentinel();locks.push(lock);return lock}})
 await flush();assert.equal(locks.length,1)
 h.emit('visibilitychange');h.emit('pageshow');await flush();assert.equal(locks.length,1)
 h.setVisible(false);h.emit('visibilitychange');await flush();assert.equal(locks[0].releaseCount,1)
 h.setVisible(true);h.emit('visibilitychange');await flush();assert.equal(locks.length,2)
 h.emit('pagehide');await flush();assert.equal(locks[1].released,true)
 h.emit('pageshow');await flush();assert.equal(locks.length,3)
 stop();await flush();assert.equal(locks[2].released,true);assert.ok([...h.events.values()].every(s=>s.size===0))
 h.emit('pageshow');await flush();assert.equal(locks.length,3)
})
test('unsupported/rejected/OS-released locks do not retry; late grants after disabling are released',async()=>{
 const unsupported=host();startWakeLock(unsupported)();assert.equal(unsupported.events.size,0)
 const h=host();let requests=0;const stop=startWakeLock({...h,request:async()=>{requests++;throw new Error('Denied')}})
 await flush();assert.equal(requests,1);assert.equal(h.timers.size,0);stop()
 let resolve;const late=host(),lock=sentinel();const cancel=startWakeLock({...late,request:()=>new Promise(r=>{resolve=r})})
 late.emit('visibilitychange');cancel();resolve(lock);await flush();assert.equal(lock.releaseCount,1)
 const released=host(),osLock=sentinel();let count=0;const dispose=startWakeLock({...released,request:async()=>{count++;return osLock}})
 await flush();await osLock.release();await flush();assert.equal(count,1);dispose()
})
function options(overrides={}){return {selected:'h',strict:true,households:async()=>[{id:'h'}],load:async()=>({household:{id:'h'},events:[],weather:{revision:1}}),start(){},list(){},select(){},data(){},empty(){},error(){},done(){},...overrides}}
test('one refresh cadence covers online/focus/visibility; failed refresh retains data and reconnect updates calendar plus weather',async()=>{
 const h=host();let fail=false,revision=1,current=null,errors=0,loads=0
 const life=startHouseholdRefresh(options({load:async()=>{loads++;if(fail)throw new Error('offline');return {household:{id:'h'},events:[revision],weather:{revision}}},data:data=>{current=data},error:()=>errors++}),h)
 await flush();assert.equal(loads,1);assert.deepEqual([...h.timers.values()],[60000])
 fail=true;h.tick();await flush();assert.equal(errors,1);assert.deepEqual(current.events,[1]);assert.equal(current.weather.revision,1)
 fail=false;revision=2;h.emit('online');await flush();assert.deepEqual(current.events,[2]);assert.equal(current.weather.revision,2)
 h.setVisible(false);h.emit('visibilitychange');await flush();assert.equal(loads,3)
 h.setVisible(true);h.emit('visibilitychange');await flush();assert.equal(loads,4)
 h.emit('focus');await flush();assert.equal(loads,5)
 life.dispose();assert.equal(h.timers.size,0);assert.ok([...h.events.values()].every(set=>set.size===0))
})
test('old household/session responses are discarded; overlapping triggers deduplicate; inaccessible saved household never falls back',async()=>{
 const h=host();let resolve,loads=0,commits=0
 const life=startHouseholdRefresh(options({load:()=>{loads++;return new Promise(r=>{resolve=r})},data:()=>commits++}),h)
 await flush();h.tick();h.emit('online');h.emit('focus');await flush();assert.equal(loads,1)
 life.dispose();resolve({household:{id:'h'}});await flush();assert.equal(commits,0)
 const denied=host();let empty=0,selected=0
 const end=startHouseholdRefresh(options({households:async()=>[{id:'other'}],select:()=>selected++,empty:()=>empty++,load:()=>assert.fail()}),denied)
 await flush();assert.equal(empty,1);assert.equal(selected,0);end.dispose()
 const cold=host();let coldData=null,coldError=false
 const coldLife=startHouseholdRefresh(options({households:async()=>{throw new Error('offline')},data:d=>coldData=d,error:()=>coldError=true}),cold)
 await flush();assert.equal(coldData,null);assert.equal(coldError,true);coldLife.dispose()
})
test('controlled local midnight and resume update Today, rolling second column, NOW/NEXT and weather dates without altering pause semantics',()=>{
 const zone='America/Chicago',preferences=defaultDisplayPreferences(),h=host()
 let time=Date.parse('2026-10-01T04:59:55Z'),now=new Date(time)
 const stop=startDisplayClock(value=>now=value,{...h,now:()=>time})
 assert.equal(dateKey(now,zone),'2026-09-30');assert.equal(calendarDates(preferences,now,zone)[1],'2026-09-30')
 time=Date.parse('2026-10-01T05:00:10Z');h.tick()
 assert.equal(dateKey(now,zone),'2026-10-01');assert.equal(calendarDates(preferences,now,zone)[1],'2026-10-01')
 const events=[{id:'a',startTime:'2026-10-01T05:00:00Z',endTime:'2026-10-01T06:00:00Z'},{id:'b',startTime:'2026-10-01T06:00:00Z',endTime:'2026-10-01T07:00:00Z'}]
 const day={id:'d',date:'2026-10-01',timeZone:zone,events}
 assert.equal(getTimelineState(day,now).statuses.a,'now');assert.equal(getTimelineState(day,now).statuses.b,'next')
 time=Date.parse('2026-10-01T06:20:00Z');h.emit('visibilitychange')
 assert.equal(now.getTime(),time);assert.equal(getTimelineState(day,now).statuses.a,'past');assert.equal(getTimelineState(day,now).statuses.b,'now')
 const weather={enabled:true,location:{label:'Test'},temperature_unit:'fahrenheit',forecast:{timeZone:zone,fetchedAt:'2026-10-01T04:30:00Z',current:{date:'2026-09-30',temperature:20,condition:'sunny'},daily:[{date:'2026-09-30',high:25},{date:'2026-10-01',high:23}]}}
 const cue=weatherForDate(weather,dateKey(now,zone),now,zone);assert.equal(cue.daily.high,23);assert.equal(cue.current,undefined);assert.equal(cue.stale,true)
 time+=25*3600000;h.emit('focus');assert.equal(weatherForDate(weather,'2026-10-01',now,zone),null)
 stop();assert.equal(h.timers.size,0)
})
test('shared PWA start URL stays generic and does not cache authenticated API responses',async()=>{
 const config=await readFile(new URL('../vite.config.ts',import.meta.url),'utf8')
 assert.match(config,/start_url: '\/'/);assert.doesNotMatch(config,/runtimeCaching|NetworkFirst|CacheFirst/)
 const root=await readFile(new URL('../src/Root.tsx',import.meta.url),'utf8');assert.match(root,/key=\{session\?\.user.id/)
})


test('App waits for server access; authorized presentation retains loaded/offline data and removed profiles never render',async()=>{
 const {createServer}=await import('vite'),{default:react}=await import('@vitejs/plugin-react')
 const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server')
 const {householdFixture}=await import('./fixtures/externalCalendars.mjs')
 const server=await createServer({configFile:false,plugins:[react()],cacheDir:'node_modules/.vite-wall-tests',server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true}})
 const oldWindow=globalThis.window
 try {
  globalThis.window={location:{search:'?household=h&profile=soren'}}
  const {default:App,ProfileSchedule}=await server.ssrLoadModule('/src/App.tsx')
  const data=householdFixture();data.profiles=data.profiles.map(p=>({...p,household_id:'h'}))
  const store={data,list:[data.household],selected:'h',loading:true,error:false,refresh(){},setSelected(){}}
  const pending=renderToStaticMarkup(createElement(App,{store}));assert.match(pending,/WAIT/);assert.doesNotMatch(pending,/MY WEEK/)
  const authorized={data,profile:data.profiles[0],today:new Date('2026-09-23T14:00:00Z'),savedView:false}
  const loaded=renderToStaticMarkup(createElement(ProfileSchedule,authorized));assert.match(loaded,/MY WEEK/);assert.doesNotMatch(loaded,/WAIT|TRY AGAIN/)
  const offline=renderToStaticMarkup(createElement(ProfileSchedule,{...authorized,savedView:true}));assert.match(offline,/MY WEEK/);assert.match(offline,/SAVED VIEW/)
  const cold=renderToStaticMarkup(createElement(App,{store:{...store,data:null,error:true,loading:false}}));assert.match(cold,/TRY AGAIN/);assert.doesNotMatch(cold,/MY WEEK/)
  globalThis.window.location.search=''
  const removed=renderToStaticMarkup(createElement(App,{store,devicePreferences:{version:1,householdId:'h',households:{h:{profileId:'deleted',keepAwake:false}}}}));assert.match(removed,/WAIT/);assert.doesNotMatch(removed,/MY WEEK/)
 }finally{if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;await server.close()}
})
