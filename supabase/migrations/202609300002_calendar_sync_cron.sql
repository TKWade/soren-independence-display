begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- No credentials in cron.job.command. Missing deployment configuration fails closed.
create function private.dispatch_calendar_sync() returns bigint language plpgsql security definer set search_path='' as $$
declare endpoint text;credential text;request_id bigint;
begin
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='calendar_scheduler_url';
 select decrypted_secret into credential from vault.decrypted_secrets where name='calendar_scheduler_secret';
 if endpoint is null or endpoint !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/calendar-scheduled$' or credential is null or length(credential)<32 then raise exception 'Scheduler configuration required';end if;
 select net.http_post(url:=endpoint,headers:=jsonb_build_object('Content-Type','application/json','x-calendar-scheduler-secret',credential),body:='{}'::jsonb,timeout_milliseconds:=5000) into request_id;
 return request_id;
exception when others then raise exception 'Scheduler dispatch unavailable. Check server configuration.';
end $$;
revoke all on function private.dispatch_calendar_sync() from public,anon,authenticated,service_role;
select cron.schedule('calendar-sync-15m','*/15 * * * *','select private.dispatch_calendar_sync();');
commit;
