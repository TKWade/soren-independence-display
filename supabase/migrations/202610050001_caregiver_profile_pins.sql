begin;
-- Credentials belong to a caregiver, never to the household. KDF remains PBKDF2-SHA256/600000.
create table private.caregiver_profile_credentials (
 household_id uuid not null, profile_id uuid not null, pin_hash text, pin_salt text,
 pin_version bigint not null default 1 check(pin_version>0), pin_change_required boolean not null default false,
 primary key(household_id,profile_id),
 foreign key(household_id,profile_id) references public.profiles(household_id,id) on delete cascade,
 check ((pin_hash is null and pin_salt is null) or (pin_hash is not null and pin_salt is not null and pin_hash ~ '^[a-f0-9]{64}$' and pin_salt ~ '^[a-f0-9]{64}$'))
);
insert into private.caregiver_profile_credentials(household_id,profile_id,pin_hash,pin_salt)
 select s.household_id,p.id,split_part(s.pin_hash,'$',4),split_part(s.pin_hash,'$',3)
 from private.household_display_security s join public.profiles p on p.household_id=s.household_id and p.role='caregiver'
 where s.pin_hash is not null and (select count(*) from public.profiles c where c.household_id=s.household_id and c.role='caregiver')=1;
-- Invalidate legacy shared credentials/grants, including ambiguous ownership. No guessing.
drop function public.begin_display_pin(uuid,uuid,uuid,uuid);
drop function public.finish_display_pin(uuid,uuid,uuid,uuid,uuid,bigint,boolean);
drop function public.configure_display_security(uuid,uuid,jsonb,text);
drop table private.display_pin_attempts;
truncate private.display_profile_access;
alter table private.household_display_security drop column pin_hash;
create table private.caregiver_pin_attempts (
 household_id uuid not null, caregiver_id uuid not null, user_id uuid not null references auth.users(id) on delete cascade,
 failures integer not null default 0,next_attempt_at timestamptz not null default now(),
 ticket uuid,ticket_until timestamptz, session_id uuid,target_id uuid,pin_version bigint,revision bigint,
 change_token uuid,change_until timestamptz,
 primary key(household_id,caregiver_id,user_id),
 foreign key(household_id,caregiver_id) references private.caregiver_profile_credentials(household_id,profile_id) on delete cascade,
 foreign key(household_id,target_id) references public.profiles(household_id,id) on delete cascade
);
create table private.caregiver_display_grants (
 household_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,session_id uuid not null,
 target_id uuid not null,caregiver_id uuid not null,pin_version bigint not null,expires_at timestamptz not null,
 primary key(household_id,user_id,session_id,target_id),
 foreign key(household_id,target_id) references public.profiles(household_id,id) on delete cascade,
 foreign key(household_id,caregiver_id) references private.caregiver_profile_credentials(household_id,profile_id) on delete cascade
);
alter table private.caregiver_profile_credentials enable row level security;
alter table private.caregiver_pin_attempts enable row level security;
alter table private.caregiver_display_grants enable row level security;
revoke all on private.caregiver_profile_credentials,private.caregiver_pin_attempts,private.caregiver_display_grants from public,anon,authenticated,service_role;
create function private.guard_caregiver_credential() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.profiles where household_id=new.household_id and id=new.profile_id and role='caregiver') then raise exception 'Caregiver profile required'; end if;
 if tg_op='UPDATE' then
  new.pin_version:=old.pin_version+1;
  delete from private.caregiver_display_grants where household_id=new.household_id and caregiver_id=new.profile_id;
  delete from private.caregiver_pin_attempts where household_id=new.household_id and caregiver_id=new.profile_id;
 end if;return new;
end $$;
create trigger guard_caregiver_credential before insert or update on private.caregiver_profile_credentials for each row execute function private.guard_caregiver_credential();
create or replace function private.invalidate_profile_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role is distinct from old.role or new.active is distinct from old.active then
  delete from private.display_profile_access where household_id=new.household_id and profile_id=new.id;
  delete from private.caregiver_display_grants where household_id=new.household_id and (target_id=new.id or caregiver_id=new.id);
  delete from private.caregiver_pin_attempts where household_id=new.household_id and (target_id=new.id or caregiver_id=new.id);
 end if;
 if new.role<>'caregiver' then delete from private.caregiver_profile_credentials where household_id=new.household_id and profile_id=new.id;end if;
 return new;
end $$;
-- Deferred check permits the trusted atomic save to insert profile then its credential.
-- Existing ambiguous caregivers remain locked, but creation/conversion cannot produce new missing credentials.
create function private.require_new_caregiver_pin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='caregiver' and (tg_op='INSERT' or old.role<>'caregiver') and exists(select 1 from public.profiles where id=new.id and role='caregiver')
 and not exists(select 1 from private.caregiver_profile_credentials where household_id=new.household_id and profile_id=new.id and pin_hash is not null) then raise exception 'Caregiver PIN setup required';end if;
 return null;
end $$;
create constraint trigger require_new_caregiver_pin after insert or update on public.profiles deferrable initially deferred for each row execute function private.require_new_caregiver_pin();
create or replace function public.display_profile_context(hid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare settings private.household_display_security;ids jsonb;selected uuid;credentials jsonb;
begin
 if not private.is_member(hid) or private.display_session_id() is null then raise exception 'Not authorized';end if;
 select * into settings from private.household_display_security where household_id=hid;
 select coalesce(jsonb_agg(id order by created_at,id),'[]') into ids from public.profiles where household_id=hid and active;
 select profile_id into selected from private.display_profile_access where household_id=hid and user_id=auth.uid() and session_id=private.display_session_id();
 select coalesce(jsonb_object_agg(p.id,jsonb_build_object('configured',c.pin_hash is not null,'changeRequired',coalesce(c.pin_change_required,false))),'{}') into credentials
 from public.profiles p left join private.caregiver_profile_credentials c on c.household_id=p.household_id and c.profile_id=p.id where p.household_id=hid and p.role='caregiver';
 return jsonb_build_object('authorization',jsonb_build_object('householdId',hid,'allowedProfileIds',ids,'defaultProfileId',selected,'scope','trusted-caregiver-display'),
 'settings',jsonb_build_object('allowChildToChildSwitching',coalesce(settings.allow_child_to_child_switching,true),'requirePinForAllProfileSwitches',coalesce(settings.require_pin_for_all_profile_switches,false)),'caregivers',credentials);
end $$;
create or replace function public.authorize_display_profile(hid uuid,pid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.profiles;source public.profiles;settings private.household_display_security;protected boolean;sid uuid:=private.display_session_id();until timestamptz;configured boolean;
begin
 if not private.is_member(hid) or sid is null then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
 perform pg_advisory_xact_lock(hashtextextended(hid::text||auth.uid()::text||sid::text,0));
 select * into target from public.profiles where household_id=hid and id=pid and active;
 if target.id is null then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
 select * into settings from private.household_display_security where household_id=hid;
 select p.* into source from public.profiles p join private.display_profile_access a on a.profile_id=p.id and a.household_id=p.household_id where a.household_id=hid and a.user_id=auth.uid() and a.session_id=sid and p.active;
 -- A stale caregiver selection cannot grant the privileges of a still-unlocked caregiver.
 if source.role='caregiver' and not exists(select 1 from private.caregiver_display_grants g join private.caregiver_profile_credentials c on c.household_id=g.household_id and c.profile_id=g.caregiver_id where g.household_id=hid and g.user_id=auth.uid() and g.session_id=sid and g.target_id=source.id and g.caregiver_id=source.id and g.expires_at>now() and c.pin_version=g.pin_version and not c.pin_change_required) then source:=null;end if;
 protected:=target.role='caregiver' or coalesce(settings.require_pin_for_all_profile_switches,false) or (not coalesce(settings.allow_child_to_child_switching,true) and target.role in ('child','sibling') and (source.id is null or source.role<>'caregiver'));
 select g.expires_at into until from private.caregiver_display_grants g join private.caregiver_profile_credentials c on c.household_id=g.household_id and c.profile_id=g.caregiver_id join public.profiles p on p.household_id=c.household_id and p.id=c.profile_id
 where g.household_id=hid and g.user_id=auth.uid() and g.session_id=sid and g.target_id=pid and g.expires_at>now() and c.pin_version=g.pin_version and not c.pin_change_required and c.pin_hash is not null and p.active and p.role='caregiver' and (target.role<>'caregiver' or g.caregiver_id=pid);
 if protected and until is null then
  select exists(select 1 from private.caregiver_profile_credentials c join public.profiles p on p.household_id=c.household_id and p.id=c.profile_id where c.household_id=hid and c.pin_hash is not null and p.active and p.role='caregiver' and (target.role<>'caregiver' or p.id=pid)) into configured;
  return jsonb_build_object('allowed',false,'reason',case when configured then 'pin_required' else 'pin_not_configured' end);
 end if;
 insert into private.display_profile_access(household_id,user_id,session_id,profile_id) values(hid,auth.uid(),sid,pid) on conflict(household_id,user_id,session_id) do update set profile_id=excluded.profile_id,pin_until=null;
 return jsonb_build_object('allowed',true)||case when protected then jsonb_build_object('expiresIn',greatest(0,floor(extract(epoch from until-now()))::integer)) else '{}'::jsonb end;
end $$;
create function public.configure_display_security(hid uuid,uid uuid,settings jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.household_members where household_id=hid and user_id=uid) then raise exception 'Not authorized';end if;
 if jsonb_typeof(settings->'allowChildToChildSwitching') is distinct from 'boolean' or jsonb_typeof(settings->'requirePinForAllProfileSwitches') is distinct from 'boolean' then raise exception 'Invalid settings';end if;
 insert into private.household_display_security(household_id,allow_child_to_child_switching,require_pin_for_all_profile_switches,revision) values(hid,(settings->>'allowChildToChildSwitching')::boolean,(settings->>'requirePinForAllProfileSwitches')::boolean,1)
 on conflict(household_id) do update set allow_child_to_child_switching=excluded.allow_child_to_child_switching,require_pin_for_all_profile_switches=excluded.require_pin_for_all_profile_switches,revision=private.household_display_security.revision+1;
 delete from private.caregiver_display_grants where household_id=hid;
 delete from private.caregiver_pin_attempts where household_id=hid;
end $$;
-- Trusted server profile save. No browser-supplied hash/salt is accepted by the Edge handler.
create function public.save_caregiver_profile(hid uuid,uid uuid,payload jsonb,new_hash text,new_salt text) returns void language plpgsql security definer set search_path='' as $$
declare pid uuid:=(payload->>'id')::uuid;
begin
 if not exists(select 1 from public.household_members where household_id=hid and user_id=uid) or (payload->>'household_id')::uuid is distinct from hid or payload->>'role'<>'caregiver' then raise exception 'Not authorized';end if;
 if exists(select 1 from public.profiles where id=pid and household_id<>hid) then raise exception 'Not authorized';end if;
 if new_hash is null or new_salt is null then raise exception 'Caregiver PIN setup required';end if;
 insert into public.profiles(id,household_id,name,active,role,image_path,avatar) values(pid,hid,payload->>'name',(payload->>'active')::boolean,'caregiver',payload->>'image_path',payload->>'avatar') on conflict(id) do update set name=excluded.name,active=excluded.active,role=excluded.role,image_path=excluded.image_path,avatar=excluded.avatar;
 insert into private.caregiver_profile_credentials(household_id,profile_id,pin_hash,pin_salt) values(hid,pid,new_hash,new_salt) on conflict(household_id,profile_id) do update set pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,pin_change_required=false;
 insert into public.profile_display_preferences(household_id,profile_id,preferences) values(hid,pid,payload->'preferences') on conflict(profile_id) do update set preferences=excluded.preferences;
end $$;
create function public.manage_caregiver_pin(hid uuid,uid uuid,cid uuid,operation text,new_hash text default null,new_salt text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.household_members where household_id=hid and user_id=uid) or not exists(select 1 from public.profiles where household_id=hid and id=cid and role='caregiver') then raise exception 'Not authorized';end if;
 if operation='set' then
  if new_hash is null or new_salt is null then raise exception 'PIN required';end if;
  insert into private.caregiver_profile_credentials(household_id,profile_id,pin_hash,pin_salt) values(hid,cid,new_hash,new_salt) on conflict(household_id,profile_id) do update set pin_hash=excluded.pin_hash,pin_salt=excluded.pin_salt,pin_change_required=false;
 elsif operation='reset' then
  update private.caregiver_profile_credentials set pin_hash=null,pin_salt=null,pin_change_required=false where household_id=hid and profile_id=cid;
 elsif operation='require_change' then
  update private.caregiver_profile_credentials set pin_change_required=true where household_id=hid and profile_id=cid and pin_hash is not null;
 else raise exception 'Invalid operation';end if;
end $$;
create function public.begin_caregiver_pin(hid uuid,uid uuid,sid uuid,pid uuid,cid uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.caregiver_profile_credentials;a private.caregiver_pin_attempts;v bigint;token uuid:=gen_random_uuid();delay integer;
begin
 if sid is null or not exists(select 1 from public.household_members where household_id=hid and user_id=uid) or not exists(select 1 from public.profiles where household_id=hid and id=pid and active and (role<>'caregiver' or id=cid)) or not exists(select 1 from public.profiles where household_id=hid and id=cid and active and role='caregiver') then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
 select * into c from private.caregiver_profile_credentials where household_id=hid and profile_id=cid for update;
 if c.pin_hash is null then return jsonb_build_object('allowed',false,'reason','pin_not_configured');end if;
 select coalesce(revision,0) into v from private.household_display_security where household_id=hid;v:=coalesce(v,0);
 insert into private.caregiver_pin_attempts(household_id,caregiver_id,user_id) values(hid,cid,uid) on conflict do nothing;
 select * into a from private.caregiver_pin_attempts where household_id=hid and caregiver_id=cid and user_id=uid for update;
 if a.next_attempt_at>now() then return jsonb_build_object('allowed',false,'reason','retry','retryAfter',ceil(extract(epoch from a.next_attempt_at-now()))::integer);end if;
 delay:=case when a.failures<4 then 1 else least(60,5*power(2,least(4,a.failures-4))::integer) end;
 update private.caregiver_pin_attempts set failures=failures+1,next_attempt_at=now()+make_interval(secs=>delay),ticket=token,ticket_until=now()+interval '15 seconds',session_id=sid,target_id=pid,pin_version=c.pin_version,revision=v,change_token=null,change_until=null where household_id=hid and caregiver_id=cid and user_id=uid;
 return jsonb_build_object('allowed',true,'hash','pbkdf2-sha256$600000$'||c.pin_salt||'$'||c.pin_hash,'ticket',token,'version',c.pin_version,'revision',v);
end $$;
create function public.finish_caregiver_pin(hid uuid,uid uuid,sid uuid,pid uuid,cid uuid,token uuid,version bigint,revision bigint,verified boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.caregiver_profile_credentials;a private.caregiver_pin_attempts;change uuid;
begin
 select * into c from private.caregiver_profile_credentials where household_id=hid and profile_id=cid for update;
 select * into a from private.caregiver_pin_attempts where household_id=hid and caregiver_id=cid and user_id=uid for update;
 if token is null or a.ticket is distinct from token or a.session_id is distinct from sid or a.target_id is distinct from pid or a.ticket_until is null or a.ticket_until<=now() or a.pin_version is distinct from version or c.pin_version is distinct from version or a.revision is distinct from revision or coalesce((select s.revision from private.household_display_security s where s.household_id=hid),0) is distinct from revision
 or not exists(select 1 from public.household_members where household_id=hid and user_id=uid) or not exists(select 1 from public.profiles where household_id=hid and id=pid and active and (role<>'caregiver' or id=cid)) or not exists(select 1 from public.profiles where household_id=hid and id=cid and active and role='caregiver') then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
 update private.caregiver_pin_attempts set ticket=null,ticket_until=null where household_id=hid and caregiver_id=cid and user_id=uid;
 if not verified then return jsonb_build_object('allowed',false,'reason','incorrect','retryAfter',greatest(0,ceil(extract(epoch from a.next_attempt_at-now()))::integer));end if;
 if c.pin_change_required then
  change:=gen_random_uuid();update private.caregiver_pin_attempts set change_token=change,change_until=now()+interval '5 minutes',failures=0,next_attempt_at=now() where household_id=hid and caregiver_id=cid and user_id=uid;
  return jsonb_build_object('allowed',false,'reason','change_required','changeToken',change);
 end if;
 perform pg_advisory_xact_lock(hashtextextended(hid::text||uid::text||sid::text,0));
 insert into private.caregiver_display_grants values(hid,uid,sid,pid,cid,c.pin_version,now()+interval '15 minutes') on conflict(household_id,user_id,session_id,target_id) do update set caregiver_id=excluded.caregiver_id,pin_version=excluded.pin_version,expires_at=excluded.expires_at;
 insert into private.display_profile_access(household_id,user_id,session_id,profile_id) values(hid,uid,sid,pid) on conflict(household_id,user_id,session_id) do update set profile_id=excluded.profile_id,pin_until=null;
 update private.caregiver_pin_attempts set failures=0,next_attempt_at=now() where household_id=hid and caregiver_id=cid and user_id=uid;
 return jsonb_build_object('allowed',true,'expiresIn',900);
end $$;
create function public.complete_caregiver_pin_change(hid uuid,uid uuid,sid uuid,pid uuid,cid uuid,token uuid,new_hash text,new_salt text) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.caregiver_profile_credentials;a private.caregiver_pin_attempts;v bigint;
begin
 select * into c from private.caregiver_profile_credentials where household_id=hid and profile_id=cid for update;
 select * into a from private.caregiver_pin_attempts where household_id=hid and caregiver_id=cid and user_id=uid for update;
 if token is null or a.change_token is distinct from token or a.change_until is null or a.change_until<=now() or a.session_id is distinct from sid or a.target_id is distinct from pid or a.pin_version is distinct from c.pin_version or not c.pin_change_required or not exists(select 1 from public.household_members where household_id=hid and user_id=uid)
 or not exists(select 1 from public.profiles where household_id=hid and id=pid and active and (role<>'caregiver' or id=cid)) or not exists(select 1 from public.profiles where household_id=hid and id=cid and active and role='caregiver') then return jsonb_build_object('allowed',false,'reason','unavailable');end if;
 if new_hash is null or new_salt is null then raise exception 'PIN required';end if;
 update private.caregiver_profile_credentials set pin_hash=new_hash,pin_salt=new_salt,pin_change_required=false where household_id=hid and profile_id=cid returning pin_version into v;
 -- Credential trigger consumes the change authorization and invalidates only this caregiver's grants.
 perform pg_advisory_xact_lock(hashtextextended(hid::text||uid::text||sid::text,0));
 insert into private.caregiver_display_grants values(hid,uid,sid,pid,cid,v,now()+interval '15 minutes') on conflict(household_id,user_id,session_id,target_id) do update set caregiver_id=excluded.caregiver_id,pin_version=excluded.pin_version,expires_at=excluded.expires_at;
 insert into private.display_profile_access(household_id,user_id,session_id,profile_id) values(hid,uid,sid,pid) on conflict(household_id,user_id,session_id) do update set profile_id=excluded.profile_id,pin_until=null;
 return jsonb_build_object('allowed',true,'expiresIn',900);
end $$;
revoke all on function private.guard_caregiver_credential(),private.require_new_caregiver_pin() from public,anon,authenticated,service_role;
revoke all on function public.configure_display_security(uuid,uuid,jsonb),public.save_caregiver_profile(uuid,uuid,jsonb,text,text),public.manage_caregiver_pin(uuid,uuid,uuid,text,text,text),public.begin_caregiver_pin(uuid,uuid,uuid,uuid,uuid),public.finish_caregiver_pin(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,boolean),public.complete_caregiver_pin_change(uuid,uuid,uuid,uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.configure_display_security(uuid,uuid,jsonb),public.save_caregiver_profile(uuid,uuid,jsonb,text,text),public.manage_caregiver_pin(uuid,uuid,uuid,text,text,text),public.begin_caregiver_pin(uuid,uuid,uuid,uuid,uuid),public.finish_caregiver_pin(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,boolean),public.complete_caregiver_pin_change(uuid,uuid,uuid,uuid,uuid,uuid,text,text) to service_role;
commit;
