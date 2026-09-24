begin;
create table public.calendar_connections (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 provider text not null check(provider in ('google','microsoft')), label text not null,
 status text not null default 'needs_authorization' check(status in ('connected','needs_authorization','disabled')),
 last_synced_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create table public.external_calendars (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 connection_id uuid not null, external_calendar_id text not null check(length(external_calendar_id)>0), name text not null, time_zone text not null,
 enabled boolean not null default false, behavior text not null default 'ignore' check(behavior in ('evaluate','ignore')),
 last_synced_at timestamptz, sync_status text not null default 'idle' check(sync_status in ('idle','error')), sync_error text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id), unique(connection_id,external_calendar_id),
 foreign key(household_id,connection_id) references public.calendar_connections(household_id,id) on delete cascade
);
create trigger check_calendar_zone before insert or update on public.external_calendars for each row execute function private.check_zone();
-- Never expose these tables through PostgREST. Store a Vault/KMS reference, never plaintext tokens.
create table private.calendar_connection_secrets (
 connection_id uuid primary key references public.calendar_connections(id) on delete cascade,
 vault_secret_id uuid not null
);
create table private.calendar_sync_state (
 calendar_id uuid primary key references public.external_calendars(id) on delete cascade,
 revision bigint not null default 0, cursor jsonb, window_start timestamptz not null, window_end timestamptz not null,
 check(window_end>window_start), updated_at timestamptz not null default now()
);
revoke all on private.calendar_connection_secrets,private.calendar_sync_state from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.calendar_connection_secrets,private.calendar_sync_state to service_role;

alter table public.external_event_sources add column calendar_id uuid;
alter table public.external_event_sources add foreign key(household_id,calendar_id) references public.external_calendars(household_id,id);
-- Replace the old account-agnostic uniqueness with calendar/connection-namespaced identity.
do $$ declare item record; begin
 for item in select conname from pg_constraint where conrelid='public.external_event_sources'::regclass and pg_get_constraintdef(oid)='UNIQUE (household_id, provider, external_calendar_id, external_event_id)' loop
  execute format('alter table public.external_event_sources drop constraint %I',item.conname);
 end loop;
end $$;
create unique index external_calendar_event_identity on public.external_event_sources(calendar_id,external_event_id) where calendar_id is not null;
alter table public.calendar_events add column description text not null default '', add column last_modified timestamptz,
 add column external_status text check(external_status in ('confirmed','tentative','cancelled')),
 add column external_kind text check(external_kind in ('single','occurrence','seriesMaster')),
 add column all_day_start date, add column all_day_end date;
alter table public.calendar_events drop constraint calendar_events_title_check;
alter table public.calendar_events add constraint calendar_title_valid check ((source_kind='local' and length(trim(title)) between 1 and 160) or (source_kind='external' and length(title)<=10000));
alter table public.calendar_events add constraint external_day_range check ((all_day_start is null and all_day_end is null) or (source_kind='external' and all_day and all_day_start is not null and all_day_end is not null and all_day_end>all_day_start));

alter table public.event_matching_rules add column action text not null default 'include' check(action in ('include','ignore')),
 add column calendar_id uuid, add column picture_person_id uuid, add column is_primary boolean not null default false;
alter table public.event_matching_rules add foreign key(household_id,calendar_id) references public.external_calendars(household_id,id);
alter table public.event_matching_rules add foreign key(household_id,picture_person_id) references public.people(household_id,id);
alter table public.event_matching_rules add constraint rule_title_not_blank check(length(trim(title_value)) between 1 and 500) not valid;
alter table public.event_matching_rules add constraint rule_short_label check(label is null or length(trim(label)) between 1 and 20) not valid;

create table public.event_profile_mappings (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 calendar_id uuid not null, group_key text not null check(group_key ~ '^(event|series):.+'), profile_id uuid not null,
 action text not null check(action in ('include','ignore')),
 activity_id uuid, place_id uuid, caregiver_id uuid, picture_person_id uuid,
 label text check(label is null or length(trim(label)) between 1 and 20), visible boolean not null default true, is_primary boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id), unique(calendar_id,group_key,profile_id),
 check(action='ignore' or (activity_id is not null and place_id is not null)),
 foreign key(household_id,calendar_id) references public.external_calendars(household_id,id),
 foreign key(household_id,profile_id) references public.profiles(household_id,id),
 foreign key(household_id,activity_id) references public.activities(household_id,id),
 foreign key(household_id,place_id) references public.places(household_id,id),
 foreign key(household_id,caregiver_id) references public.people(household_id,id),
 foreign key(household_id,picture_person_id) references public.people(household_id,id)
);
do $$ declare name text; begin
 foreach name in array array['calendar_connections','external_calendars','event_profile_mappings'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from anon, authenticated',name);
  execute format('grant select on public.%I to authenticated',name);
  execute format('grant all on public.%I to service_role',name);
  execute format('create policy member_read on public.%I for select to authenticated using(private.is_member(household_id))',name);
  execute format('create trigger touch_row before update on public.%I for each row execute function private.touch_row()',name);
  execute format('create index on public.%I(household_id)',name);
 end loop;
end $$;
-- Only selection settings are browser-writable. Provider identity and sync summaries are server-owned.
grant update(enabled,behavior) on public.external_calendars to authenticated;
create policy member_update on public.external_calendars for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
grant insert,update,delete on public.event_profile_mappings to authenticated;
create policy member_insert on public.event_profile_mappings for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.event_profile_mappings for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.event_profile_mappings for delete to authenticated using(private.is_member(household_id));
grant select,insert,update on public.calendar_events,public.external_event_sources to service_role;

-- One caregiver decision, optionally plus reusable rules, saved atomically for selected profiles.
create function public.save_external_mapping(payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare hid uuid:=(payload->>'household_id')::uuid; cid uuid:=(payload->>'calendar_id')::uuid; pid uuid; key text:=payload->>'group_key';
begin
 if not private.is_member(hid) then raise exception 'Not authorized'; end if;
 if jsonb_typeof(payload->'profile_ids') is distinct from 'array' or jsonb_array_length(payload->'profile_ids')<1 then raise exception 'Select a profile'; end if;
 if not exists(select 1 from public.external_event_sources where household_id=hid and calendar_id=cid and (key='event:'||external_event_id or key='series:'||external_series_id)) then raise exception 'Unknown external event or series'; end if;
 for pid in select value::uuid from jsonb_array_elements_text(payload->'profile_ids') loop
  insert into public.event_profile_mappings(household_id,calendar_id,group_key,profile_id,action,activity_id,place_id,caregiver_id,picture_person_id,label,visible,is_primary)
  values(hid,cid,key,pid,payload->>'action',(payload->>'activity_id')::uuid,(payload->>'place_id')::uuid,(payload->>'caregiver_id')::uuid,(payload->>'picture_person_id')::uuid,nullif(trim(payload->>'label'),''),coalesce((payload->>'visible')::boolean,true),coalesce((payload->>'is_primary')::boolean,false))
  on conflict(calendar_id,group_key,profile_id) do update set action=excluded.action,activity_id=excluded.activity_id,place_id=excluded.place_id,caregiver_id=excluded.caregiver_id,picture_person_id=excluded.picture_person_id,label=excluded.label,visible=excluded.visible,is_primary=excluded.is_primary;
  if coalesce((payload->>'create_rule')::boolean,false) then
   insert into public.event_matching_rules(household_id,profile_id,name,title_operator,title_value,calendar_id,action,activity_id,place_id,caregiver_id,picture_person_id,label,visible,is_primary,priority)
   values(hid,pid,'Inbox: '||left(payload->>'rule_title',80),'contains',trim(payload->>'rule_title'),cid,payload->>'action',(payload->>'activity_id')::uuid,(payload->>'place_id')::uuid,(payload->>'caregiver_id')::uuid,(payload->>'picture_person_id')::uuid,nullif(trim(payload->>'label'),''),coalesce((payload->>'visible')::boolean,true),coalesce((payload->>'is_primary')::boolean,false),0);
  end if;
 end loop;
end $$;
revoke all on function public.save_external_mapping(jsonb) from public,anon;
grant execute on function public.save_external_mapping(jsonb) to authenticated;

-- Trusted worker only: atomic scheduling cache + cursor compare-and-swap, never touches app enrichment.
create function public.commit_calendar_sync(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare cal public.external_calendars; conn public.calendar_connections; state private.calendar_sync_state;
 change jsonb; ev jsonb; ident jsonb; eid uuid; start_at timestamptz; end_at timestamptz; synced timestamptz:=now();
begin
 select * into strict cal from public.external_calendars where id=(payload->>'calendar_id')::uuid for update;
 select * into strict conn from public.calendar_connections where id=cal.connection_id;
 if not cal.enabled or cal.behavior<>'evaluate' or conn.status<>'connected' then raise exception 'Calendar disabled or not connected'; end if;
 select * into state from private.calendar_sync_state where calendar_id=cal.id;
 if coalesce(state.revision,0) is distinct from (payload->>'expected_revision')::bigint then raise exception 'Sync revision conflict'; end if;
 if (payload->>'window_end')::timestamptz <= (payload->>'window_start')::timestamptz or (payload->>'window_end')::timestamptz-(payload->>'window_start')::timestamptz>interval '366 days' then raise exception 'Invalid window'; end if;
 if jsonb_typeof(payload->'changes') is distinct from 'array' or jsonb_array_length(payload->'changes')>20000 or not(payload?'checkpoint') then raise exception 'Invalid batch'; end if;
 if coalesce((payload->>'replace_window')::boolean,false) then
  update public.calendar_events e set external_status='cancelled'
  from public.external_event_sources s where s.event_id=e.id and s.calendar_id=cal.id and e.source_kind='external'
   and e.start_time < (payload->>'window_end')::timestamptz and e.end_time > (payload->>'window_start')::timestamptz;
 end if;
 for change in select value from jsonb_array_elements(payload->'changes') loop
  ev:=change->'event'; ident:=case when change->>'type'='upsert' then ev else change->'identity' end;
  if ident->>'provider' is distinct from conn.provider or ident->>'connectionId' is distinct from conn.id::text or ident->>'calendarId' is distinct from cal.id::text or ident->>'externalCalendarId' is distinct from cal.external_calendar_id or coalesce(ident->>'externalEventId','')='' then raise exception 'Calendar identity mismatch'; end if;
  if change->>'type'='cancel' then
   update public.calendar_events e set external_status='cancelled' from public.external_event_sources s
    where s.event_id=e.id and s.calendar_id=cal.id and (s.external_event_id=ident->>'externalEventId' or s.external_series_id=ident->>'externalEventId') and e.source_kind='external';
   update public.external_event_sources set last_synced_at=synced where calendar_id=cal.id and (external_event_id=ident->>'externalEventId' or external_series_id=ident->>'externalEventId');
  elsif change->>'type'='upsert' then
   if (ev->>'allDay')::boolean then
    start_at:=(ev->>'start')::date::timestamp at time zone (ev->>'timeZone'); end_at:=(ev->>'end')::date::timestamp at time zone (ev->>'timeZone');
   else start_at:=(ev->>'start')::timestamptz; end_at:=(ev->>'end')::timestamptz; end if;
   select event_id into eid from public.external_event_sources where calendar_id=cal.id and external_event_id=ev->>'externalEventId';
   eid:=coalesce(eid,gen_random_uuid());
   insert into public.calendar_events(id,household_id,title,description,start_time,end_time,time_zone,location,recurrence,all_day,source_kind,external_status,external_kind,last_modified,all_day_start,all_day_end)
   values(eid,cal.household_id,ev->>'title',coalesce(ev->>'description',''),start_at,end_at,ev->>'timeZone',coalesce(ev->>'locationText',''),nullif(ev->'recurrence','null'::jsonb),(ev->>'allDay')::boolean,'external',ev->>'status',ev->>'kind',(ev->>'lastModified')::timestamptz,case when (ev->>'allDay')::boolean then (ev->>'start')::date end,case when (ev->>'allDay')::boolean then (ev->>'end')::date end)
   on conflict(id) do update set title=excluded.title,description=excluded.description,start_time=excluded.start_time,end_time=excluded.end_time,time_zone=excluded.time_zone,location=excluded.location,recurrence=excluded.recurrence,all_day=excluded.all_day,external_status=excluded.external_status,external_kind=excluded.external_kind,last_modified=excluded.last_modified,all_day_start=excluded.all_day_start,all_day_end=excluded.all_day_end
    where public.calendar_events.source_kind='external';
   insert into public.external_event_sources(household_id,event_id,provider,external_calendar_id,external_event_id,external_series_id,original_start_time,last_synced_at,calendar_id)
   values(cal.household_id,eid,conn.provider,cal.external_calendar_id,ev->>'externalEventId',ev->>'externalSeriesId',case when ev->>'originalStart' ~ '^\d{4}-\d{2}-\d{2}$' then (ev->>'originalStart')::date::timestamp at time zone (ev->>'timeZone') else (ev->>'originalStart')::timestamptz end,synced,cal.id)
   on conflict(event_id) do update set external_series_id=excluded.external_series_id,original_start_time=excluded.original_start_time,last_synced_at=excluded.last_synced_at;
  else raise exception 'Unknown change type'; end if;
 end loop;
 insert into private.calendar_sync_state(calendar_id,revision,cursor,window_start,window_end)
 values(cal.id,coalesce(state.revision,0)+1,payload->'checkpoint',(payload->>'window_start')::timestamptz,(payload->>'window_end')::timestamptz)
 on conflict(calendar_id) do update set revision=excluded.revision,cursor=excluded.cursor,window_start=excluded.window_start,window_end=excluded.window_end,updated_at=now();
 update public.external_calendars set last_synced_at=synced,sync_status='idle',sync_error=null where id=cal.id;
 update public.calendar_connections set last_synced_at=synced where id=conn.id;
end $$;
revoke all on function public.commit_calendar_sync(jsonb) from public,anon,authenticated;
grant execute on function public.commit_calendar_sync(jsonb) to service_role;
create function public.read_calendar_sync_state(cid uuid) returns jsonb language sql security definer set search_path='' as $$
 select jsonb_build_object('revision',revision,'cursor',cursor,'window',jsonb_build_object('start',window_start,'end',window_end)) from private.calendar_sync_state where calendar_id=cid;
$$;
revoke all on function public.read_calendar_sync_state(uuid) from public,anon,authenticated;
grant execute on function public.read_calendar_sync_state(uuid) to service_role;
create function public.cache_provider_calendars(connection uuid, calendars jsonb) returns void language plpgsql security definer set search_path='' as $$
declare conn public.calendar_connections; item jsonb;
begin
 select * into strict conn from public.calendar_connections where id=connection for update;
 if jsonb_typeof(calendars) is distinct from 'array' then raise exception 'Expected complete calendar list'; end if;
 for item in select value from jsonb_array_elements(calendars) loop
  insert into public.external_calendars(household_id,connection_id,external_calendar_id,name,time_zone)
  values(conn.household_id,conn.id,item->>'externalCalendarId',item->>'name',item->>'timeZone')
  on conflict(connection_id,external_calendar_id) do update set name=excluded.name,time_zone=excluded.time_zone;
 end loop;
 update public.external_calendars set enabled=false where connection_id=conn.id and external_calendar_id not in(select value->>'externalCalendarId' from jsonb_array_elements(calendars));
end $$;
revoke all on function public.cache_provider_calendars(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cache_provider_calendars(uuid,jsonb) to service_role;
commit;
