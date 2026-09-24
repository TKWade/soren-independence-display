-- Application-owned data and calendar-owned scheduling remain separate.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.households (
 id uuid primary key default gen_random_uuid(), name text not null check (length(trim(name)) between 1 and 100),
 time_zone text not null default 'America/Chicago',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.household_members (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, role text not null default 'caregiver' check (role in ('owner','caregiver')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(household_id,user_id)
);
create function private.is_member(hid uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.household_members where household_id=hid and user_id=(select auth.uid()));
$$;
revoke all on function private.is_member(uuid) from public;
grant execute on function private.is_member(uuid) to authenticated;
create function private.touch_row() returns trigger language plpgsql set search_path = '' as $$
begin
 if to_jsonb(new)->>'household_id' is distinct from to_jsonb(old)->>'household_id' then
  raise exception 'Household cannot be changed';
 end if;
 new.updated_at = now(); return new;
end $$;
create function private.check_zone() returns trigger language plpgsql set search_path = '' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.time_zone) then raise exception 'Invalid timezone'; end if;
 return new;
end $$;
create trigger check_household_zone before insert or update on public.households for each row execute function private.check_zone();
create table public.profiles (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create table public.people (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), label text not null check(length(trim(label)) between 1 and 20),
 relationship text not null default '', active boolean not null default true, icon text not null default 'home' check(icon in ('school','swim','park','home','dad','mom','dinner','sleep')), image_path text,
 check(image_path is null or split_part(image_path,'/',1)=household_id::text),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create table public.places (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), label text not null check(length(trim(label)) between 1 and 20),
 address text not null default '', place_type text not null default 'home', active boolean not null default true, icon text not null default 'home' check(icon in ('school','swim','park','home','dad','mom','dinner','sleep')), image_path text,
 check(image_path is null or split_part(image_path,'/',1)=household_id::text),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create table public.activities (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100), label text not null check(length(trim(label)) between 1 and 20),
 active boolean not null default true, icon text not null default 'home' check(icon in ('school','swim','park','home','dad','mom','dinner','sleep')), image_path text,
 check(image_path is null or split_part(image_path,'/',1)=household_id::text),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create table public.calendar_events (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 160),
 start_time timestamptz not null, end_time timestamptz, time_zone text not null,
 location text not null default '', recurrence jsonb, all_day boolean not null default false,
 source_kind text not null default 'local' check(source_kind in ('local','external')),
 check(end_time is null or end_time > start_time),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create trigger check_event_zone before insert or update on public.calendar_events for each row execute function private.check_zone();
create table public.external_event_sources (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 event_id uuid not null unique, provider text not null check(provider in ('google','microsoft')),
 external_calendar_id text not null, external_event_id text not null, external_series_id text, original_start_time timestamptz, last_synced_at timestamptz,
 foreign key(household_id,event_id) references public.calendar_events(household_id,id) on delete cascade,
 unique(household_id,provider,external_calendar_id,external_event_id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create table public.event_visuals (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 event_id uuid not null, profile_id uuid not null, activity_id uuid not null, place_id uuid not null,
 label_override text check(label_override is null or length(trim(label_override)) between 1 and 20), visible boolean not null default true,
 is_primary boolean not null default false, picture_person_id uuid,
 unique(event_id,profile_id),
 foreign key(household_id,event_id) references public.calendar_events(household_id,id) on delete cascade,
 foreign key(household_id,profile_id) references public.profiles(household_id,id),
 foreign key(household_id,activity_id) references public.activities(household_id,id),
 foreign key(household_id,place_id) references public.places(household_id,id),
 foreign key(household_id,picture_person_id) references public.people(household_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create table public.event_people (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 visual_id uuid not null, person_id uuid not null, unique(visual_id,person_id),
 foreign key(household_id,visual_id) references public.event_visuals(household_id,id) on delete cascade,
 foreign key(household_id,person_id) references public.people(household_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create table public.home_rules (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 profile_id uuid not null, weekday integer, override_date date, bedtime time not null default '19:30' check(bedtime < time '24:00'),
 place_id uuid not null, caregiver_id uuid, check((weekday is not null and weekday between 0 and 6 and override_date is null) or (weekday is null and override_date is not null)),
 foreign key(household_id,profile_id) references public.profiles(household_id,id),
 foreign key(household_id,place_id) references public.places(household_id,id),
 foreign key(household_id,caregiver_id) references public.people(household_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
create unique index home_weekday_unique on public.home_rules(profile_id,weekday) where override_date is null;
create unique index home_override_unique on public.home_rules(profile_id,override_date) where override_date is not null;
create table public.event_matching_rules (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 profile_id uuid not null, name text not null, enabled boolean not null default true, priority integer not null default 0,
 title_operator text not null check(title_operator in ('equals','contains')), title_value text not null, case_sensitive boolean not null default false,
 source_filter jsonb, activity_id uuid, place_id uuid, caregiver_id uuid, label text, visible boolean not null default false,
 foreign key(household_id,profile_id) references public.profiles(household_id,id),
 foreign key(household_id,activity_id) references public.activities(household_id,id),
 foreign key(household_id,place_id) references public.places(household_id,id),
 foreign key(household_id,caregiver_id) references public.people(household_id,id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(household_id,id)
);
alter table public.households enable row level security;
revoke all on public.households from anon, authenticated;
grant select on public.households to authenticated;
create trigger touch_households before update on public.households for each row execute function private.touch_row();
create policy member_read on public.households for select to authenticated using (private.is_member(id));
alter table public.household_members enable row level security;
revoke all on public.household_members from anon, authenticated;
grant select on public.household_members to authenticated;
create trigger touch_household_members before update on public.household_members for each row execute function private.touch_row();
create index household_members_household_idx on public.household_members(household_id);
create policy member_read on public.household_members for select to authenticated using (private.is_member(household_id));
alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;
create trigger touch_profiles before update on public.profiles for each row execute function private.touch_row();
create index profiles_household_idx on public.profiles(household_id);
create policy member_read on public.profiles for select to authenticated using (private.is_member(household_id));
grant insert,update,delete on public.profiles to authenticated;
create policy member_insert on public.profiles for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.profiles for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.profiles for delete to authenticated using(private.is_member(household_id));
alter table public.people enable row level security;
revoke all on public.people from anon, authenticated;
grant select on public.people to authenticated;
create trigger touch_people before update on public.people for each row execute function private.touch_row();
create index people_household_idx on public.people(household_id);
create policy member_read on public.people for select to authenticated using (private.is_member(household_id));
grant insert,update,delete on public.people to authenticated;
create policy member_insert on public.people for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.people for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.people for delete to authenticated using(private.is_member(household_id));
alter table public.places enable row level security;
revoke all on public.places from anon, authenticated;
grant select on public.places to authenticated;
create trigger touch_places before update on public.places for each row execute function private.touch_row();
create index places_household_idx on public.places(household_id);
create policy member_read on public.places for select to authenticated using (private.is_member(household_id));
grant insert,update,delete on public.places to authenticated;
create policy member_insert on public.places for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.places for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.places for delete to authenticated using(private.is_member(household_id));
alter table public.activities enable row level security;
revoke all on public.activities from anon, authenticated;
grant select on public.activities to authenticated;
create trigger touch_activities before update on public.activities for each row execute function private.touch_row();
create index activities_household_idx on public.activities(household_id);
create policy member_read on public.activities for select to authenticated using (private.is_member(household_id));
grant insert,update,delete on public.activities to authenticated;
create policy member_insert on public.activities for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.activities for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.activities for delete to authenticated using(private.is_member(household_id));
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from anon, authenticated;
grant select on public.calendar_events to authenticated;
create trigger touch_calendar_events before update on public.calendar_events for each row execute function private.touch_row();
create index calendar_events_household_idx on public.calendar_events(household_id);
create policy member_read on public.calendar_events for select to authenticated using (private.is_member(household_id));
grant insert,update,delete on public.calendar_events to authenticated;
create policy member_insert on public.calendar_events for insert to authenticated with check(private.is_member(household_id) and source_kind='local');
create policy member_update on public.calendar_events for update to authenticated using(private.is_member(household_id) and source_kind='local') with check(private.is_member(household_id) and source_kind='local');
create policy member_delete on public.calendar_events for delete to authenticated using(private.is_member(household_id) and source_kind='local');
alter table public.external_event_sources enable row level security;
revoke all on public.external_event_sources from anon, authenticated;
grant select on public.external_event_sources to authenticated;
create trigger touch_external_event_sources before update on public.external_event_sources for each row execute function private.touch_row();
create index external_event_sources_household_idx on public.external_event_sources(household_id);
create policy member_read on public.external_event_sources for select to authenticated using (private.is_member(household_id));
alter table public.event_visuals enable row level security;
revoke all on public.event_visuals from anon, authenticated;
grant select on public.event_visuals to authenticated;
create trigger touch_event_visuals before update on public.event_visuals for each row execute function private.touch_row();
create index event_visuals_household_idx on public.event_visuals(household_id);
create policy member_read on public.event_visuals for select to authenticated using (private.is_member(household_id));
grant insert,update,delete on public.event_visuals to authenticated;
create policy member_insert on public.event_visuals for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.event_visuals for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.event_visuals for delete to authenticated using(private.is_member(household_id));
alter table public.event_people enable row level security;
revoke all on public.event_people from anon, authenticated;
grant select on public.event_people to authenticated;
create trigger touch_event_people before update on public.event_people for each row execute function private.touch_row();
create index event_people_household_idx on public.event_people(household_id);
create policy member_read on public.event_people for select to authenticated using (private.is_member(household_id));
grant insert,update,delete on public.event_people to authenticated;
create policy member_insert on public.event_people for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.event_people for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.event_people for delete to authenticated using(private.is_member(household_id));
alter table public.home_rules enable row level security;
revoke all on public.home_rules from anon, authenticated;
grant select on public.home_rules to authenticated;
create trigger touch_home_rules before update on public.home_rules for each row execute function private.touch_row();
create index home_rules_household_idx on public.home_rules(household_id);
create policy member_read on public.home_rules for select to authenticated using (private.is_member(household_id));
grant insert,update,delete on public.home_rules to authenticated;
create policy member_insert on public.home_rules for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.home_rules for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.home_rules for delete to authenticated using(private.is_member(household_id));
alter table public.event_matching_rules enable row level security;
revoke all on public.event_matching_rules from anon, authenticated;
grant select on public.event_matching_rules to authenticated;
create trigger touch_event_matching_rules before update on public.event_matching_rules for each row execute function private.touch_row();
create index event_matching_rules_household_idx on public.event_matching_rules(household_id);
create policy member_read on public.event_matching_rules for select to authenticated using (private.is_member(household_id));
grant insert,update,delete on public.event_matching_rules to authenticated;
create policy member_insert on public.event_matching_rules for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.event_matching_rules for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.event_matching_rules for delete to authenticated using(private.is_member(household_id));
create index event_start_idx on public.calendar_events(household_id,start_time);
create index membership_user_idx on public.household_members(user_id);
-- The only membership bootstrap. The caller cannot choose another owner.
create function public.create_household(household_name text, zone text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare hid uuid;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 insert into public.households(name,time_zone) values(household_name,zone) returning id into hid;
 insert into public.household_members(household_id,user_id,role) values(hid,auth.uid(),'owner');
 return hid;
end $$;
revoke all on function public.create_household(text,text) from public, anon;
grant execute on function public.create_household(text,text) to authenticated;

-- Atomic local-event + profile enrichment save. Runs WITH caller RLS.
create function public.save_local_event(payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare hid uuid := (payload->>'household_id')::uuid;
 eid uuid := coalesce((payload->>'id')::uuid, gen_random_uuid());
 pid uuid; person uuid; vid uuid;
begin
 if not private.is_member(hid) then raise exception 'Not authorized'; end if;
 if coalesce(jsonb_typeof(payload->'profile_ids'),'null') <> 'array' then raise exception 'Select a profile'; end if;
 if jsonb_array_length(payload->'profile_ids') < 1 then raise exception 'Select a profile'; end if;
 if exists(select 1 from public.calendar_events where id=eid and source_kind<>'local') then raise exception 'Linked events are read-only'; end if;
 insert into public.calendar_events(id,household_id,title,start_time,end_time,time_zone,location)
 values(eid,hid,payload->>'title',(payload->>'start_time')::timestamptz,(payload->>'end_time')::timestamptz,payload->>'time_zone',coalesce(payload->>'location',''))
 on conflict(id) do update set title=excluded.title,start_time=excluded.start_time,end_time=excluded.end_time,time_zone=excluded.time_zone,location=excluded.location;
 delete from public.event_visuals where event_id=eid and household_id=hid
 and profile_id not in (select value::uuid from jsonb_array_elements_text(payload->'profile_ids'));
 for pid in select value::uuid from jsonb_array_elements_text(payload->'profile_ids') loop
  insert into public.event_visuals(household_id,event_id,profile_id,activity_id,place_id,label_override,visible,is_primary,picture_person_id)
  values(hid,eid,pid,(payload->>'activity_id')::uuid,(payload->>'place_id')::uuid,nullif(payload->>'label_override',''),
   coalesce((payload->>'visible')::boolean,true),coalesce((payload->>'is_primary')::boolean,false),(payload->>'picture_person_id')::uuid)
  on conflict(event_id,profile_id) do update set activity_id=excluded.activity_id,place_id=excluded.place_id,
   label_override=excluded.label_override,visible=excluded.visible,is_primary=excluded.is_primary,picture_person_id=excluded.picture_person_id
  returning id into vid;
  delete from public.event_people where visual_id=vid;
  for person in select value::uuid from jsonb_array_elements_text(payload->'person_ids') loop
   insert into public.event_people(household_id,visual_id,person_id) values(hid,vid,person);
  end loop;
 end loop;
 return eid;
end $$;
revoke all on function public.save_local_event(jsonb) from public, anon;
grant execute on function public.save_local_event(jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('household-images','household-images',false,5242880,array['image/jpeg','image/png','image/webp']);
create function private.can_access_image(path text) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.household_members where household_id::text=split_part(path,'/',1) and user_id=(select auth.uid()));
$$;
revoke all on function private.can_access_image(text) from public;
grant execute on function private.can_access_image(text) to authenticated;
create policy household_image_read on storage.objects for select to authenticated
 using(bucket_id='household-images' and private.can_access_image(name));
create policy household_image_insert on storage.objects for insert to authenticated
 with check(bucket_id='household-images' and private.can_access_image(name));
create policy household_image_delete on storage.objects for delete to authenticated
 using(bucket_id='household-images' and private.can_access_image(name));
-- No UPDATE policy: uploads use random immutable paths, never overwrite other files.
commit;
