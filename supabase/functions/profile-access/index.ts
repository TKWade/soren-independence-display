import {profileAccessHandler} from '../../../server/profiles/handler.ts'
import {parseAllowedOrigins} from '../../../server/calendar/configuration.ts'
Deno.serve(profileAccessHandler({url:Deno.env.get('SUPABASE_URL')??'',anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',allowedOrigins:parseAllowedOrigins(Deno.env.get('PROFILE_ALLOWED_ORIGINS')??Deno.env.get('CALENDAR_ALLOWED_ORIGINS')??'')}))
