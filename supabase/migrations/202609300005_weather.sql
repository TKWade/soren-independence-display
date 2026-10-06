begin;
create table public.household_weather (
 household_id uuid primary key references public.households(id) on delete cascade,
 enabled boolean not null default false,
 location jsonb,
 temperature_unit text not null default 'fahrenheit' check(temperature_unit in ('fahrenheit','celsius')),
 revision integer not null default 1,
 forecast jsonb,
 last_attempt_at timestamptz,
 last_success_at timestamptz,
 refresh_failed boolean not null default false,
 lease_id uuid,
 lease_until timestamptz,
 constraint weather_location check(location is null or coalesce((jsonb_typeof(location)='object' and jsonb_typeof(location->'label')='string' and length(location->>'label') between 1 and 200 and jsonb_typeof(location->'latitude')='number' and jsonb_typeof(location->'longitude')='number' and (location->>'latitude')::numeric between -90 and 90 and (location->>'longitude')::numeric between -180 and 180),false)),
 constraint enabled_weather_location check(not enabled or location is not null)
);
alter table public.household_weather enable row level security;
revoke all on public.household_weather from public,anon,authenticated;
grant select on public.household_weather to authenticated;
grant all on public.household_weather to service_role;
create policy weather_member_read on public.household_weather for select to authenticated using(private.is_member(household_id));
-- Writes are only through the authenticated server handler, never client cache writes.
create function public.configure_household_weather(hid uuid, settings jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 insert into public.household_weather(household_id,enabled,location,temperature_unit)
 values(hid,(settings->>'enabled')::boolean,nullif(settings->'location','null'::jsonb),settings->>'temperature_unit')
 on conflict(household_id) do update set enabled=excluded.enabled,location=excluded.location,temperature_unit=excluded.temperature_unit,
 revision=public.household_weather.revision+1,
 forecast=case when public.household_weather.location is distinct from excluded.location then null else public.household_weather.forecast end,
 last_success_at=case when public.household_weather.location is distinct from excluded.location then null else public.household_weather.last_success_at end,
 last_attempt_at=null,refresh_failed=false,lease_id=null,lease_until=null;
end $$;
-- Lease and revision prevent overlapping workers and old-location forecasts overwriting a new location.
create function public.claim_weather_refresh(hid uuid default null) returns setof public.household_weather language sql security definer set search_path='' as $$
 update public.household_weather w set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes',last_attempt_at=now()
 where w.household_id in (select household_id from public.household_weather
 where enabled and (hid is null or household_id=hid) and (lease_until is null or lease_until<now())
 and (last_attempt_at is null or last_attempt_at<now()-case when hid is null then interval '29 minutes' else interval '1 minute' end)
 order by last_attempt_at nulls first limit 10 for update skip locked) returning w.*;
$$;
create function public.finish_weather_refresh(hid uuid, expected_revision integer, lease uuid, result jsonb) returns void language sql security definer set search_path='' as $$
 update public.household_weather set
 forecast=case when result is null then forecast else result end,
 last_success_at=case when result is null then last_success_at else now() end,
 refresh_failed=result is null,lease_id=null,lease_until=null
 where household_id=hid and revision=expected_revision and lease_id=lease and enabled;
$$;
revoke all on function public.configure_household_weather(uuid,jsonb),public.claim_weather_refresh(uuid),public.finish_weather_refresh(uuid,integer,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.configure_household_weather(uuid,jsonb),public.claim_weather_refresh(uuid),public.finish_weather_refresh(uuid,integer,uuid,jsonb) to service_role;
alter table public.profile_display_preferences add constraint weather_display_preferences check(
 (not preferences ? 'showWeather' or jsonb_typeof(preferences->'showWeather')='boolean') and
 (not preferences ? 'weatherDetail' or coalesce(preferences->>'weatherDetail' in ('simple','standard'),false)));
-- Independent worker/secret. No changes to the existing calendar job or managed Vault ACLs.
create function private.dispatch_weather_refresh() returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text;credential text;request_id bigint;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='weather_scheduler_url';
 select decrypted_secret into credential from vault.decrypted_secrets where name='weather_scheduler_secret';
 if endpoint is null or endpoint !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/weather-scheduled$' or credential is null or length(credential)<32 then raise exception 'Weather scheduler configuration required';end if;
 select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-weather-scheduler-secret',credential),body:='{}'::jsonb,timeout_milliseconds:=5000) into request_id;
 return request_id;
exception when others then raise exception 'Weather scheduler dispatch unavailable';
end $$;
revoke all on function private.dispatch_weather_refresh() from public,anon,authenticated,service_role;
select cron.schedule('weather-refresh-30m','7,37 * * * *','select private.dispatch_weather_refresh();');
commit;
