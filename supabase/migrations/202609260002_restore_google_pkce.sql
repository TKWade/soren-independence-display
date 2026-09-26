begin;
-- Invalidate attempts started under the prior protocol. Existing connections/Vault secrets are unchanged.
delete from private.calendar_oauth_pending;
alter table private.calendar_oauth_pending add column verifier text;
create or replace function public.google_calendar_credentials(operation text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare pending private.calendar_oauth_pending; conn public.calendar_connections; sid uuid; token text; cid uuid;
begin
 if operation='begin' then
  if coalesce(payload->>'verifier','') !~ '^[A-Za-z0-9._~-]{43,128}$' then raise exception 'Invalid PKCE verifier'; end if;
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
  select * into pending from private.calendar_oauth_pending where state_hash=payload->>'stateHash' and binding_hash=payload->>'bindingHash' and expires_at>now() and not consumed for update;
  if pending.id is null then raise exception 'Invalid OAuth state'; end if;
  update private.calendar_oauth_pending set consumed=true,verifier=null where id=pending.id;
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
commit;
