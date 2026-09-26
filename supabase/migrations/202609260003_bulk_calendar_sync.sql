begin;
-- Keep the exact sequential semantics for rare mixed/duplicate batches.
alter function private.commit_calendar_sync(jsonb) rename to commit_calendar_sync_sequential;
revoke all on function private.commit_calendar_sync_sequential(jsonb) from public,anon,authenticated,service_role;

-- Event timezone validation was scanning pg_timezone_names once per row, including status-only updates.
-- Transition-table validation keeps the same accepted names and transactional rejection, once per statement.
drop trigger check_event_zone on public.calendar_events;
create function private.check_event_zones_batch() returns trigger language plpgsql set search_path='' as $$
begin
 if exists (
  with zones as materialized (select name from pg_catalog.pg_timezone_names)
  select 1 from (select distinct time_zone from changed_events) e
  where not exists(select 1 from zones z where z.name=e.time_zone)
 ) then raise exception 'Invalid timezone'; end if;
 return null;
end $$;
revoke all on function private.check_event_zones_batch() from public,anon,authenticated;
create trigger check_event_zones_insert after insert on public.calendar_events referencing new table as changed_events for each statement execute function private.check_event_zones_batch();
create trigger check_event_zones_update after update on public.calendar_events referencing new table as changed_events for each statement execute function private.check_event_zones_batch();
create index external_calendar_series_identity on public.external_event_sources(calendar_id,external_series_id) where calendar_id is not null;

create function private.commit_calendar_sync(payload jsonb) returns void language plpgsql security definer set search_path='' set statement_timeout='30s' as $$
declare cal public.external_calendars; conn public.calendar_connections; state private.calendar_sync_state;
 synced timestamptz:=now();
begin
 select * into strict cal from public.external_calendars where id=(payload->>'calendar_id')::uuid for update;
 select * into strict conn from public.calendar_connections where id=cal.connection_id;
 if not cal.enabled or cal.behavior<>'evaluate' or conn.status<>'connected' then raise exception 'Calendar disabled or not connected'; end if;
 select * into state from private.calendar_sync_state where calendar_id=cal.id;
 if coalesce(state.revision,0) is distinct from (payload->>'expected_revision')::bigint then raise exception 'Sync revision conflict'; end if;
 if (payload->>'window_end')::timestamptz <= (payload->>'window_start')::timestamptz or (payload->>'window_end')::timestamptz-(payload->>'window_start')::timestamptz>interval '366 days' then raise exception 'Invalid window'; end if;
 if jsonb_typeof(payload->'changes') is distinct from 'array' or jsonb_array_length(payload->'changes')>20000 or not(payload?'checkpoint') then raise exception 'Invalid batch'; end if;

 -- Validate the entire batch before writing any event. No provider text in errors.
 if exists(select 1 from jsonb_array_elements(payload->'changes') c where (c->>'type') is null or c->>'type' not in ('upsert','cancel')) then raise exception 'Unknown change type'; end if;
 if exists(
  select 1 from jsonb_array_elements(payload->'changes') c
  cross join lateral (select case when c->>'type'='upsert' then c->'event' else c->'identity' end as ident) i
  where ident->>'provider' is distinct from conn.provider or ident->>'connectionId' is distinct from conn.id::text
   or ident->>'calendarId' is distinct from cal.id::text or ident->>'externalCalendarId' is distinct from cal.external_calendar_id
   or coalesce(ident->>'externalEventId','')=''
 ) then raise exception 'Calendar identity mismatch'; end if;
 -- Mixed cancellation/upsert order and repeated identities have sequential semantics.
 -- Google snapshot batches are unique upserts; cancellation-only batches also take the bulk path.
 if (select count(distinct c->>'type') from jsonb_array_elements(payload->'changes') c)>1
 or exists(select 1 from jsonb_array_elements(payload->'changes') c where c->>'type'='upsert' group by c->'event'->>'externalEventId' having count(*)>1) then
  perform private.commit_calendar_sync_sequential(payload);
  return;
 end if;

 if coalesce((payload->>'replace_window')::boolean,false) then
  update public.calendar_events e set external_status='cancelled'
  from public.external_event_sources s where s.event_id=e.id and s.calendar_id=cal.id and e.source_kind='external'
   and e.start_time < (payload->>'window_end')::timestamptz and e.end_time > (payload->>'window_start')::timestamptz
   and not exists(select 1 from jsonb_array_elements(payload->'changes') c where c->>'type'='upsert' and c->'event'->>'externalEventId'=s.external_event_id);
 end if;

 with incoming as materialized (
  select c->'event' ev from jsonb_array_elements(payload->'changes') c where c->>'type'='upsert'
 ), resolved as materialized (
  select ev,coalesce(s.event_id,gen_random_uuid()) eid from incoming i
  left join public.external_event_sources s on s.calendar_id=cal.id and s.external_event_id=i.ev->>'externalEventId'
 ), written as (
  insert into public.calendar_events(id,household_id,title,description,start_time,end_time,time_zone,location,recurrence,all_day,source_kind,external_status,external_kind,last_modified,all_day_start,all_day_end)
  select eid,cal.household_id,ev->>'title',coalesce(ev->>'description',''),
   case when (ev->>'allDay')::boolean then (ev->>'start')::date::timestamp at time zone (ev->>'timeZone') else (ev->>'start')::timestamptz end,
   case when (ev->>'allDay')::boolean then (ev->>'end')::date::timestamp at time zone (ev->>'timeZone') else (ev->>'end')::timestamptz end,
   ev->>'timeZone',coalesce(ev->>'locationText',''),nullif(ev->'recurrence','null'::jsonb),(ev->>'allDay')::boolean,'external',ev->>'status',ev->>'kind',(ev->>'lastModified')::timestamptz,
   case when (ev->>'allDay')::boolean then (ev->>'start')::date end,case when (ev->>'allDay')::boolean then (ev->>'end')::date end
  from resolved
  on conflict(id) do update set title=excluded.title,description=excluded.description,start_time=excluded.start_time,end_time=excluded.end_time,time_zone=excluded.time_zone,location=excluded.location,recurrence=excluded.recurrence,all_day=excluded.all_day,external_status=excluded.external_status,external_kind=excluded.external_kind,last_modified=excluded.last_modified,all_day_start=excluded.all_day_start,all_day_end=excluded.all_day_end
   where public.calendar_events.source_kind='external'
  returning id
 )
 insert into public.external_event_sources(household_id,event_id,provider,external_calendar_id,external_event_id,external_series_id,original_start_time,last_synced_at,calendar_id)
 select cal.household_id,r.eid,conn.provider,cal.external_calendar_id,ev->>'externalEventId',ev->>'externalSeriesId',
  case when ev->>'originalStart' ~ '^\d{4}-\d{2}-\d{2}$' then (ev->>'originalStart')::date::timestamp at time zone (ev->>'timeZone') else (ev->>'originalStart')::timestamptz end,synced,cal.id
 from resolved r
 -- Establish a dependency on the event insert while retaining the old local-event conflict behavior.
 left join written w on w.id=r.eid
 on conflict(event_id) do update set external_series_id=excluded.external_series_id,original_start_time=excluded.original_start_time,last_synced_at=excluded.last_synced_at;

 with cancellations as (select c->'identity'->>'externalEventId' ident from jsonb_array_elements(payload->'changes') c where c->>'type'='cancel'),
 targets as materialized (
  select distinct s.event_id from public.external_event_sources s join cancellations c
   on s.external_event_id=c.ident or s.external_series_id=c.ident where s.calendar_id=cal.id
 ), cancelled as (
  update public.calendar_events e set external_status='cancelled' from targets t where e.id=t.event_id and e.source_kind='external' returning e.id
 )
 update public.external_event_sources s set last_synced_at=synced from targets t where s.event_id=t.event_id and s.calendar_id=cal.id;
 insert into private.calendar_sync_state(calendar_id,revision,cursor,window_start,window_end)
 values(cal.id,coalesce(state.revision,0)+1,payload->'checkpoint',(payload->>'window_start')::timestamptz,(payload->>'window_end')::timestamptz)
 on conflict(calendar_id) do update set revision=excluded.revision,cursor=excluded.cursor,window_start=excluded.window_start,window_end=excluded.window_end,updated_at=now();
 update public.external_calendars set last_synced_at=synced,sync_status='idle',sync_error=null where id=cal.id;
 update public.calendar_connections set last_synced_at=synced where id=conn.id;
end $$;

revoke all on function private.commit_calendar_sync(jsonb) from public,anon,authenticated,service_role;
-- The public RPC continues to lock connection before calendar, preserving disconnect/sync serialization.
create or replace function public.commit_calendar_sync(payload jsonb) returns void language plpgsql security definer set search_path='' set statement_timeout='30s' as $$
begin
 perform 1 from public.calendar_connections where id=(select connection_id from public.external_calendars where id=(payload->>'calendar_id')::uuid) for update;
 perform private.commit_calendar_sync(payload);
end $$;
revoke all on function public.commit_calendar_sync(jsonb) from public,anon,authenticated;
grant execute on function public.commit_calendar_sync(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
