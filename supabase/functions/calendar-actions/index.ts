import { calendarActionHandler } from '../../../server/calendar/actions.ts'
// Deploy with an explicit origin allowlist. No provider factories are registered yet.
Deno.serve(calendarActionHandler({
 url:Deno.env.get('SUPABASE_URL')??'',
 anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',
 serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
 allowedOrigins:(Deno.env.get('CALENDAR_ALLOWED_ORIGINS')??'').split(',').map(value=>value.trim()).filter(Boolean),
}))
