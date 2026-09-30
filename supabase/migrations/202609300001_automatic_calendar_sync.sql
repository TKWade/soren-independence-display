begin;
alter table public.external_calendars add column last_attempted_at timestamptz,add column last_error_category text,add column consecutive_failures integer not null default 0;
alter table public.external_calendars drop constraint external_calendars_sync_status_check;
alter table public.external_calendars add check(sync_status in ('idle','running','error'));
create table private.calendar_sync_leases(calendar_id uuid primary key references public.external_calendars(id) on delete cascade,token uuid not null,expires_at timestamptz not null);
revoke all on private.calendar_sync_leases from public,anon,authenticated,service_role;
create function public.claim_calendar_sync(cid uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare ticket uuid:=gen_random_uuid();
begin
 perform pg_advisory_xact_lock(hashtextextended(cid::text,731));
 if not exists(select 1 from public.external_calendars c join public.calendar_connections n on n.id=c.connection_id where c.id=cid and c.enabled and c.behavior='evaluate' and n.status='connected') then return null;end if;
 if exists(select 1 from private.calendar_sync_leases where calendar_id=cid and expires_at>clock_timestamp()) then return null;end if;
 insert into private.calendar_sync_leases values(cid,ticket,clock_timestamp()+interval '10 minutes') on conflict(calendar_id) do update set token=excluded.token,expires_at=excluded.expires_at;
 update public.external_calendars set last_attempted_at=clock_timestamp(),sync_status='running' where id=cid;
 return ticket;
end $$;
create function public.finish_calendar_sync(cid uuid,lease_token uuid,error_category text default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(cid::text,731));
 if not exists(select 1 from private.calendar_sync_leases where calendar_id=cid and token=lease_token and expires_at>clock_timestamp()) then return;end if;
 if error_category is not null and error_category not in ('google_token_refresh','sync_state_read','google_delta_fetch','google_snapshot_fetch','event_normalization','database_commit','unknown_sync_failure','authorization_required') then error_category:='unknown_sync_failure';end if;
 update public.external_calendars set sync_status=case when error_category is null then 'idle' else 'error' end,
 sync_error=case when error_category is null then null when error_category='authorization_required' then 'Reconnect calendar account.' else 'Synchronization failed; retry or reconnect.' end,
 last_error_category=error_category,consecutive_failures=case when error_category is null then 0 else consecutive_failures+1 end where id=cid;
 delete from private.calendar_sync_leases where calendar_id=cid and token=lease_token;
end $$;
create function public.eligible_calendar_syncs() returns jsonb language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('calendar',to_jsonb(c),'connection',to_jsonb(n)) order by c.last_attempted_at nulls first,c.id),'[]')
 from public.external_calendars c join public.calendar_connections n on n.id=c.connection_id where c.enabled and c.behavior='evaluate' and n.status='connected';
$$;
create or replace function public.commit_calendar_sync(payload jsonb) returns void language plpgsql security definer set search_path='' set statement_timeout='30s' as $$
declare cid uuid:=(payload->>'calendar_id')::uuid;ticket uuid:=(payload->>'lease_token')::uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended(cid::text,731));
 if ticket is not null then
  if not exists(select 1 from private.calendar_sync_leases where calendar_id=cid and token=ticket and expires_at>clock_timestamp()) then raise exception 'Sync lease expired';end if;
 elsif exists(select 1 from private.calendar_sync_leases where calendar_id=cid and expires_at>clock_timestamp()) then raise exception 'Sync already running';end if;
 perform 1 from public.calendar_connections where id=(select connection_id from public.external_calendars where id=cid) for update;
 perform private.commit_calendar_sync(payload);
end $$;
revoke all on function public.claim_calendar_sync(uuid),public.finish_calendar_sync(uuid,uuid,text),public.eligible_calendar_syncs(),public.commit_calendar_sync(jsonb) from public,anon,authenticated;
grant execute on function public.claim_calendar_sync(uuid),public.finish_calendar_sync(uuid,uuid,text),public.eligible_calendar_syncs(),public.commit_calendar_sync(jsonb) to service_role;
commit;
