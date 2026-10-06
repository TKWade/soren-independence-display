-- Private PIN hashes and session-bound display grants; no restricted-device auth.
begin;
alter table public.profiles add column role text not null default 'child' check(role in ('child','sibling','caregiver','other'));
alter table public.profiles add column image_path text check(image_path is null or split_part(image_path,'/',1)=household_id::text);
alter table public.profiles add column avatar text check(avatar is null or avatar in ('sun','star','flower','moon'));
create table private.household_display_security (
 household_id uuid primary key references public.households(id) on delete cascade,
 pin_hash text check(pin_hash is null or pin_hash ~ '^pbkdf2-sha256\$600000\$[a-f0-9]{64}\$[a-f0-9]{64}$'),
 allow_child_to_child_switching boolean not null default true,
 require_pin_for_all_profile_switches boolean not null default false, revision bigint not null default 0
);
create table private.display_profile_access (
 household_id uuid not null references public.households(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, session_id uuid not null,
 profile_id uuid not null, pin_until timestamptz, primary key(household_id,user_id,session_id),
 foreign key(household_id,profile_id) references public.profiles(household_id,id) on delete cascade
);
create table private.display_pin_attempts (
 household_id uuid not null references public.households(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 failures integer not null default 0,next_attempt_at timestamptz not null default now(),
 ticket uuid,ticket_until timestamptz,session_id uuid,profile_id uuid,revision bigint,primary key(household_id,user_id)
);
alter table private.household_display_security enable row level security;
alter table private.display_profile_access enable row level security;
alter table private.display_pin_attempts enable row level security;
revoke all on private.household_display_security,private.display_profile_access,private.display_pin_attempts from public,anon,authenticated,service_role;
create function private.display_session_id() returns uuid language sql stable set search_path='' as $$
 select nullif(coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)->>'session_id','')::uuid;
$$;
revoke all on function private.display_session_id() from public,anon;
grant execute on function private.display_session_id() to authenticated;
create function public.display_profile_context(hid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare settings private.household_display_security; ids jsonb; selected uuid;
begin
 if not private.is_member(hid) or private.display_session_id() is null then raise exception 'Not authorized'; end if;
 select * into settings from private.household_display_security where household_id=hid;
 select coalesce(jsonb_agg(id order by created_at,id),'[]'::jsonb) into ids from public.profiles where household_id=hid and active;
 select profile_id into selected from private.display_profile_access where household_id=hid and user_id=auth.uid() and session_id=private.display_session_id();
 return jsonb_build_object('authorization',jsonb_build_object('householdId',hid,'allowedProfileIds',ids,'defaultProfileId',selected,'scope','trusted-caregiver-display'),
 'settings',jsonb_build_object('allowChildToChildSwitching',coalesce(settings.allow_child_to_child_switching,true),'requirePinForAllProfileSwitches',coalesce(settings.require_pin_for_all_profile_switches,false),'pinConfigured',settings.pin_hash is not null));
end $$;
create function public.authorize_display_profile(hid uuid,pid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.profiles; current_profile public.profiles; access private.display_profile_access; settings private.household_display_security; protected boolean; sid uuid:=private.display_session_id();
begin
 if not private.is_member(hid) or sid is null then return jsonb_build_object('allowed',false,'reason','unavailable'); end if;
 select * into target from public.profiles where id=pid and household_id=hid and active;
 if target.id is null then return jsonb_build_object('allowed',false,'reason','unavailable'); end if;
 perform pg_advisory_xact_lock(hashtextextended(hid::text||auth.uid()::text||sid::text,0));
 select * into settings from private.household_display_security where household_id=hid;
 select * into access from private.display_profile_access where household_id=hid and user_id=auth.uid() and session_id=sid;
 select * into current_profile from public.profiles where id=access.profile_id and household_id=hid and active;
 protected:=target.role='caregiver' or coalesce(settings.require_pin_for_all_profile_switches,false)
 or (not coalesce(settings.allow_child_to_child_switching,true) and target.role in ('child','sibling') and (current_profile.id is null or current_profile.role<>'caregiver'));
 if protected and not coalesce(access.profile_id=pid and access.pin_until>now(),false) then
 return jsonb_build_object('allowed',false,'reason',case when settings.pin_hash is null then 'pin_not_configured' else 'pin_required' end); end if;
 insert into private.display_profile_access(household_id,user_id,session_id,profile_id,pin_until) values(hid,auth.uid(),sid,pid,case when access.profile_id=pid then access.pin_until end)
 on conflict(household_id,user_id,session_id) do update set profile_id=excluded.profile_id,pin_until=excluded.pin_until;
 return jsonb_build_object('allowed',true)||case when protected then jsonb_build_object('expiresIn',greatest(0,floor(extract(epoch from access.pin_until-now()))::integer)) else '{}'::jsonb end;
end $$;
-- Only the trusted Edge service can call these RPCs or receive a hash/ticket.
create function public.configure_display_security(hid uuid,uid uuid,settings jsonb,new_hash text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.household_members where household_id=hid and user_id=uid) then raise exception 'Not authorized'; end if;
 if jsonb_typeof(settings->'allowChildToChildSwitching') is distinct from 'boolean' or jsonb_typeof(settings->'requirePinForAllProfileSwitches') is distinct from 'boolean' then raise exception 'Invalid settings'; end if;
 insert into private.household_display_security(household_id,pin_hash,allow_child_to_child_switching,require_pin_for_all_profile_switches,revision)
 values(hid,new_hash,(settings->>'allowChildToChildSwitching')::boolean,(settings->>'requirePinForAllProfileSwitches')::boolean,1)
 on conflict(household_id) do update set pin_hash=coalesce(excluded.pin_hash,private.household_display_security.pin_hash),allow_child_to_child_switching=excluded.allow_child_to_child_switching,require_pin_for_all_profile_switches=excluded.require_pin_for_all_profile_switches,revision=private.household_display_security.revision+1;
 delete from private.display_profile_access where household_id=hid;
 delete from private.display_pin_attempts where household_id=hid;
end $$;
create function public.begin_display_pin(hid uuid,uid uuid,sid uuid,pid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare settings private.household_display_security; attempt private.display_pin_attempts; token uuid:=gen_random_uuid(); delay integer;
begin
 if sid is null or not exists(select 1 from public.household_members where household_id=hid and user_id=uid) or not exists(select 1 from public.profiles where household_id=hid and id=pid and active) then return jsonb_build_object('allowed',false,'reason','unavailable'); end if;
 select * into settings from private.household_display_security where household_id=hid;
 if settings.pin_hash is null then return jsonb_build_object('allowed',false,'reason','pin_not_configured'); end if;
 insert into private.display_pin_attempts(household_id,user_id) values(hid,uid) on conflict do nothing;
 select * into attempt from private.display_pin_attempts where household_id=hid and user_id=uid for update;
 if attempt.next_attempt_at>now() then return jsonb_build_object('allowed',false,'reason','retry','retryAfter',ceil(extract(epoch from attempt.next_attempt_at-now()))::integer); end if;
 -- Count before hashing: concurrent/interrupted requests cannot bypass backoff.
 delay:=case when attempt.failures<4 then 1 else least(60,5*power(2,least(4,attempt.failures-4))::integer) end;
 update private.display_pin_attempts set failures=failures+1,next_attempt_at=now()+make_interval(secs=>delay),ticket=token,ticket_until=now()+interval '15 seconds',session_id=sid,profile_id=pid,revision=settings.revision where household_id=hid and user_id=uid;
 return jsonb_build_object('allowed',true,'hash',settings.pin_hash,'ticket',token,'revision',settings.revision);
end $$;
create function public.finish_display_pin(hid uuid,uid uuid,sid uuid,pid uuid,token uuid,revision bigint,verified boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt private.display_pin_attempts;
begin
 select * into attempt from private.display_pin_attempts where household_id=hid and user_id=uid for update;
 if attempt.ticket is distinct from token or token is null or attempt.session_id is distinct from sid or attempt.profile_id is distinct from pid or attempt.revision is distinct from revision or attempt.ticket_until<=now()
 or not exists(select 1 from private.household_display_security s where s.household_id=hid and s.revision=finish_display_pin.revision)
 or not exists(select 1 from public.household_members where household_id=hid and user_id=uid) or not exists(select 1 from public.profiles where household_id=hid and id=pid and active) then return jsonb_build_object('allowed',false,'reason','unavailable'); end if;
 update private.display_pin_attempts set ticket=null,ticket_until=null where household_id=hid and user_id=uid;
 if not verified then return jsonb_build_object('allowed',false,'reason','incorrect','retryAfter',greatest(0,ceil(extract(epoch from attempt.next_attempt_at-now()))::integer)); end if;
 perform pg_advisory_xact_lock(hashtextextended(hid::text||uid::text||sid::text,0));
 insert into private.display_profile_access(household_id,user_id,session_id,profile_id,pin_until) values(hid,uid,sid,pid,now()+interval '15 minutes')
 on conflict(household_id,user_id,session_id) do update set profile_id=excluded.profile_id,pin_until=excluded.pin_until;
 update private.display_pin_attempts set failures=0,next_attempt_at=now() where household_id=hid and user_id=uid;
 return jsonb_build_object('allowed',true,'expiresIn',900);
end $$;
revoke all on function public.display_profile_context(uuid),public.authorize_display_profile(uuid,uuid) from public,anon;
grant execute on function public.display_profile_context(uuid),public.authorize_display_profile(uuid,uuid) to authenticated;
revoke all on function public.configure_display_security(uuid,uuid,jsonb,text),public.begin_display_pin(uuid,uuid,uuid,uuid),public.finish_display_pin(uuid,uuid,uuid,uuid,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.configure_display_security(uuid,uuid,jsonb,text),public.begin_display_pin(uuid,uuid,uuid,uuid),public.finish_display_pin(uuid,uuid,uuid,uuid,uuid,bigint,boolean) to service_role;
create or replace function public.save_display_profile(payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(payload->>'id')::uuid; hid uuid:=(payload->>'household_id')::uuid;
begin
 if not private.is_member(hid) then raise exception 'Not authorized'; end if;
 insert into public.profiles(id,household_id,name,active,role,image_path,avatar) values(pid,hid,payload->>'name',(payload->>'active')::boolean,coalesce(payload->>'role','child'),payload->>'image_path',payload->>'avatar')
 on conflict(id) do update set name=excluded.name,active=excluded.active,role=case when payload?'role' then excluded.role else public.profiles.role end,image_path=case when payload?'image_path' then excluded.image_path else public.profiles.image_path end,avatar=case when payload?'avatar' then excluded.avatar else public.profiles.avatar end;
 insert into public.profile_display_preferences(household_id,profile_id,preferences) values(hid,pid,payload->'preferences') on conflict(profile_id) do update set preferences=excluded.preferences;
end $$;
create function private.invalidate_profile_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role is distinct from old.role or new.active is distinct from old.active then delete from private.display_profile_access where household_id=new.household_id; end if; return new;
end $$;
revoke all on function private.invalidate_profile_access() from public,anon,authenticated;
create trigger invalidate_profile_access after update on public.profiles for each row execute function private.invalidate_profile_access();
-- Profile photos use the existing private image bucket and cleanup fencing.
create or replace function private.guard_cleanup_image() returns trigger language plpgsql security definer set search_path='' as $$
declare image_key text;
begin
 for image_key in select distinct x from unnest(array[to_jsonb(new)->>'image_path',to_jsonb(new)->>'source_image_path']) x where x is not null order by x loop
  perform pg_advisory_xact_lock(hashtextextended(image_key,732));
  if exists(select 1 from private.image_cleanup_queue q where q.path=image_key and q.state in ('deleting','done')) then raise exception 'Image no longer available; upload again'; end if;
 end loop;return new;
end $$;
create trigger guard_profile_image before insert or update of image_path on public.profiles for each row execute function private.guard_cleanup_image();
create function private.queue_profile_image() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.image_path is not null and (tg_op='DELETE' or old.image_path is distinct from new.image_path) then
  insert into private.image_cleanup_queue(household_id,path) values(old.household_id,old.image_path) on conflict(path) do nothing;
 end if;
 return null;
end $$;
revoke all on function private.queue_profile_image() from public,anon,authenticated;
create trigger queue_profile_image after update of image_path or delete on public.profiles for each row execute function private.queue_profile_image();
create or replace function public.claim_image_cleanup(hid uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare item record;claimed jsonb:='[]';
begin
 for item in select * from private.image_cleanup_queue q where q.state<>'done' and (hid is null or q.household_id=hid) order by q.updated_at limit 100 for update skip locked loop
  perform pg_advisory_xact_lock(hashtextextended(item.path,732));
  if exists(select 1 from public.people where image_path=item.path or source_image_path=item.path union all select 1 from public.places where image_path=item.path or source_image_path=item.path union all select 1 from public.activities where image_path=item.path or source_image_path=item.path union all select 1 from public.profiles where image_path=item.path) then update private.image_cleanup_queue set updated_at=now() where path=item.path;continue;end if;
  update private.image_cleanup_queue set state='deleting',updated_at=now() where path=item.path;
  claimed:=claimed||jsonb_build_array(item.path);
 end loop;return claimed;
end $$;
commit;
