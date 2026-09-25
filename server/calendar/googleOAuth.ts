import type { SupabaseClient } from '@supabase/supabase-js'
import { GOOGLE_SCOPES, GoogleCalendarAdapter, googleToken, type GoogleConfig, type HttpFetch } from './google.ts'
import { privateRpc } from './googleCredentials.ts'
export const randomSecret=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),v=>v.toString(16).padStart(2,'0')).join('')
export async function hashSecret(value:string) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),v=>v.toString(16).padStart(2,'0')).join('')}
export async function pkceChallenge(verifier:string) {return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','')}
export function validateGoogleConfig(config:GoogleConfig) {
 const redirect=new URL(config.redirectUri),back=new URL(config.returnUrl)
 if(!config.clientId||!config.clientSecret||redirect.protocol!=='https:'||!redirect.pathname.endsWith('/google-oauth/callback')||redirect.search||redirect.hash||back.username||back.password||!(back.protocol==='https:'||(back.protocol==='http:'&&back.hostname==='localhost'))) throw new Error('Google OAuth is not configured')
}
export async function beginGoogleOAuth(service:SupabaseClient,config:GoogleConfig,householdId:string,userId:string) {
 validateGoogleConfig(config)
 const ticket=randomSecret()
 await privateRpc(service,'begin',{householdId,userId,ticketHash:await hashSecret(ticket),verifier:randomSecret()})
 const url=new URL(config.redirectUri);url.pathname=url.pathname.replace(/callback$/,'start');url.search=new URLSearchParams({ticket}).toString()
 return {authorizationUrl:url.toString()}
}
/** Public callback verifies a one-use state plus a browser-bound HttpOnly cookie before exchanging a code. */
export function googleOAuthHandler(service:SupabaseClient,config:GoogleConfig,http:HttpFetch=fetch) {
 return async(request:Request):Promise<Response>=>{
  const headers=new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'})
  const redirect=(url:string)=>{headers.set('Location',url);return new Response(null,{status:303,headers})}
  if(!['GET','POST'].includes(request.method)) return new Response('Method not allowed',{status:405,headers})
  try {
   validateGoogleConfig(config)
   const url=new URL(request.url)
   if(url.pathname.endsWith('/start')) {
        // An authenticated, same-app POST prevents a copied kickoff URL from linking a victim's Google account.
    if(request.method!=='POST'||request.headers.get('origin')!==new URL(config.returnUrl).origin) throw new Error('Invalid OAuth origin')
    const form=await request.formData(),appToken=String(form.get('access_token')??'')
    const {data:auth,error}=await service.auth.getUser(appToken)
    if(error||!auth.user) throw new Error('Sign in required')
    const ticket=String(form.get('ticket')??'');if(!/^[a-f0-9]{64}$/.test(ticket)) throw new Error('Invalid ticket')
    const state=randomSecret(),binding=randomSecret(),stateHash=await hashSecret(state)
    const pending=await privateRpc<{verifier:string}>(service,'start',{ticketHash:await hashSecret(ticket),stateHash,bindingHash:await hashSecret(binding),userId:auth.user.id})
    headers.set('Set-Cookie',`__Host-gcal-${stateHash.slice(0,16)}=${binding}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`)
    const google=new URL('https://accounts.google.com/o/oauth2/v2/auth')
    google.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:'code',scope:GOOGLE_SCOPES.join(' '),access_type:'offline',prompt:'consent select_account',state,code_challenge:await pkceChallenge(pending.verifier),code_challenge_method:'S256'}).toString()
    return redirect(google.toString())
   }
   if(request.method!=='GET'||!url.pathname.endsWith('/callback')) return new Response('Not found',{status:404,headers})
   const state=url.searchParams.get('state')??'';if(!/^[a-f0-9]{64}$/.test(state)) throw new Error('Invalid state')
   const stateHash=await hashSecret(state),cookieName=`__Host-gcal-${stateHash.slice(0,16)}`
   const binding=(request.headers.get('cookie')??'').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)??''
   if(!/^[a-f0-9]{64}$/.test(binding)) throw new Error('Invalid browser binding')
   headers.set('Set-Cookie',`${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`)
   const pending=await privateRpc<{id:string;verifier:string}>(service,'consume',{stateHash,bindingHash:await hashSecret(binding)})
   if(url.searchParams.has('error')||!url.searchParams.get('code')) throw new Error('Consent not granted')
   const tokens=await googleToken(config,{grant_type:'authorization_code',code:url.searchParams.get('code')!,redirect_uri:config.redirectUri,code_verifier:pending.verifier},http)
   if(!tokens.refresh_token||!GOOGLE_SCOPES.every(scope=>(tokens.scope??'').split(' ').includes(scope))) throw new Error('Required offline permissions not granted')
   const calendars=await new GoogleCalendarAdapter(tokens.access_token,http).discover()
   const account=calendars.find(c=>c.primary)?.externalCalendarId
   if(!account) throw new Error('Google primary account calendar missing')
   const connected=await privateRpc<{householdId:string}>(service,'finish',{pendingId:pending.id,account,refreshToken:tokens.refresh_token,calendars})
   const back=new URL(config.returnUrl);back.searchParams.set('googleCalendar','connected');if(connected.householdId) back.searchParams.set('household',connected.householdId);return redirect(back.toString())
  } catch {
   // No codes, provider errors, OAuth state or credentials in redirects/responses/logs.
   try {validateGoogleConfig(config);const back=new URL(config.returnUrl);back.searchParams.set('googleCalendar','failed');return redirect(back.toString())}
   catch {return new Response('Google Calendar is not configured',{status:503,headers})}
  }
 }
}
