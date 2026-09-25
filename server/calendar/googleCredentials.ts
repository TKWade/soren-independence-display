import type { SupabaseClient } from '@supabase/supabase-js'
import { GoogleAuthorizationExpired, GoogleCalendarAdapter, googleToken, revokeGoogleToken, type HttpFetch, type GoogleConfig } from './google.ts'
export async function privateRpc<T>(service:SupabaseClient,operation:string,payload:Record<string,unknown>):Promise<T> {
 const {data,error}=await service.rpc('google_calendar_credentials',{operation,payload})
 if(error) throw new Error('Calendar credential operation failed')
 return data as T
}
export async function googleAdapter(service:SupabaseClient,config:GoogleConfig,connectionId:string,http:HttpFetch=fetch) {
 const credential=await privateRpc<{refreshToken:string;secretId:string}>(service,'read',{connectionId})
 try {
  const tokens=await googleToken(config,{grant_type:'refresh_token',refresh_token:credential.refreshToken},http)
  if(tokens.refresh_token) await privateRpc(service,'rotate',{connectionId,secretId:credential.secretId,refreshToken:tokens.refresh_token})
  return new GoogleCalendarAdapter(tokens.access_token,http)
 } catch(error) {
  if(error instanceof GoogleAuthorizationExpired) await privateRpc(service,'expired',{connectionId,secretId:credential.secretId})
  throw error
 }
}
export async function disconnectGoogle(service:SupabaseClient,connectionId:string,http:HttpFetch=fetch) {
 // Remove local authorization first, even if Google is unreachable. Never return the token to a client.
 const credential=await privateRpc<{refreshToken?:string}>(service,'disconnect',{connectionId})
 let revoked=false
 if(credential.refreshToken) try {revoked=await revokeGoogleToken(credential.refreshToken,http)} catch { /* Local disconnect has already completed. */ }
 return {disconnected:true,revoked}
}
