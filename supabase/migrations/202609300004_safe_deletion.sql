begin;
-- Audited references are counted from the FK catalog, including multiple person roles per row.
create function public.deletion_preview(hid uuid,entity text,rid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare label text;source text;dependencies jsonb:='{}';ref record;n bigint;blocked boolean:=false;
begin
 if not private.is_member(hid) then raise exception 'Not authorized';end if;
 if entity not in ('people','places','activities','profiles','calendar_events','home_rules','event_profile_mappings','event_matching_rules') then raise exception 'Unsupported entity';end if;
 execute format('select %s from public.%I where household_id=$1 and id=$2',case when entity in ('people','places','activities','profiles','event_matching_rules') then 'name' when entity='calendar_events' then 'title' else 'id::text' end,entity) into label using hid,rid;
 if label is null then raise exception 'Record not found';end if;
 if entity='home_rules' then select p.name||' · '||coalesce(r.override_date::text,(array['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[r.weekday+1])||' sleep rule' into label from public.home_rules r join public.profiles p on p.id=r.profile_id where r.id=rid and r.household_id=hid;end if;
 if entity='event_profile_mappings' then select p.name||' · '||replace(m.target,'_',' ')||' · '||case when m.group_key like 'series:%' then 'series mapping' else 'occurrence mapping' end into label from public.event_profile_mappings m join public.profiles p on p.id=m.profile_id where m.id=rid and m.household_id=hid;end if;
 for ref in
  select c.relname,string_agg(distinct format('%I=$2',a.attname),' or ') predicate
  from pg_constraint f join pg_class c on c.oid=f.conrelid join pg_namespace ns on ns.oid=c.relnamespace
  cross join lateral unnest(f.conkey,f.confkey) keys(child,parent)
  join pg_attribute a on a.attrelid=f.conrelid and a.attnum=keys.child
  join pg_attribute p on p.attrelid=f.confrelid and p.attnum=keys.parent
  where f.contype='f' and f.confrelid=format('public.%I',entity)::regclass and ns.nspname='public' and p.attname='id' group by c.relname
 loop
  execute format('select count(*) from public.%I where household_id=$1 and (%s)',ref.relname,ref.predicate) into n using hid,rid;
  dependencies:=dependencies||jsonb_build_object(ref.relname,n);
 end loop;
 if entity in ('people','places','activities') then select coalesce(bool_or(value::bigint>0),false) into blocked from jsonb_each_text(dependencies);end if;
 if entity='profiles' and (select count(*) from public.profiles where household_id=hid)<=1 then blocked:=true;end if;
 if entity='calendar_events' then select source_kind into source from public.calendar_events where id=rid and household_id=hid;if source='external' then blocked:=true;end if;end if;
 return jsonb_build_object('name',label,'dependencies',dependencies,'blocked',blocked);
end $$;
create table private.image_cleanup_queue (household_id uuid not null references public.households(id) on delete cascade,path text primary key,state text not null default 'pending' check(state in ('pending','deleting','done')),updated_at timestamptz not null default now());
revoke all on private.image_cleanup_queue from public,anon,authenticated,service_role;
create function private.guard_cleanup_image() returns trigger language plpgsql security definer set search_path='' as $$
declare image_key text;
begin
 for image_key in select distinct x from unnest(array[new.image_path,new.source_image_path]) x where x is not null order by x loop
  perform pg_advisory_xact_lock(hashtextextended(image_key,732));
  if exists(select 1 from private.image_cleanup_queue q where q.path=image_key and q.state in ('deleting','done')) then raise exception 'Image no longer available; upload again';end if;
 end loop;return new;
end $$;
revoke all on function private.guard_cleanup_image() from public,anon,authenticated;
create trigger guard_people_image before insert or update of image_path,source_image_path on public.people for each row execute function private.guard_cleanup_image();
create trigger guard_places_image before insert or update of image_path,source_image_path on public.places for each row execute function private.guard_cleanup_image();
create trigger guard_activities_image before insert or update of image_path,source_image_path on public.activities for each row execute function private.guard_cleanup_image();
create function public.delete_owned_record(hid uuid,entity text,rid uuid,confirmation text) returns void language plpgsql security definer set search_path='' as $$
declare preview jsonb;images text[];
begin
 if not private.is_member(hid) then raise exception 'Not authorized';end if;
 -- Serializes profile deletions and protects the last-profile check.
 perform 1 from public.households where id=hid for update;
 preview:=public.deletion_preview(hid,entity,rid);
 if (preview->>'blocked')::boolean then raise exception 'Deletion blocked: reassign dependencies, keep a profile, or edit the provider event';end if;
 if confirmation is distinct from preview->>'name' then raise exception 'Confirmation does not match';end if;
 if entity='profiles' then
  delete from public.event_visuals where household_id=hid and profile_id=rid;
  delete from public.event_profile_mappings where household_id=hid and profile_id=rid;
  delete from public.event_matching_rules where household_id=hid and profile_id=rid;
  delete from public.home_rules where household_id=hid and profile_id=rid;
  delete from public.profile_home_preferences where household_id=hid and profile_id=rid;
  delete from public.profile_display_preferences where household_id=hid and profile_id=rid;
 end if;
 if entity in ('people','places','activities') then
  execute format('select array[image_path,source_image_path] from public.%I where household_id=$1 and id=$2 for update',entity) into images using hid,rid;
 end if;
 -- FK constraints are the final race-safe barrier for newly added library dependencies.
 execute format('delete from public.%I where household_id=$1 and id=$2',entity) using hid,rid;
 if images is not null then
  insert into private.image_cleanup_queue(household_id,path) select hid,x from (select distinct unnest(images) x) i where x is not null and split_part(x,'/',1)=hid::text on conflict(path) do nothing;
 end if;
end $$;
create function public.claim_image_cleanup(hid uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare item record;claimed jsonb:='[]';
begin
 for item in select * from private.image_cleanup_queue q where q.state<>'done' and (hid is null or q.household_id=hid) order by q.updated_at limit 100 for update skip locked loop
  perform pg_advisory_xact_lock(hashtextextended(item.path,732));
  if exists(select 1 from public.people where image_path=item.path or source_image_path=item.path union all select 1 from public.places where image_path=item.path or source_image_path=item.path union all select 1 from public.activities where image_path=item.path or source_image_path=item.path) then update private.image_cleanup_queue set updated_at=now() where path=item.path;continue;end if;
  update private.image_cleanup_queue set state='deleting',updated_at=now() where path=item.path;
  claimed:=claimed||jsonb_build_array(item.path);
 end loop;return claimed;
end $$;
create function public.finish_image_cleanup(paths text[]) returns void language sql security definer set search_path='' as $$
 update private.image_cleanup_queue set state='done',updated_at=now() where path=any(paths) and state='deleting';
$$;
revoke all on function public.deletion_preview(uuid,text,uuid),public.delete_owned_record(uuid,text,uuid,text) from public,anon;
grant execute on function public.deletion_preview(uuid,text,uuid),public.delete_owned_record(uuid,text,uuid,text) to authenticated;
revoke all on function public.claim_image_cleanup(uuid),public.finish_image_cleanup(text[]) from public,anon,authenticated;
grant execute on function public.claim_image_cleanup(uuid),public.finish_image_cleanup(text[]) to service_role;
-- New permanent deletion paths cannot bypass the dependency/confirmation transactions.
revoke delete on public.people,public.places,public.activities,public.profiles,public.calendar_events,public.home_rules,public.event_profile_mappings,public.event_matching_rules from authenticated;
commit;
