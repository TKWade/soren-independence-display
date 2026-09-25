begin;
-- Supabase Vault is required. There is deliberately no plaintext credential fallback.
create extension if not exists supabase_vault with schema vault;
alter table public.calendar_connections add column provider_account_id text;
create unique index calendar_connection_account on public.calendar_connections(household_id,provider,provider_account_id) where provider_account_id is not null;
create table private.calendar_oauth_pending (
 id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade, ticket_hash text unique, state_hash text unique,
 binding_hash text, verifier text not null, expires_at timestamptz not null default now()+interval '10 minutes', consumed boolean not null default false
);
revoke all on private.calendar_oauth_pending from public,anon,authenticated;
-- Keep revisions monotonic even for calendars that have never synced (avoid disconnect/reconnect ABA).
create function private.invalidate_calendar_checkpoints(cid uuid) returns void language sql security definer set search_path='' as $$
 insert into private.calendar_sync_state(calendar_id,revision,cursor,window_start,window_end)
 select id,1,'null'::jsonb,now()-interval '30 days',now()+interval '180 days' from public.external_calendars where connection_id=cid
 on conflict(calendar_id) do update set revision=private.calendar_sync_state.revision+1,cursor='null'::jsonb;
$$;
revoke all on function private.invalidate_calendar_checkpoints(uuid) from public,anon,authenticated;
-- All trusted writes lock connection before calendar, including disconnect/reconnect.
alter function public.commit_calendar_sync(jsonb) set schema private;
create function public.commit_calendar_sync(payload jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.calendar_connections where id=(select connection_id from public.external_calendars where id=(payload->>'calendar_id')::uuid) for update;
 perform private.commit_calendar_sync(payload);
end $$;
revoke all on function public.commit_calendar_sync(jsonb) from public,anon,authenticated;
grant execute on function public.commit_calendar_sync(jsonb) to service_role;
alter function public.cache_provider_calendars(uuid,jsonb) set schema private;
create function public.cache_provider_calendars(connection uuid,calendars jsonb) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.calendar_connections where id=connection and status='connected' for update;
 if not found then raise exception 'Connection disabled'; end if;
 perform private.cache_provider_calendars(connection,calendars);
end $$;
revoke all on function public.cache_provider_calendars(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.cache_provider_calendars(uuid,jsonb) to service_role;
-- One service-only boundary for transient OAuth state and encrypted credentials.
create function public.google_calendar_credentials(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pending private.calendar_oauth_pending; conn public.calendar_connections; sid uuid; token text; cid uuid;
begin
 if operation='begin' then
  if not exists(select 1 from public.household_members where household_id=(payload->>'householdId')::uuid and user_id=(payload->>'userId')::uuid) then raise exception 'Not a member'; end if;
  delete from private.calendar_oauth_pending where expires_at<now() or (household_id=(payload->>'householdId')::uuid and user_id=(payload->>'userId')::uuid);
  insert into private.calendar_oauth_pending(household_id,user_id,ticket_hash,verifier) values((payload->>'householdId')::uuid,(payload->>'userId')::uuid,payload->>'ticketHash',payload->>'verifier');
  return '{}'::jsonb;
 elsif operation='start' then
  update private.calendar_oauth_pending set ticket_hash=null,state_hash=payload->>'stateHash',binding_hash=payload->>'bindingHash'
   where ticket_hash=payload->>'ticketHash' and user_id=(payload->>'userId')::uuid and expires_at>now() and not consumed returning * into pending;
  if pending.id is null then raise exception 'Invalid OAuth start'; end if;
  return jsonb_build_object('verifier',pending.verifier);
 elsif operation='consume' then
  update private.calendar_oauth_pending set consumed=true where state_hash=payload->>'stateHash' and binding_hash=payload->>'bindingHash' and expires_at>now() and not consumed returning * into pending;
  if pending.id is null then raise exception 'Invalid OAuth state'; end if;
  return jsonb_build_object('id',pending.id,'verifier',pending.verifier);
 elsif operation='finish' then
  select * into strict pending from private.calendar_oauth_pending where id=(payload->>'pendingId')::uuid and consumed and expires_at>now() for update;
  if not exists(select 1 from public.household_members where household_id=pending.household_id and user_id=pending.user_id) then raise exception 'Not a member'; end if;
  if coalesce(payload->>'refreshToken','')='' or coalesce(payload->>'account','')='' then raise exception 'Missing credential'; end if;
  insert into public.calendar_connections(household_id,provider,label,status,provider_account_id)
   values(pending.household_id,'google',payload->>'account','connected',payload->>'account')
   on conflict(household_id,provider,provider_account_id) where provider_account_id is not null do update set status='connected',label=excluded.label returning * into conn;
  select vault_secret_id into sid from private.calendar_connection_secrets where connection_id=conn.id;
  if sid is null then
   select vault.create_secret(payload->>'refreshToken') into sid;
   insert into private.calendar_connection_secrets(connection_id,vault_secret_id) values(conn.id,sid);
  else
   -- New secret id invalidates in-flight refresh work from the previous authorization.
   delete from vault.secrets where id=sid;
   select vault.create_secret(payload->>'refreshToken') into sid;
   update private.calendar_connection_secrets set vault_secret_id=sid where connection_id=conn.id;
  end if;

  perform public.cache_provider_calendars(conn.id,payload->'calendars');
  perform private.invalidate_calendar_checkpoints(conn.id);
  delete from private.calendar_oauth_pending where id=pending.id;
  return jsonb_build_object('connectionId',conn.id,'householdId',conn.household_id);
 end if;
 cid:=(payload->>'connectionId')::uuid;
 -- Serialize callback completion/disconnect without allowing an in-flight callback to restore a removed grant.
 if operation='disconnect' then
  delete from private.calendar_oauth_pending where household_id=(select household_id from public.calendar_connections where id=cid);
 end if;
 select * into strict conn from public.calendar_connections where id=cid and provider='google' for update;
 select vault_secret_id into sid from private.calendar_connection_secrets where connection_id=cid;
 if operation='disconnect' then
  select decrypted_secret into token from vault.decrypted_secrets where id=sid;
  delete from private.calendar_connection_secrets where connection_id=cid;
  delete from vault.secrets where id=sid;
  update public.calendar_connections set status='disabled' where id=cid;
  update public.external_calendars set enabled=false,sync_status='idle',sync_error=null where connection_id=cid;
  perform private.invalidate_calendar_checkpoints(cid);
  return jsonb_build_object('refreshToken',token);
 end if;
 if conn.status<>'connected' or sid is null then raise exception 'Authorization required'; end if;
 if operation='read' then
  select decrypted_secret into strict token from vault.decrypted_secrets where id=sid;
  return jsonb_build_object('secretId',sid,'refreshToken',token);
 end if;
 if sid is distinct from (payload->>'secretId')::uuid then raise exception 'Authorization changed'; end if;
 if operation='rotate' then
  if coalesce(payload->>'refreshToken','')='' then raise exception 'Missing credential'; end if;
  perform vault.update_secret(sid,payload->>'refreshToken');
 elsif operation='expired' then
  update public.calendar_connections set status='needs_authorization' where id=cid;
 else raise exception 'Unknown credential operation'; end if;
 return '{}'::jsonb;
end $$;
revoke all on function public.google_calendar_credentials(text,jsonb) from public,anon,authenticated;
grant execute on function public.google_calendar_credentials(text,jsonb) to service_role;
-- Vault is Supabase-managed and is not exposed through the Data API. Do not
-- change its ownership or ACLs. Only the service-role RPC above accesses secrets;
-- application-owned private tables and functions remain closed to browser roles.
create function private.delete_calendar_vault_secret() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from vault.secrets where id=old.vault_secret_id; return old; end $$;
revoke all on function private.delete_calendar_vault_secret() from public,anon,authenticated;
create trigger delete_calendar_vault_secret after delete on private.calendar_connection_secrets for each row execute function private.delete_calendar_vault_secret();
commit;
