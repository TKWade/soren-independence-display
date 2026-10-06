import {createClient} from '@supabase/supabase-js'
import {validateAllowedOrigins} from '../calendar/configuration.ts'
import type {WeatherProvider} from './provider.ts'
import {refreshWeather} from './service.ts'
interface Config {url:string;anonKey:string;serviceRoleKey:string;allowedOrigins:string[];schedulerSecret:string}
export function weatherHandler(config:Config,provider:WeatherProvider,scheduled=false,defer?:(task:Promise<unknown>)=>void) {
 validateAllowedOrigins(config.allowedOrigins)
 return async(request:Request)=>{
  const origin=request.headers.get('origin'),headers:Record<string,string>={'Cache-Control':'no-store','Vary':'Origin'}
  if(origin&&config.allowedOrigins.includes(origin))Object.assign(headers,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'})
  const reply=(status:number,body:unknown)=>Response.json(body,{status,headers})
  if(origin&&!config.allowedOrigins.includes(origin))return reply(403,{error:'not_authorized'})
  if(!scheduled&&request.method==='OPTIONS')return new Response(null,{status:204,headers})
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'})
  try {
   if(scheduled){
    const digest=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))
    const [a,b]=await Promise.all([digest(request.headers.get('x-weather-scheduler-secret')??''),digest(config.schedulerSecret)])
    let different=0;for(let i=0;i<a.length;i++)different|=a[i]^b[i]
    if(config.schedulerSecret.length<32||different)return reply(401,{error:'not_authorized'})
    if((await request.text()).trim()!=='{}')return reply(400,{error:'invalid_request'})
   }
   const authorization=request.headers.get('authorization')??''
   let body:Record<string,unknown>={}
   if(!scheduled){
    if(!authorization.startsWith('Bearer '))return reply(401,{error:'sign_in_required'})
    const viewer=createClient(config.url,config.anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}})
    const {data,error}=await viewer.auth.getUser(authorization.slice(7));if(error||!data.user)return reply(401,{error:'sign_in_required'})
    body=await request.json()
    if(typeof body.householdId!=='string'||!['search','configure','refresh'].includes(String(body.action)))return reply(400,{error:'invalid_request'})
    const {data:member,error:denied}=await viewer.from('household_members').select('id').eq('household_id',body.householdId).eq('user_id',data.user.id).maybeSingle()
    if(denied||!member)return reply(403,{error:'not_authorized'})
   }
   const service=createClient(config.url,config.serviceRoleKey,{auth:{persistSession:false,autoRefreshToken:false}})
   if(scheduled){
    const work=async()=>{let processed=0,failed=0;for(let batch=0;batch<5;batch++){const r=await refreshWeather(service,provider);processed+=r.processed;failed+=r.failed;if(r.processed<10)break}console.info(JSON.stringify({event:'weather_refresh_complete',processed,failed}));return {processed,failed}}
    if(defer){defer(work().catch(()=>console.error('Weather worker unavailable')));return reply(202,{accepted:true})}
    return reply(200,await work())
   }
   const hid=body.householdId as string
   if(body.action==='search'){
    if(typeof body.query!=='string'||body.query.trim().length<2||body.query.length>120)return reply(400,{error:'invalid_location'})
    return reply(200,{locations:await provider.search(body.query.trim())})
   }
   if(body.action==='configure'){
    const s=body.settings as {enabled?:unknown;location?:{label?:unknown;latitude?:unknown;longitude?:unknown}|null;temperature_unit?:unknown}|undefined
    const l=s?.location
    if(!s||typeof s.enabled!=='boolean'||!['fahrenheit','celsius'].includes(String(s.temperature_unit))||(!l&&s.enabled)||l&&(typeof l.label!=='string'||!l.label.trim()||l.label.length>200||typeof l.latitude!=='number'||!Number.isFinite(l.latitude)||Math.abs(l.latitude)>90||typeof l.longitude!=='number'||!Number.isFinite(l.longitude)||Math.abs(l.longitude)>180))return reply(400,{error:'invalid_settings'})
    const {error}=await service.rpc('configure_household_weather',{hid,settings:{enabled:s.enabled,location:l??null,temperature_unit:s.temperature_unit}});if(error)throw error
    if(!s.enabled)return reply(200,{saved:true})
   }
   const result=await refreshWeather(service,provider,hid)
   return reply(200,{...result,saved:body.action==='configure'})
  }catch{return reply(503,{error:'weather_unavailable'})}
 }
}
