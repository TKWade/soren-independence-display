import {createClient} from '@supabase/supabase-js'
import {validateAllowedOrigins} from '../calendar/configuration.ts'
import {hashPin,validPin,verifyPin} from './pin.ts'
interface Config {url:string;anonKey:string;serviceRoleKey:string;allowedOrigins:string[]}
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
/** Read session_id only AFTER getUser verifies the bearer; never accept a caller-supplied identity. */
export function verifiedSessionId(token:string):string|null {
 try {const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));return uuid(claims.session_id)?claims.session_id:null}catch{return null}
}
export function profileAccessHandler(config:Config,factory:typeof createClient=createClient) {
 validateAllowedOrigins(config.allowedOrigins)
 return async(request:Request)=>{
  const origin=request.headers.get('origin'),headers:Record<string,string>={'Cache-Control':'no-store','Vary':'Origin'}
  if(origin&&config.allowedOrigins.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'})
  const reply=(status:number,body:unknown)=>Response.json(body,{status,headers})
  if(origin&&!config.allowedOrigins.includes(origin))return reply(403,{error:'not_authorized'})
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'})
  try {
   const authorization=request.headers.get('authorization')??''
   if(!authorization.startsWith('Bearer '))return reply(401,{error:'sign_in_required'})
   const viewer=factory(config.url,config.anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}})
   const {data,error}=await viewer.auth.getUser(authorization.slice(7))
   if(error||!data.user)return reply(401,{error:'sign_in_required'})
   const sid=verifiedSessionId(authorization.slice(7));if(!sid)return reply(401,{error:'sign_in_required'})
   // Bound the request body before parsing. Never log body, PIN, bearer or thrown exceptions.
   const raw=await request.text();if(raw.length>16384)return reply(400,{error:'invalid_request'})
   const body=JSON.parse(raw)
   if(!uuid(body.householdId)||!['configure','verify','manage','save','change'].includes(body.action))return reply(400,{error:'invalid_request'})
   const {data:member,error:denied}=await viewer.from('household_members').select('id').eq('household_id',body.householdId).eq('user_id',data.user.id).maybeSingle()
   if(denied||!member)return reply(403,{error:'not_authorized'})
   const service=factory(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}})
   const hid=body.householdId,uid=data.user.id
   if(body.action==='configure') {
    const settings=body.settings
    if(!settings||typeof settings.allowChildToChildSwitching!=='boolean'||typeof settings.requirePinForAllProfileSwitches!=='boolean')return reply(400,{error:'invalid_request'})
    const {error}=await service.rpc('configure_display_security',{hid,uid,settings:{allowChildToChildSwitching:settings.allowChildToChildSwitching,requirePinForAllProfileSwitches:settings.requirePinForAllProfileSwitches}})
    if(error)throw error
    return reply(200,{saved:true})
   }
   if(body.action==='save'||body.action==='manage'||body.action==='change') {
    const needsPin=body.action!=='manage'||body.operation==='set'
    if(needsPin&&(!validPin(body.pin)||body.pin!==body.confirmPin))return reply(400,{error:'invalid_request'})
    const encoded=needsPin?await hashPin(body.pin):undefined
    const parts=encoded?.split('$')
    const credential={new_hash:parts?.[3]??null,new_salt:parts?.[2]??null}
    if(body.action==='save') {
     const payload=body.profile
     if(!payload||!uuid(payload.id)||payload.household_id!==hid||payload.role!=='caregiver'||typeof payload.name!=='string'||!payload.name.trim()||payload.name.length>100||typeof payload.active!=='boolean')return reply(400,{error:'invalid_request'})
     const {error}=await service.rpc('save_caregiver_profile',{hid,uid,payload,...credential});if(error)throw error
     return reply(200,{saved:true})
    }
    if(!uuid(body.caregiverId))return reply(400,{error:'invalid_request'})
    const cid=body.caregiverId
    if(body.action==='manage') {
     if(!['set','reset','require_change'].includes(body.operation))return reply(400,{error:'invalid_request'})
     const {error}=await service.rpc('manage_caregiver_pin',{hid,uid,cid,operation:body.operation,...credential});if(error)throw error
     return reply(200,{saved:true})
    }
    if(!uuid(body.profileId)||!uuid(body.changeToken))return reply(400,{error:'invalid_request'})
    const {data:result,error}=await service.rpc('complete_caregiver_pin_change',{hid,uid,sid,pid:body.profileId,cid,token:body.changeToken,...credential});if(error)throw error
    return reply(200,safeResult(result))
   }
   if(!uuid(body.profileId)||!uuid(body.caregiverId)||!validPin(body.pin))return reply(400,{error:'invalid_request'})
   const pid=body.profileId,cid=body.caregiverId
   const {data:attempt,error:startError}=await service.rpc('begin_caregiver_pin',{hid,uid,sid,pid,cid})
   if(startError)throw startError
   if(!attempt?.allowed)return reply(200,safeResult(attempt))
   const verified=await verifyPin(body.pin,attempt.hash)
   const {data:result,error:finishError}=await service.rpc('finish_caregiver_pin',{hid,uid,sid,pid,cid,token:attempt.ticket,version:attempt.version,revision:attempt.revision,verified})
   if(finishError)throw finishError
   return reply(200,safeResult(result))
  }catch{return reply(503,{error:'profile_access_unavailable'})}
 }
}
/** Explicit allowlist so internal RPC fields can never escape to the browser. */
export function safeResult(value:unknown) {
 const result=value as {allowed?:unknown;reason?:unknown;retryAfter?:unknown;expiresIn?:unknown;changeToken?:unknown}|null
 if(result?.allowed===true)return {allowed:true,...(typeof result.expiresIn==='number'?{expiresIn:Math.max(0,Math.min(900,Math.floor(result.expiresIn)))}:{})}
 const reason=['incorrect','retry','pin_not_configured','unavailable','change_required'].includes(String(result?.reason))?String(result?.reason):'unavailable'
 return {allowed:false,reason,...(reason==='change_required'&&uuid(result?.changeToken)?{changeToken:result.changeToken}:{}),...(typeof result?.retryAfter==='number'?{retryAfter:Math.min(60,Math.max(0,Math.ceil(result.retryAfter)))}:{})}
}
