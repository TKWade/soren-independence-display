import test from 'node:test'
import assert from 'node:assert/strict'
import {database,asUser,userA,userB} from './fixtures/database.mjs'
import {hashPin,verifyPin} from '../server/profiles/pin.ts'
const sid='00000000-0000-4000-8000-000000000099',otherSid='00000000-0000-4000-8000-000000000098'
test('profile access migration: server policy, PIN tickets/backoff, direct navigation, session binding and private credentials',async()=>{
 const db=await database('legacy-profile')
 try {
  await asUser(db,userA)
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid})])
  const hid=(await db.query("select public.create_household('Profiles','America/Chicago') id")).rows[0].id
  const add=async(name,role='child',active=true)=>(await db.query('insert into public.profiles(household_id,name,role,active) values($1,$2,$3,$4) returning id',[hid,name,role,active])).rows[0].id
  const child=await add('Caregiver named but actually child'),sibling=await add('Sibling','sibling'),caregiver=await add('Adult','caregiver'),otherProfile=await add('Other','other'),inactive=await add('Archived','child',false)
  const authorize=async(pid)=>(await db.query('select public.authorize_display_profile($1,$2) r',[hid,pid])).rows[0].r
  const context=async()=>(await db.query('select public.display_profile_context($1) r',[hid])).rows[0].r
  assert.equal((await db.query('select role from public.profiles where id=$1',[child])).rows[0].role,'child')
  assert.deepEqual(await authorize(child),{allowed:true});assert.deepEqual(await authorize(sibling),{allowed:true});assert.deepEqual(await authorize(child),{allowed:true})
  const legacyPreferences=(await db.query('select preferences from public.profile_display_preferences where profile_id=$1',[caregiver])).rows[0].preferences
  await db.query('select public.save_display_profile($1)',[{id:caregiver,household_id:hid,name:'Adult',active:true,preferences:legacyPreferences}])
  assert.equal((await db.query('select role from public.profiles where id=$1',[caregiver])).rows[0].role,'caregiver','an older client omitting role must not remove protection')
  assert.equal((await authorize(caregiver)).reason,'pin_not_configured')
  assert.equal((await authorize(inactive)).reason,'unavailable')
  assert.ok(!(await context()).authorization.allowedProfileIds.includes(inactive))
  for(const table of ['household_display_security','display_pin_attempts','display_profile_access'])await assert.rejects(db.query('select * from private.'+table),/permission denied/)
  await assert.rejects(db.query('select public.begin_display_pin($1,$2,$3,$4)',[hid,userA,sid,caregiver]),/permission denied/)
  await db.exec('reset role;set role service_role;')
  const hash=await hashPin('7391')
  const configure=async(all=false,children=true,newHash=hash)=>db.query('select public.configure_display_security($1,$2,$3,$4)',[hid,userA,{allowChildToChildSwitching:children,requirePinForAllProfileSwitches:all},newHash])
  await configure()
  const begin=async(pid=caregiver,session=sid)=>(await db.query('select public.begin_display_pin($1,$2,$3,$4) r',[hid,userA,session,pid])).rows[0].r
  const finish=async(attempt,success,pid=caregiver,session=sid)=>(await db.query('select public.finish_display_pin($1,$2,$3,$4,$5,$6,$7) r',[hid,userA,session,pid,attempt.ticket,attempt.revision,success])).rows[0].r
  const first=await begin();assert.equal(first.allowed,true);assert.equal(await verifyPin('0000',first.hash),false)
  assert.equal((await finish(first,false)).reason,'incorrect')
  assert.equal((await begin()).reason,'retry')
  assert.equal((await finish(first,true)).allowed,false,'consumed failed ticket cannot be replayed')
  await db.exec('reset role;update private.display_pin_attempts set next_attempt_at=now();set role service_role;')
  const correct=await begin();assert.equal(await verifyPin('7391',correct.hash),true)
  assert.equal((await finish(correct,true,caregiver,otherSid)).allowed,false)
  assert.equal((await finish(correct,true)).allowed,true)
  assert.equal((await finish(correct,true)).allowed,false)
  await asUser(db,userA)
  assert.equal((await authorize(caregiver)).allowed,true)
  assert.equal((await authorize(child)).allowed,true)
  assert.equal((await authorize(caregiver)).reason,'pin_required','URL change after leaving caregiver is gated')
  assert.doesNotMatch(JSON.stringify(await context()),/pin_hash|pbkdf2|7391|ticket/)
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:otherSid})])
  assert.equal((await authorize(caregiver)).reason,'pin_required')
  await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({session_id:sid})])
  await db.exec('reset role;set role service_role;');await configure(true)
  await asUser(db,userA);assert.equal((await authorize(child)).reason,'pin_required')
  await db.exec('reset role;set role service_role;');await configure(false,false)
  await asUser(db,userA);assert.equal((await authorize(child)).reason,'pin_required')
  await db.exec('reset role;set role service_role;');const adult=await begin();await finish(adult,true)
  await asUser(db,userA);assert.equal((await authorize(child)).allowed,true,'caregiver may leave for unprotected child')
  assert.equal((await authorize(sibling)).reason,'pin_required')
  assert.equal((await authorize(otherProfile)).allowed,true)
  assert.equal((await authorize(sibling)).reason,'pin_required','Other cannot be a hop around disabled child switching')
  await db.exec('reset role;set role service_role;');await configure()
  for(let i=0;i<5;i++) {
   const attempt=await begin();assert.equal(attempt.allowed,true);await finish(attempt,false)
   if(i<4)await db.exec('reset role;update private.display_pin_attempts set next_attempt_at=now();set role service_role;')
  }
  const retry=await begin();assert.equal(retry.reason,'retry');assert.ok(retry.retryAfter>=4&&retry.retryAfter<=5)
  // Server never permanently locks the household; time passing permits another attempt.
  await db.exec('reset role;update private.display_pin_attempts set next_attempt_at=now();set role service_role;');assert.equal((await begin()).allowed,true)
  await configure();const expiring=await begin();await finish(expiring,true)
  await db.exec("reset role;update private.display_profile_access set pin_until=now()-interval '1 second';")
  await asUser(db,userA);assert.equal((await authorize(caregiver)).reason,'pin_required')
  await db.exec('reset role;set role service_role;');await configure();const changed=await begin();await configure()
  assert.equal((await finish(changed,true)).allowed,false,'changing PIN/policy invalidates in-flight tickets')
  const renamed=await begin();await finish(renamed,true)
  await asUser(db,userA);await db.query("update public.profiles set role='other' where id=$1",[caregiver]);await db.query("update public.profiles set role='caregiver' where id=$1",[caregiver]);assert.equal((await authorize(caregiver)).reason,'pin_required')
  // Shared profile photos participate in the existing cleanup lease/fence.
  const image=hid+'/images/fictional/display.png'
  await db.query('update public.profiles set image_path=$1 where id=any($2::uuid[])',[image,[child,sibling]])
  await db.query('update public.profiles set image_path=null where id=$1',[child])
  await db.exec('reset role;set role service_role;')
  assert.deepEqual((await db.query('select public.claim_image_cleanup($1) r',[hid])).rows[0].r,[])
  await asUser(db,userA);await db.query('update public.profiles set image_path=null where id=$1',[sibling])
  await db.exec('reset role;set role service_role;');assert.deepEqual((await db.query('select public.claim_image_cleanup($1) r',[hid])).rows[0].r,[image])
  await asUser(db,userA);await assert.rejects(db.query('update public.profiles set image_path=$1 where id=$2',[image,child]),/Image no longer available/)
  await db.exec('reset role;set role service_role;');await db.query('select public.finish_image_cleanup($1)',[[image]])
  await asUser(db,userA);const deletedImage=hid+'/images/fictional/deleted-profile.png'
  await db.query('update public.profiles set image_path=$1 where id=$2',[deletedImage,otherProfile])
  await db.query('select public.delete_owned_record($1,$2,$3,$4)',[hid,'profiles',otherProfile,'Other'])
  await db.exec('reset role;set role service_role;');assert.deepEqual((await db.query('select public.claim_image_cleanup($1) r',[hid])).rows[0].r,[deletedImage])
  await asUser(db,userB);assert.equal((await authorize(child)).allowed,false);await assert.rejects(context(),/Not authorized/)
  const other=(await db.query("select public.create_household('Other','UTC') id")).rows[0].id
  const foreign=(await db.query("insert into public.profiles(household_id,name) values($1,'Other') returning id",[other])).rows[0].id
  await asUser(db,userA);assert.equal((await authorize(foreign)).allowed,false)
  await db.exec('reset role;set role service_role;')
  assert.equal((await db.query('select public.begin_display_pin($1,$2,$3,$4) r',[other,userA,sid,foreign])).rows[0].r.allowed,false)
  await db.exec('reset role;set role anon;');await assert.rejects(context(),/permission denied/)
 }finally{await db.close()}
})
