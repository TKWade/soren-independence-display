import test from 'node:test'
import assert from 'node:assert/strict'
import {profileAccessHandler,safeResult} from '../server/profiles/handler.ts'
const hid='00000000-0000-4000-8000-000000000001',pid='00000000-0000-4000-8000-000000000002',sid='00000000-0000-4000-8000-000000000003'
const token='header.'+btoa(JSON.stringify({session_id:sid}))+'.signature'
test('new credential actions enforce confirmation, authenticated binding and safe responses without PIN logging',async()=>{
 let calls=[],rawError=false
 const factory=()=>({auth:{getUser:async()=>({data:{user:{id:hid}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:hid}})}),rpc:async(name,args)=>{
  calls.push({name,args});if(rawError)throw new Error('PIN 6248 hash salt secret bearer '+token)
  return {data:{allowed:true,expiresIn:900,pin_hash:'secret',pin_salt:'secret',ticket:pid}}
 }})
 const handler=profileAccessHandler({url:'https://example.supabase.co',anonKey:'public',serviceRoleKey:'private-key',allowedOrigins:['http://localhost:5173']},factory)
 const request=body=>new Request('https://edge.invalid',{method:'POST',headers:{origin:'http://localhost:5173',authorization:'Bearer '+token},body:JSON.stringify({householdId:hid,...body})})
 const logs=[],originals=['log','warn','error','info'].map(k=>[k,console[k]])
 originals.forEach(([k])=>{console[k]=(...args)=>logs.push(args)})
 try{
  for(const action of ['save','change','manage']){
   const r=await handler(request({action,operation:'set',profileId:pid,caregiverId:pid,changeToken:pid,profile:{id:pid,household_id:hid,name:'Fictional',role:'caregiver',active:true},pin:'6248',confirmPin:'6249'}))
   assert.equal(r.status,400)
  }
  assert.equal(calls.length,0,'mismatched confirmation does not touch the database')
  const profile={id:pid,household_id:hid,name:'Fictional',role:'caregiver',active:true}
  const r=await handler(request({action:'save',profile,pin:'6248',confirmPin:'6248'}));assert.deepEqual(await r.json(),{saved:true})
  assert.equal(calls[0].name,'save_caregiver_profile');assert.equal(calls[0].args.uid,hid)
  assert.match(calls[0].args.new_hash,/^[a-f0-9]{64}$/);assert.match(calls[0].args.new_salt,/^[a-f0-9]{64}$/)
  assert.ok(!Object.hasOwn(calls[0].args,'pin'))
  assert.deepEqual(await (await handler(request({action:'change',profileId:pid,caregiverId:pid,changeToken:pid,pin:'6248',confirmPin:'6248'}))).json(),{allowed:true,expiresIn:900})
  assert.equal(calls[1].name,'complete_caregiver_pin_change');assert.equal(calls[1].args.sid,sid)
  for(const operation of ['reset','require_change'])assert.deepEqual(await (await handler(request({action:'manage',caregiverId:pid,operation}))).json(),{saved:true})
  rawError=true;const failed=await handler(request({action:'manage',caregiverId:pid,operation:'reset'}));assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'profile_access_unavailable'})
  assert.deepEqual(logs,[])
 }finally{originals.forEach(([k,v])=>{console[k]=v})}
 assert.deepEqual(safeResult({allowed:false,reason:'change_required',changeToken:pid,pin_hash:'secret',pin_salt:'secret',ticket:pid}),{allowed:false,reason:'change_required',changeToken:pid})
 assert.deepEqual(safeResult({allowed:false,reason:'incorrect',changeToken:pid}),{allowed:false,reason:'incorrect'})
})
