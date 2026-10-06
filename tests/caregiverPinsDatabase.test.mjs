import test from 'node:test'
import assert from 'node:assert/strict'
import {database,applyMigration,asUser,userA,userB} from './fixtures/database.mjs'
import {hashPin,verifyPin} from '../server/profiles/pin.ts'
import {defaultDisplayPreferences} from '../src/display/preferences.ts'
const sid='00000000-0000-4000-8000-000000000099',sid2='00000000-0000-4000-8000-000000000098'
const migration='202610050001_caregiver_profile_pins.sql'
const split=hash=>({hash:hash.split('$')[3],salt:hash.split('$')[2]})
async function fixture(){
 const db=await database();await asUser(db,userA)
 await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid})])
 const hid=(await db.query("select public.create_household('Fictional','America/Chicago') id")).rows[0].id
 const add=async name=>(await db.query('insert into public.profiles(household_id,name) values($1,$2) returning id',[hid,name])).rows[0].id
 const child=await add('Child'),sibling=await add('Sibling')
 const service=()=>db.exec('reset role;set role service_role;')
 const owner=()=>asUser(db,userA)
 const rpc=async(name,args)=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args)).rows[0].r
 const create=async(name,pin)=>{
  const id=crypto.randomUUID(),k=split(await hashPin(pin));await service()
  await rpc('save_caregiver_profile',[hid,userA,{id,household_id:hid,name,role:'caregiver',active:true,preferences:defaultDisplayPreferences()},k.hash,k.salt]);return id
 }
 const tyler=await create('Tyler','7391'),sheri=await create('Sheri','8426')
 const begin=async(cid,pid=cid,session=sid)=>{await service();return rpc('begin_caregiver_pin',[hid,userA,session,pid,cid])}
 const finish=async(a,cid,pin,pid=cid,session=sid)=>{await service();return rpc('finish_caregiver_pin',[hid,userA,session,pid,cid,a.ticket,a.version,a.revision,await verifyPin(pin,a.hash)])}
 const unlock=async(cid,pin,pid=cid)=>finish(await begin(cid,pid),cid,pin,pid)
 const manage=async(cid,op,pin)=>{await service();const k=pin?split(await hashPin(pin)):{};await rpc('manage_caregiver_pin',[hid,userA,cid,op,k.hash??null,k.salt??null])}
 const authorize=async pid=>{await owner();return rpc('authorize_display_profile',[hid,pid])}
 const clearDelay=async()=>{await db.exec('reset role;update private.caregiver_pin_attempts set next_attempt_at=now();')}
 return {db,hid,child,sibling,tyler,sheri,service,owner,rpc,begin,finish,unlock,manage,authorize,clearDelay}
}
test('caregiver credentials: cross-PIN rejection, isolated backoff, session/target binding and replay',async()=>{
 const f=await fixture();const {db,tyler,sheri}=f
 try{
  assert.equal((await f.unlock(tyler,'8426')).reason,'incorrect')
  assert.equal((await f.begin(tyler)).reason,'retry')
  assert.equal((await f.unlock(sheri,'7391')).reason,'incorrect')
  await f.clearDelay();const a=await f.begin(sheri)
  assert.equal((await f.finish(a,sheri,'8426',tyler)).allowed,false)
  assert.equal((await f.finish(a,sheri,'8426',sheri,sid2)).allowed,false)
  assert.equal((await f.finish(a,sheri,'8426')).allowed,true)
  assert.equal((await f.finish(a,sheri,'8426')).allowed,false)
  assert.equal((await f.authorize(sheri)).allowed,true)
  assert.equal((await f.authorize(tyler)).allowed,false,'Sheri grant cannot unlock Tyler URL')
  assert.equal((await f.unlock(tyler,'7391')).allowed,true)
  await f.service();assert.equal((await f.rpc('begin_caregiver_pin',[f.hid,userB,sid,tyler,tyler])).allowed,false)
  assert.equal((await f.rpc('begin_caregiver_pin',[f.hid,userA,sid,tyler,sheri])).allowed,false)
  await f.owner();const context=await f.rpc('display_profile_context',[f.hid])
  assert.deepEqual(context.caregivers[tyler],{configured:true,changeRequired:false})
  assert.doesNotMatch(JSON.stringify(context),/hash|salt|ticket|7391|8426|pbkdf2/)
  for(const table of ['caregiver_profile_credentials','caregiver_pin_attempts','caregiver_display_grants'])await assert.rejects(db.query('select * from private.'+table),/permission denied/)
  await assert.rejects(f.rpc('manage_caregiver_pin',[f.hid,userA,tyler,'reset',null,null]),/permission denied/)
  await asUser(db,userB);await assert.rejects(f.rpc('display_profile_context',[f.hid]),/Not authorized/)
  await db.exec('reset role;set role anon;');await assert.rejects(f.rpc('display_profile_context',[f.hid]),/permission denied/)
 }finally{await db.close()}
})
test('forced change/reset is caregiver-only, short-lived, one-use, versioned and invalidates only its grants',async()=>{
 const f=await fixture();const {db,tyler,sheri}=f
 try{
  await f.unlock(tyler,'7391');await f.unlock(sheri,'8426');await f.manage(sheri,'require_change')
  assert.equal((await f.authorize(tyler)).allowed,true);assert.equal((await f.authorize(sheri)).allowed,false)
  const old=await f.begin(sheri),flow=await f.finish(old,sheri,'8426')
  assert.equal(flow.reason,'change_required');assert.ok(flow.changeToken)
  assert.equal((await f.finish(old,sheri,'8426')).allowed,false)
  const k=split(await hashPin('9517'));await f.service()
  const args=[f.hid,userA,sid,sheri,sheri,flow.changeToken,k.hash,k.salt]
  assert.equal((await f.rpc('complete_caregiver_pin_change',[...args.slice(0,2),sid2,...args.slice(3)])).allowed,false)
  assert.equal((await f.rpc('complete_caregiver_pin_change',args)).allowed,true)
  assert.equal((await f.rpc('complete_caregiver_pin_change',args)).allowed,false)
  assert.equal((await f.authorize(tyler)).allowed,true)
  await f.manage(sheri,'reset');assert.equal((await f.authorize(sheri)).reason,'pin_not_configured');assert.equal((await f.authorize(tyler)).allowed,true)
  await db.exec('reset role;');const row=(await db.query('select * from private.caregiver_profile_credentials where profile_id=$1',[sheri])).rows[0]
  assert.equal(row.pin_version,4);assert.equal(row.pin_hash,null);assert.equal(row.pin_salt,null)
  await f.manage(sheri,'set','9517');await f.manage(sheri,'require_change');const next=await f.finish(await f.begin(sheri),sheri,'9517')
  await db.exec("reset role;update private.caregiver_pin_attempts set change_until=now()-interval '1 second';")
  await f.service();assert.equal((await f.rpc('complete_caregiver_pin_change',[f.hid,userA,sid,sheri,sheri,next.changeToken,k.hash,k.salt])).allowed,false)
 }finally{await db.close()}
})
test('atomic caregiver creation/conversion, role downgrade cleanup, lock-all accepts either caregiver and household fencing',async()=>{
 const f=await fixture();const {db,hid,child,sibling,tyler,sheri}=f
 try{
  await f.owner()
  await assert.rejects(db.query("insert into public.profiles(household_id,name,role) values($1,'Missing','caregiver')",[hid]),/PIN setup required/)
  assert.equal((await db.query("select count(*)::int n from public.profiles where name='Missing'")).rows[0].n,0)
  await assert.rejects(db.query("update public.profiles set role='caregiver' where id=$1",[child]),/PIN setup required/)
  assert.equal((await db.query('select role from public.profiles where id=$1',[child])).rows[0].role,'child')
  await f.service();await f.rpc('configure_display_security',[hid,userA,{allowChildToChildSwitching:true,requirePinForAllProfileSwitches:true}])
  assert.equal((await f.authorize(sibling)).reason,'pin_required')
  assert.equal((await f.unlock(tyler,'7391',sibling)).allowed,true);assert.equal((await f.authorize(sibling)).allowed,true)
  assert.equal((await f.unlock(sheri,'8426',child)).allowed,true);assert.equal((await f.authorize(child)).allowed,true)
  await f.owner();await db.query("update public.profiles set role='child' where id=$1",[sheri])
  await db.exec('reset role;');assert.equal((await db.query('select count(*)::int n from private.caregiver_profile_credentials where profile_id=$1',[sheri])).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from private.caregiver_display_grants where caregiver_id=$1',[sheri])).rows[0].n,0)
  assert.equal((await f.authorize(child)).reason,'pin_required');assert.equal((await f.authorize(sibling)).allowed,true)
  // Convert back using the same atomic server operation, never a separate role-write and credential-write.
  const k=split(await hashPin('6248'));await f.service()
  await f.rpc('save_caregiver_profile',[hid,userA,{id:sheri,household_id:hid,name:'Sheri',role:'caregiver',active:true,preferences:defaultDisplayPreferences()},k.hash,k.salt])
  assert.equal((await f.unlock(sheri,'6248')).allowed,true)
  await asUser(db,userB);const foreign=(await db.query("select public.create_household('Other','UTC') id")).rows[0].id
  await f.service();await assert.rejects(f.rpc('manage_caregiver_pin',[foreign,userA,tyler,'reset',null,null]),/Not authorized/)
  await assert.rejects(f.rpc('save_caregiver_profile',[foreign,userB,{id:tyler,household_id:foreign,name:'Other',role:'caregiver',active:true,preferences:defaultDisplayPreferences()},k.hash,k.salt]),/Not authorized/)
 }finally{await db.close()}
})
test('legacy household PIN migration assigns only an unambiguous single caregiver, never zero/multiple',async()=>{
 const db=await database('legacy-profile')
 try{
  const original=await hashPin('7391'),households=[]
  for(const count of [0,1,2]){
   await asUser(db,userA);const hid=(await db.query("select public.create_household('Legacy','UTC') id")).rows[0].id,ids=[]
   for(let i=0;i<count;i++)ids.push((await db.query("insert into public.profiles(household_id,name,role) values($1,'Legacy','caregiver') returning id",[hid])).rows[0].id)
   await db.exec('reset role;set role service_role;');await db.query('select public.configure_display_security($1,$2,$3,$4)',[hid,userA,{allowChildToChildSwitching:true,requirePinForAllProfileSwitches:false},original]);households.push({hid,ids})
  }
  await db.exec('reset role;');await applyMigration(db,migration)
  const credentials=(await db.query('select * from private.caregiver_profile_credentials')).rows
  assert.equal(credentials.length,1);assert.equal(credentials[0].profile_id,households[1].ids[0]);assert.equal(credentials[0].pin_hash,split(original).hash);assert.equal(credentials[0].pin_salt,split(original).salt)
  assert.equal(await verifyPin('7391',`pbkdf2-sha256$600000$${credentials[0].pin_salt}$${credentials[0].pin_hash}`),true)
  await asUser(db,userA);await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid})])
  for(const id of households[2].ids)assert.equal((await db.query('select public.authorize_display_profile($1,$2) r',[households[2].hid,id])).rows[0].r.reason,'pin_not_configured')
  await assert.rejects(db.query('select pin_hash from private.household_display_security'),/column .* does not exist/)
 }finally{await db.close()}
})
