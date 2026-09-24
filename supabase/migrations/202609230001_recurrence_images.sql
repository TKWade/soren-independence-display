begin;
-- Local rules are deliberately separate from provider-owned recurrence JSON.
create function private.valid_local_recurrence(rule jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare start_day date; end_day date; frequency text; weekday jsonb;
begin
 if rule is null then return true; end if;
 if jsonb_typeof(rule)<>'object' or not (rule ?& array['version','frequency','interval','startDate','endDate']) then return false; end if;
 if rule->'version'<>'1'::jsonb or jsonb_typeof(rule->'interval')<>'number' or (rule->>'interval') !~ '^[0-9]+$' or (rule->>'interval')::numeric not between 1 and 999 then return false; end if;
 if (rule->>'startDate') !~ '^\d{4}-\d{2}-\d{2}$' or jsonb_typeof(rule->'startDate')<>'string' then return false; end if;
 start_day := (rule->>'startDate')::date;
 if rule->'endDate'<>'null'::jsonb then
  if jsonb_typeof(rule->'endDate')<>'string' or (rule->>'endDate') !~ '^\d{4}-\d{2}-\d{2}$' then return false; end if;
  end_day := (rule->>'endDate')::date;
  if end_day < start_day then return false; end if;
 end if;
 frequency := rule->>'frequency';
 if frequency is null or frequency not in ('daily','weekly','monthly') then return false; end if;
 if frequency='weekly' then
  if jsonb_typeof(rule->'weekdays') is distinct from 'array' then return false; end if;
  if jsonb_array_length(rule->'weekdays') not between 1 and 7 then return false; end if;
  for weekday in select value from jsonb_array_elements(rule->'weekdays') loop
   if jsonb_typeof(weekday)<>'number' or weekday::text !~ '^[1-7]$' then return false; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(rule->'weekdays')) <> jsonb_array_length(rule->'weekdays') then return false; end if;
 end if;
 if frequency='monthly' then
  if jsonb_typeof(rule->'dayOfMonth') is distinct from 'number' or (rule->>'dayOfMonth') !~ '^[0-9]+$' or (rule->>'dayOfMonth')::numeric not between 1 and 31 then return false; end if;
 end if;
 return true;
exception when others then return false;
end $$;
revoke all on function private.valid_local_recurrence(jsonb) from public;
grant execute on function private.valid_local_recurrence(jsonb) to authenticated;
alter table public.calendar_events add column local_recurrence jsonb;
alter table public.calendar_events add constraint valid_local_series check (
 private.valid_local_recurrence(local_recurrence) and (local_recurrence is null or (
 source_kind='local' and recurrence is null and not all_day and end_time is not null
 and (start_time at time zone time_zone)::date = (local_recurrence->>'startDate')::date
 and ((end_time at time zone time_zone)::date - (start_time at time zone time_zone)::date) between 0 and 7
 ))
);
create function private.valid_image_presentation(value jsonb, preset text) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 if value is null then return true; end if;
 if jsonb_typeof(value)<>'object' or not(value ?& array['version','preset','x','y','zoom']) then return false; end if;
 return coalesce(value->'version'='1'::jsonb and value->>'preset'=preset
  and jsonb_typeof(value->'x')='number' and (value->>'x')::numeric between 0 and 1
  and jsonb_typeof(value->'y')='number' and (value->>'y')::numeric between 0 and 1
  and jsonb_typeof(value->'zoom')='number' and (value->>'zoom')::numeric between 1 and 3,false);
exception when others then return false;
end $$;
revoke all on function private.valid_image_presentation(jsonb,text) from public;
grant execute on function private.valid_image_presentation(jsonb,text) to authenticated;
do $$ declare table_name text; begin
 foreach table_name in array array['people','places','activities'] loop
  execute format('alter table public.%I add column source_image_path text, add column image_presentation jsonb',table_name);
  execute format('alter table public.%I add constraint source_image_household check (source_image_path is null or split_part(source_image_path,''/'',1)=household_id::text)',table_name);
  execute format('alter table public.%I add constraint image_presentation_valid check (private.valid_image_presentation(image_presentation,%L))',table_name,table_name);
 end loop;
end $$;
-- Both original and display derivative retain the existing private object policies.
update storage.buckets set file_size_limit=10485760 where id='household-images';
create or replace function public.save_local_event(payload jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare hid uuid := (payload->>'household_id')::uuid;
 eid uuid := coalesce((payload->>'id')::uuid, gen_random_uuid());
 pid uuid; person uuid; vid uuid;
begin
 if not private.is_member(hid) then raise exception 'Not authorized'; end if;
 if coalesce(jsonb_typeof(payload->'profile_ids'),'null') <> 'array' then raise exception 'Select a profile'; end if;
 if jsonb_array_length(payload->'profile_ids') < 1 then raise exception 'Select a profile'; end if;
 if exists(select 1 from public.calendar_events where id=eid and source_kind<>'local') then raise exception 'Linked events are read-only'; end if;
 insert into public.calendar_events(id,household_id,title,start_time,end_time,time_zone,location,local_recurrence)
 values(eid,hid,payload->>'title',(payload->>'start_time')::timestamptz,(payload->>'end_time')::timestamptz,payload->>'time_zone',coalesce(payload->>'location',''),nullif(payload->'local_recurrence','null'::jsonb))
 on conflict(id) do update set title=excluded.title,start_time=excluded.start_time,end_time=excluded.end_time,time_zone=excluded.time_zone,location=excluded.location,local_recurrence=case when payload ? 'local_recurrence' then excluded.local_recurrence else public.calendar_events.local_recurrence end;
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
commit;
