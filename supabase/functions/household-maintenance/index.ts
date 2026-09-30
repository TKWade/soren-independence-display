import {createClient} from '@supabase/supabase-js'
import {cleanupImages} from '../../../server/calendar/imageCleanup.ts'
import {parseAllowedOrigins} from '../../../server/calendar/configuration.ts'
const origins=parseAllowedOrigins(Deno.env.get('CALENDAR_ALLOWED_ORIGINS')??'')
Deno.serve(async request=>{
 const origin=request.headers.get('origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin',...(origin&&origins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'}:{})}
 const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers})
 if(origin&&!origins.includes(origin))return reply(403,{error:'not_authorized'})
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers})
 if(request.method!=='POST')return reply(405,{error:'method_not_allowed'})
 try {
  const authorization=request.headers.get('authorization')??''
  const viewer=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}})
  const {data,error}=await viewer.auth.getUser(authorization.replace(/^Bearer /,''));if(error||!data.user)return reply(401,{error:'sign_in_required'})
  const {householdId}=await request.json()
  const membership=await viewer.from('household_members').select('id').eq('household_id',householdId).eq('user_id',data.user.id).maybeSingle()
  if(membership.error||!membership.data)return reply(403,{error:'not_authorized'})
  const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
  return reply(200,await cleanupImages(service,householdId))
 } catch {return reply(503,{error:'cleanup_pending'})}
})
