import { createClient } from '@supabase/supabase-js'
import { googleOAuthHandler } from '../../../server/calendar/googleOAuth.ts'
const service=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false,autoRefreshToken:false}})
Deno.serve(googleOAuthHandler(service,{clientId:Deno.env.get('GOOGLE_CLIENT_ID')??'',clientSecret:Deno.env.get('GOOGLE_CLIENT_SECRET')??'',redirectUri:Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')??'',returnUrl:Deno.env.get('GOOGLE_OAUTH_RETURN_URL')??''}))
