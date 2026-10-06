import {weatherHandler} from '../../../server/weather/handlers.ts'
import {OpenMeteoProvider} from '../../../server/weather/openMeteo.ts'
import {parseAllowedOrigins} from '../../../server/calendar/configuration.ts'
Deno.serve(weatherHandler({url:Deno.env.get('SUPABASE_URL')??'',anonKey:Deno.env.get('SUPABASE_ANON_KEY')??'',serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',allowedOrigins:parseAllowedOrigins(Deno.env.get('WEATHER_ALLOWED_ORIGINS')??''),schedulerSecret:Deno.env.get('WEATHER_SCHEDULER_SECRET')??''},new OpenMeteoProvider(Deno.env.get('OPEN_METEO_API_KEY')??'')))
