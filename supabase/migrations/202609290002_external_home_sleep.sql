begin;
-- App-owned per-profile effects. Provider scheduling rows and credentials are untouched.
alter table public.event_profile_mappings
 add column target text not null default 'activity',
 add column sleep_place_id uuid,
 add column sleep_caregiver_id uuid,
 add column bedtime_mode text,
 add column bedtime_override time;
update public.event_profile_mappings set target='ignore' where action='ignore';
alter table public.event_profile_mappings drop constraint event_profile_mappings_check;
alter table public.event_profile_mappings
 add foreign key(household_id,sleep_place_id) references public.places(household_id,id),
 add foreign key(household_id,sleep_caregiver_id) references public.people(household_id,id),
 add constraint mapping_target_effect check (
  (target='activity' and action='include' and activity_id is not null and place_id is not null
   and sleep_place_id is null and sleep_caregiver_id is null and bedtime_mode is null and bedtime_override is null)
  or (target='ignore' and action='ignore' and sleep_place_id is null and sleep_caregiver_id is null and bedtime_mode is null and bedtime_override is null)
  or (target='home_sleep' and action='include' and sleep_place_id is not null
   and activity_id is null and place_id is null and caregiver_id is null and picture_person_id is null
   and bedtime_mode is not null and ((bedtime_mode='use_normal_bedtime' and bedtime_override is null)
    or (bedtime_mode='explicit' and bedtime_override is not null and bedtime_override<'24:00'::time)))
 );
create or replace function public.save_external_mapping(payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare hid uuid:=(payload->>'household_id')::uuid; cid uuid:=(payload->>'calendar_id')::uuid; pid uuid; key text:=payload->>'group_key'; target text:=coalesce(payload->>'target',case when payload->>'action'='ignore' then 'ignore' else 'activity' end);
begin
 if target not in ('activity','ignore','home_sleep') then raise exception 'Invalid mapping target'; end if;
 if target='home_sleep' and coalesce((payload->>'create_rule')::boolean,false) then raise exception 'Home sleep mappings use event or series scope'; end if;
 if not private.is_member(hid) then raise exception 'Not authorized'; end if;
 if jsonb_typeof(payload->'profile_ids') is distinct from 'array' or jsonb_array_length(payload->'profile_ids')<1 then raise exception 'Select a profile'; end if;
 if not exists(select 1 from public.external_event_sources where household_id=hid and calendar_id=cid and (key='event:'||external_event_id or key='series:'||external_series_id)) then raise exception 'Unknown external event or series'; end if;
 for pid in select value::uuid from jsonb_array_elements_text(payload->'profile_ids') loop
  if target='home_sleep' and not exists(select 1 from public.profiles where id=pid and household_id=hid and active) then raise exception 'Select an active household profile'; end if;
  insert into public.event_profile_mappings(household_id,calendar_id,group_key,profile_id,action,activity_id,place_id,caregiver_id,picture_person_id,label,visible,is_primary,target,sleep_place_id,sleep_caregiver_id,bedtime_mode,bedtime_override)
  values(hid,cid,key,pid,case when target='ignore' then 'ignore' else 'include' end,case when target='home_sleep' then null else (payload->>'activity_id')::uuid end,case when target='home_sleep' then null else (payload->>'place_id')::uuid end,case when target='home_sleep' then null else (payload->>'caregiver_id')::uuid end,case when target='home_sleep' then null else (payload->>'picture_person_id')::uuid end,nullif(trim(payload->>'label'),''),coalesce((payload->>'visible')::boolean,true),coalesce((payload->>'is_primary')::boolean,false),target,
   case when target='home_sleep' then (payload->>'sleep_place_id')::uuid end,case when target='home_sleep' then (payload->>'sleep_caregiver_id')::uuid end,
   case when target='home_sleep' then coalesce(payload->>'bedtime_mode','use_normal_bedtime') end,case when target='home_sleep' then nullif(payload->>'bedtime_override','')::time end)
  on conflict(calendar_id,group_key,profile_id) do update set action=excluded.action,activity_id=excluded.activity_id,place_id=excluded.place_id,caregiver_id=excluded.caregiver_id,picture_person_id=excluded.picture_person_id,label=excluded.label,visible=excluded.visible,is_primary=excluded.is_primary,target=excluded.target,sleep_place_id=excluded.sleep_place_id,sleep_caregiver_id=excluded.sleep_caregiver_id,bedtime_mode=excluded.bedtime_mode,bedtime_override=excluded.bedtime_override;
  if coalesce((payload->>'create_rule')::boolean,false) then
   insert into public.event_matching_rules(household_id,profile_id,name,title_operator,title_value,calendar_id,action,activity_id,place_id,caregiver_id,picture_person_id,label,visible,is_primary,priority)
   values(hid,pid,'Inbox: '||left(payload->>'rule_title',80),'contains',trim(payload->>'rule_title'),cid,payload->>'action',case when target='home_sleep' then null else (payload->>'activity_id')::uuid end,case when target='home_sleep' then null else (payload->>'place_id')::uuid end,case when target='home_sleep' then null else (payload->>'caregiver_id')::uuid end,case when target='home_sleep' then null else (payload->>'picture_person_id')::uuid end,nullif(trim(payload->>'label'),''),coalesce((payload->>'visible')::boolean,true),coalesce((payload->>'is_primary')::boolean,false),0);
  end if;
 end loop;
end $$;
revoke all on function public.save_external_mapping(jsonb) from public,anon;
grant execute on function public.save_external_mapping(jsonb) to authenticated;

commit;
