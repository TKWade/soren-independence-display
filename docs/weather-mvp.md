# Weather MVP

Weather is household context, separate from calendar events, mappings, recurrence, profile relevance, and Home & Sleep. No caregiver notifications are introduced.

## Provider and normalized data

`server/weather/provider.ts` defines `WeatherProvider.search` and `WeatherProvider.forecast`. The Open-Meteo adapter is the only code that understands its geocoding response, forecast arrays, or WMO codes. Display code receives `WeatherForecast`, `DailyWeather`, and `CurrentWeather` from `src/weather/types.ts`.

Daily forecasts contain a household-local date, semantic condition, high/low Celsius temperatures, and optional precipitation probability. Current weather contains a local date, temperature and condition. Seven daily forecasts cover today through day six; rolling Week shows today plus five future days and omits yesterday. No UTC timestamps are shown to the child. Household timezone, rather than the tablet timezone, is passed to the provider and used to match dates.

Conditions are sunny, partly-cloudy, cloudy, rain, storm, snow, fog and windy. All have shared flat SVG artwork. WMO codes currently map to the first seven; windy is available to another provider but is not inferred from unrequested wind data. Unknown/null conditions or malformed temperatures reject a response and preserve the previous forecast.

## Persistence and access

`public.household_weather` has one row per household: enabled, selected location label/latitude/longitude, temperature_unit, revision, normalized forecast, last attempt/success, failure flag and refresh lease. No row means weather disabled. Fahrenheit is the U.S. default; stored Celsius data is converted only for display, so unit changes do not require another successful provider call.

Authenticated household members can read their own cache through RLS. Browser roles cannot write settings/cache or execute refresh/configuration RPCs. `weather-actions` verifies the bearer with auth.getUser and verifies household membership before lookup, settings changes or refresh. Credentials and provider configuration stay in Edge Functions. Raw provider errors/URLs are not logged or returned.

Server configuration increments a revision and invalidates any in-flight lease. Changing location clears the old forecast and success timestamp. Completing a refresh requires the original revision and one-use lease UUID, so old-location responses cannot reappear. Failed refreshes update status without replacing the successful forecast. Calendar tables/functions are not touched.

## Caregiver setup

Expand **Household settings · Weather**, underneath the existing toolbar. Enable weather, enter a city/region (Salina, KS) or ZIP, choose a returned location, choose Fahrenheit/Celsius, and save. Coordinates are stored after selection; later refreshes do not geocode. Saving an enabled configuration attempts the initial refresh. The same panel supports changing location and manual Refresh weather. It shows last-success age and failure guidance, with attribution confined to Admin. A location change with failed retrieval leaves weather absent until a successful refresh, rather than showing the previous city's conditions.

Profiles expose showWeather and weatherDetail (simple/standard). Defaults: Week true/simple, Standard true/standard, First/Next/Then false/simple. First/Next/Then does not consume weather even if its stored flag is true; the preference is reserved for a later explicit renderer change.

## Refresh, stale data and offline limits

The independent `weather-refresh-30m` cron job runs at minutes 7 and 37, using `private.dispatch_weather_refresh` and a dedicated Vault secret. It does not alter the calendar-sync-15m job. The worker claims at most ten rows concurrently and drains up to five batches per invocation (50 households); larger deployments should extend batching/queue capacity to maintain the cadence. Claim order favors least recently attempted households. Automatic eligibility is 29 minutes since last attempt; manual requests have a one-minute throttle. Leases expire after two minutes; each provider request has a ten-second timeout.

The wall display never calls Open-Meteo. Existing app refreshes read Supabase's normalized cache. Weather reads have a five-second bound and fail independently of schedule loading. A temporary fetch failure retains the already loaded household forecast. Current readings are used only for today's date and when at most one hour old. Daily forecasts remain usable for at most 24 hours from successful retrieval, flagged internally stale after one hour or a failed refresh. Beyond 24 hours, wrong-timezone data, and missing dates are silently omitted. There are no child-facing weather errors or blocking dialogs.

Offline support follows the existing loaded-session schedule behavior: temporarily disconnected tablets retain their loaded data; the PWA caches application assets. This milestone does not introduce a new persistent offline database or promise a fully offline cold start. Forecast expiration continues as the display clock advances.

## Child presentation

Rolling Week shows one 32px icon and daily high near each applicable heading, not another activity tile. Yesterday has no weather. Equal-height Week cards remain intact. Day-B places a compact icon/temperature beside the date; it uses fresh current conditions for today, otherwise the daily high. Weather is not inserted into the timeline or activities. Standard presentation adds a short condition and high/low (with current temperature on today's Day). Dates outside the forecast window have no cue.

## Migration and deployment preparation (not executed)

New migration: `supabase/migrations/202609300005_weather.sql`. It creates the weather table, RLS/grants, server-only configuration/claim/finish functions, optional weather preference validation, and independent cron dispatch/job. It depends on existing migrations that install pg_cron, pg_net and Vault. No applied migration is edited and no managed Vault privileges are changed.

New Edge Functions: `weather-actions` and `weather-scheduled`. Their JWT gateway setting is false because actions explicitly verify the user and worker requests require a dedicated high-entropy secret. Do not remove those handler checks.

Configure server secrets:

- WEATHER_ALLOWED_ORIGINS: comma-separated exact application origins; local development can use http://localhost:5173,http://127.0.0.1:5173. Use production origins when deploying. Existing strict origin validation applies.
- WEATHER_SCHEDULER_SECRET: new cryptographically random value of at least 32 characters; do not reuse the calendar secret.
- OPEN_METEO_API_KEY: optional only for current non-commercial prototype usage; a commercial key selects customer forecast and geocoding hosts. Never use VITE_ for this value.
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: standard Edge runtime values, server-side only (service role).

Create two named secrets in Supabase Vault using the dashboard: `weather_scheduler_url` = `https://pvkrwzieiyuztqupxifj.supabase.co/functions/v1/weather-scheduled`; `weather_scheduler_secret` = the same dedicated value as WEATHER_SCHEDULER_SECRET. No secret should be pasted into checked-in SQL or cron.job.command.

After separate approval to deploy: configure secrets/Vault entries, deploy the two functions, apply the reviewed migration, then publish the frontend. Function deployment commands:

```powershell
npx supabase functions deploy weather-actions
npx supabase functions deploy weather-scheduled
```

The migration creates the job; it needs no separate cron command. Verify the job and worker logs after applying it. Worker logs contain only `event: weather_refresh_complete`, processed and failed counts. Existing calendar functions do not need redeployment.

## Provider terms and attribution

The free API is for current non-commercial/prototype use. Commercial deployment requires an appropriate subscription/provider arrangement, including forecast and location lookup. Server-only OPEN_METEO_API_KEY selects the documented customer-prefixed hosts. Admin links Open-Meteo and CC BY 4.0, credits GeoNames, and notes simplified forecasts. Review attribution placement with the provider for any public/commercial release; the child display intentionally avoids prominent attribution clutter.

Sources: [forecast API](https://open-meteo.com/en/docs), [location lookup](https://open-meteo.com/en/docs/geocoding-api), [provider terms](https://open-meteo.com/en/terms).

## Validation and wall-tablet checklist

Tests cover disabled weather, geocoding and stored-coordinate requests, local current/daily normalization, semantic codes, units, stale/failed/missing-date behavior, date boundaries, simple and standard markup, unchanged First/Next/Then/schedule, authentication failure, RLS, server-only writes, leases, stale revision rejection, location changes, failure retention, and separate calendar/weather cron jobs. Database tests run against isolated PGlite with the existing Vault/cron/net test doubles; they do not apply hosted migrations or test real provider availability.

Browser fixture: `/tests/browser/index.html?view=rolling&weather`. Single hero: `/tests/browser/index.html?day=2026-09-23&scenario=sleep-where&weather&comparison`. Admin fixture provides fictional lookup results without authentication or backend writes. Checked 1280x800, 1024x640, 960x600 and 412x924: Week cards all equal height (471/461/461/463px), no horizontal page overflow. Single hero stayed 720x295px on landscape tablets and 372x409px on phone.

After deployment, on the wall tablet:

1. Enable weather, search Salina, KS (also try ZIP 67401), select the correct result and save. Confirm initial forecast/status.
2. Verify TODAY stays second, yesterday subdued/no weather, next five days have compact icons/highs, and Week columns remain equal height.
3. Open today's Day and a future Day; check current vs high, single hero, multiple-event arrows, NOW/NEXT and embedded WHO/WHERE. Return to Week.
4. Switch household units to Celsius and back; confirm all profiles change consistently. Test a different location; old-location weather must disappear while awaiting its forecast.
5. Disable household weather and profile showWeather separately. Standard Week/Month may show richer data; First/Next/Then remains unchanged.
6. Disconnect tablet internet after loading. Calendar and last successful forecast remain usable. Restore connectivity; no blocking error appears. Test provider failure server-side in a non-production environment; last success must be retained, then omitted after 24 hours.
7. Close the tablet app for over 30 minutes. Confirm weather last_success_at advances server-side and calendar sync continues independently. Check lease recovery after interrupted work.
8. Inspect near household midnight, rotate the tablet, and test 1280x800/1024x640/960x600 plus phone widths. No clipped date/weather header, stretched icons, or new page-level horizontal overflow.

Live provider, hosted worker/cron, and physical wall-tablet tests remain deployment checks; no deployment, hosted migration, commit, or push was performed.


## Safe refresh diagnostics

A failed household refresh emits one controlled JSON log per failing stage, for example:

```json
{"event":"weather_refresh_failed","stage":"forecast_normalization","category":"unsupported_weather_condition"}
```

Stages are `household_lookup`, `provider_forecast`, `forecast_normalization`, and `finish_refresh`. Categories distinguish household lookup failure, provider HTTP/network/JSON failure, timeout, invalid horizon/number/date, unsupported condition, failed database completion, and unknown exceptions. These values are runtime allowlisted. Logs never include exceptions, stack traces, response bodies, URLs, coordinates, names, credentials, or household identifiers.

Lookup/provider/normalization errors still call finish_weather_refresh with a null result, retaining the last forecast, marking refresh_failed, and releasing the lease. If the finish RPC itself fails, a separate finish_refresh/database_finish_failed entry is emitted and the existing generic error path is retained; database completion cannot be guaranteed during a database outage, so the existing lease timeout remains the recovery path. Browser responses contain no diagnostic stage/category or raw exception. Successful finishes preserve the existing processed/failed/saved response.

Deploy both weather-actions and weather-scheduled to enable these shared diagnostics for manual and scheduled refreshes. This diagnostics change requires no additional migration. The representative seven-day response with current time 2026-09-30T21:45 and codes 63,65,3,1,2 passes normalization locally; hosted logs are needed to identify the actual failing stage.


## Weather worker household-read permission fix

Hosted diagnostics identified `household_lookup / household_unavailable`: the service-role worker needed SQL SELECT privileges for the filtered timezone lookup. RLS bypass does not itself grant table/column access.

`202610010001_weather_household_read.sql` records only `grant select (id, time_zone) on table public.households to service_role;`. The grant is idempotent, including when already run manually in SQL Editor. No earlier migration, RLS policy, authentication, provider configuration, diagnostic code, or forecast-retention behavior is changed. This permission-only fix needs no Edge Function redeployment. Apply the new migration through the normal migration process when authorized; it has not been applied by this task.

The database regression starts from the pre-fix schema without implicit service-role table SELECT, confirms the lookup fails, applies the migration inside isolated PGlite, then runs the exact filtered timezone lookup under SET ROLE service_role. It checks repeat application, unchanged browser column privileges and household RLS policies, denied reads of other columns, denied writes, anonymous denial, and authenticated non-member isolation.
