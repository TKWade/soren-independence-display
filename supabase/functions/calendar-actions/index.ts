import { calendarActionHandler } from '../../../server/calendar/actions.ts'
Deno.serve(calendarActionHandler({
 url:Deno.env.get('SUPABASE_URL')??'',
 anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',
 serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
 allowedOrigins:(Deno.env.get('CALENDAR_ALLOWED_ORIGINS')??'').split(',').map(value=>value.trim()).filter(Boolean),
 google:{clientId:Deno.env.get('GOOGLE_CLIENT_ID')??'',clientSecret:Deno.env.get('GOOGLE_CLIENT_SECRET')??'',redirectUri:Deno.env.get('GOOGLE_OAUTH_REDIRECT_URI')??'',returnUrl:Deno.env.get('GOOGLE_OAUTH_RETURN_URL')??''},
}))
