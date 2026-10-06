import test from 'node:test'
import assert from 'node:assert/strict'
import {requiresPin,profileRole,authorizedProfiles,avatarColor,avatarInitials,defaultSwitchingSettings,retainDisplayGrant} from '../src/profiles/access.ts'
import {householdFixture} from './fixtures/externalCalendars.mjs'
import {hashPin,verifyPin,validPin} from '../server/profiles/pin.ts'
import {profileAccessHandler,safeResult} from '../server/profiles/handler.ts'
import {parseDisplayPreferences,defaultDisplayPreferences} from '../src/display/preferences.ts'
import {createServer} from 'vite'
import react from '@vitejs/plugin-react'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const child={id:'child',name:'Caregiver',active:true,role:'child'},sibling={id:'sibling',name:'Sibling',active:true,role:'sibling'},adult={id:'adult',name:'Adult',active:true,role:'caregiver'}
test('typed roles, switching policies, authorized/active filtering and deterministic accessible avatars',()=>{
 assert.equal(profileRole(undefined),'child');assert.equal(profileRole('Caregiver'),'child')
 const s={...defaultSwitchingSettings,}
 assert.equal(requiresPin(sibling,child,s),false);assert.equal(requiresPin(child,sibling,s),false)
 assert.equal(requiresPin(adult,child,s),true);assert.equal(requiresPin(child,adult,s),false)
 assert.equal(requiresPin(child,adult,{...s,requirePinForAllProfileSwitches:true}),true)
 assert.equal(requiresPin(sibling,child,{...s,allowChildToChildSwitching:false}),true)
 assert.equal(requiresPin(child,adult,{...s,allowChildToChildSwitching:false}),false)
 assert.equal(requiresPin(child,{...sibling,role:'other'},{...s,allowChildToChildSwitching:false}),true)
 const profiles=[child,sibling,adult,{id:'inactive',active:false,name:'Hidden'}]
 assert.deepEqual(authorizedProfiles(profiles,{allowedProfileIds:['child','inactive']}),[child])
 assert.equal(avatarInitials(' Taylor Lane '),'TL');assert.equal(avatarInitials(''),'?');assert.equal(avatarColor(child.id),avatarColor(child.id))
 // White contrast on each deterministic dark palette color exceeds WCAG AA.
 for(let i=0;i<50;i++) {
  const values=avatarColor(String(i)).slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
  assert.ok(1.05/(.2126*values[0]+.7152*values[1]+.0722*values[2]+.05)>=4.5)
 }
})
test('real PIN KDF uses random salts, validates format and only accepts complete matching PIN',async()=>{
 const a=await hashPin('7391'),b=await hashPin('7391');assert.notEqual(a,b);assert.match(a,/^pbkdf2-sha256\$600000\$/)
 assert.equal(await verifyPin('7391',a),true);assert.equal(await verifyPin('7392',a),false);assert.equal(await verifyPin('739',a),false)
 for(const pin of ['123','123456789','1a23',1234,' 1234'])assert.equal(validPin(pin),false)
 assert.equal(validPin('01234567'),true);await assert.rejects(hashPin('abc'))
 assert.equal(await verifyPin('7391',a.replace('600000','1')),false)
})
test('only a current server-authorized display survives offline; protected expiry and identity changes fail closed',()=>{
 const profile={id:'p',household_id:'h',role:'child',active:true},grant={profileId:'p',householdId:'h',role:'child',expiresAt:null}
 assert.equal(retainDisplayGrant(undefined,profile,100),false)
 assert.equal(retainDisplayGrant(grant,profile,100),true)
 for(const change of [{id:'other'},{household_id:'other'},{role:'caregiver'},{active:false}])assert.equal(retainDisplayGrant(grant,{...profile,...change},100),false)
 assert.equal(retainDisplayGrant({...grant,expiresAt:101},profile,100),true)
 assert.equal(retainDisplayGrant({...grant,expiresAt:100},profile,100),false)
})
test('Edge handler authenticates session/membership, uses private RPCs and never returns or logs secrets',async()=>{
 const hid='00000000-0000-4000-8000-000000000001',pid='00000000-0000-4000-8000-000000000002',sid='00000000-0000-4000-8000-000000000003'
 const token='header.'+btoa(JSON.stringify({session_id:sid}))+'.signature',hash=await hashPin('7391')
 let denied=false,throwRaw=false,correct=false,mode='success',calls=[]
 const factory=()=>({auth:{getUser:async()=>({data:{user:{id:hid}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:denied?null:{id:hid}})}),rpc:async(name,args)=>{
  calls.push({name,args});if(throwRaw)throw new Error('7391 '+hash+' '+token)
  if(name==='begin_caregiver_pin')return {data:mode==='retry'?{allowed:false,reason:'retry',retryAfter:7,hash}:{allowed:true,hash,ticket:pid,revision:1}}
  if(name==='finish_caregiver_pin'){correct=args.verified;return {data:{allowed:args.verified,reason:'incorrect',hash,ticket:pid}}}
  return {data:{hash}}
 }})
 const handler=profileAccessHandler({url:'https://example.supabase.co',anonKey:'public',serviceRoleKey:'service-secret',allowedOrigins:['http://localhost:5173']},factory)
 const request=body=>new Request('https://edge.invalid',{method:'POST',headers:{origin:'http://localhost:5173',authorization:'Bearer '+token},body:JSON.stringify({action:'verify',householdId:hid,profileId:pid,caregiverId:pid,pin:'7391',...body})})
 const logs=[];const originals=['log','warn','error','info'].map(key=>[key,console[key]])
 for(const [key] of originals)console[key]=(...args)=>logs.push(args)
 try {
  let response=await handler(request());assert.deepEqual(await response.json(),{allowed:true});assert.equal(correct,true)
  assert.equal(calls[0].args.sid,sid)
  response=await handler(request({pin:'7392'}));assert.deepEqual(await response.json(),{allowed:false,reason:'incorrect'});assert.equal(correct,false)
  mode='retry';assert.deepEqual(await (await handler(request())).json(),{allowed:false,reason:'retry',retryAfter:7})
  throwRaw=true;response=await handler(request());assert.equal(response.status,503);assert.deepEqual(await response.json(),{error:'profile_access_unavailable'})
  denied=true;assert.equal((await handler(request())).status,403)
  assert.deepEqual(logs,[])
 }finally{for(const [key,value] of originals)console[key]=value}
 assert.deepEqual(safeResult({allowed:true,hash,pin:'7391',ticket:pid}),{allowed:true})
 assert.deepEqual(safeResult({allowed:false,reason:hash,hash}),{allowed:false,reason:'unavailable'})
})
test('actual chooser markup uses photo/fallback avatars, locks, keyboard form and numeric masked input; selected profiles own preferences',async()=>{
 const vite=await createServer({configFile:false,plugins:[react()],server:{middlewareMode:true,watch:null,hmr:false,ws:false},appType:'custom',optimizeDeps:{noDiscovery:true}})
 try {
  const {ProfileAvatar,ProfileChooser}=await vite.ssrLoadModule('/src/profiles/ProfileChooser.tsx')
  const photo=renderToStaticMarkup(createElement(ProfileAvatar,{profile:{...child,photoUrl:'/photo.png',avatar:'sun'}}));assert.match(photo,/<img.*src="\/photo.png"/);assert.doesNotMatch(photo,/Caregiver<\/span>/)
  const props={profiles:[child,sibling,adult],current:child,caregivers:{adult:{configured:true,changeRequired:false}},settings:{...defaultSwitchingSettings,},authorize:async()=>({allowed:true}),verify:async()=>({allowed:true}),onSelected:()=>{}}
  const markup=renderToStaticMarkup(createElement(ProfileChooser,props));assert.match(markup,/Who’s using SOREN/);assert.match(markup,/profile-lock/);assert.match(markup,/CURRENT/);assert.doesNotMatch(markup,/<select|household_id/)
  const pin=renderToStaticMarkup(createElement(ProfileChooser,{...props,initialTarget:adult}));assert.match(pin,/type="password"/);assert.match(pin,/inputMode="numeric"/);assert.match(pin,/PIN keypad/);assert.match(pin,/<form/)
  const a=parseDisplayPreferences({...defaultDisplayPreferences(),showProfileSwitching:false}),b=parseDisplayPreferences(defaultDisplayPreferences('standard-calendar'))
  assert.equal(a.showProfileSwitching,false);assert.equal(b.displayMode,'standard-calendar');assert.equal(b.showWho,true);assert.equal(b.showTimes,false);assert.equal(b.showClock,true)
  const {ProfileSchedule}=await vite.ssrLoadModule('/src/App.tsx')
  const data=householdFixture();data.profiles=data.profiles.map(p=>({...p,household_id:'h'}))
  data.displayPreferences=[{profile_id:'soren',preferences:{...defaultDisplayPreferences(),showWho:false,showWhere:false,showProfileSwitching:false}},{profile_id:'sister',preferences:{...defaultDisplayPreferences('standard-calendar'),allowedViews:['month'],defaultView:'month',showTimes:true}}]
  const projectionProps={data,today:new Date('2026-09-23T14:00:00Z'),savedView:false,trigger:createElement('button',{},'Switch profile')}
  const first=renderToStaticMarkup(createElement(ProfileSchedule,{...projectionProps,profile:data.profiles[0]})),second=renderToStaticMarkup(createElement(ProfileSchedule,{...projectionProps,profile:data.profiles[1]}))
  assert.match(first,/MY WEEK/);assert.doesNotMatch(first,/Switch profile|standard-clock/)
  assert.match(second,/MY MONTH/);assert.match(second,/standard-clock/);assert.match(second,/Switch profile/)
 }finally{await vite.close()}
})
