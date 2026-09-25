begin;
create function private.valid_display_preferences(p jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(jsonb_typeof(p)='object'
  and p->'version'='1'::jsonb and p->>'displayMode' in ('week','first-next-then')
  and jsonb_typeof(p->'maxVisibleItems')='number' and p->>'maxVisibleItems' ~ '^[1-7]$'
  and p->>'motionPreference' in ('normal','reduced','none')
  and jsonb_typeof(p->'allowNavigation')='boolean' and jsonb_typeof(p->'autoAdvance')='boolean'
  and jsonb_typeof(p->'showWho')='boolean' and jsonb_typeof(p->'showWhere')='boolean'
  and jsonb_typeof(p->'showTimes')='boolean' and jsonb_typeof(p->'audioEnabled')='boolean',false);
$$;
revoke all on function private.valid_display_preferences(jsonb) from public,anon;
grant execute on function private.valid_display_preferences(jsonb) to authenticated;
create table public.profile_display_preferences (
 id uuid primary key default gen_random_uuid(), household_id uuid not null, profile_id uuid not null unique,
 preferences jsonb not null default '{"version":1,"displayMode":"week","maxVisibleItems":7,"allowNavigation":true,"autoAdvance":true,"showWho":true,"showWhere":true,"showTimes":false,"motionPreference":"normal","audioEnabled":false}'::jsonb,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(household_id,profile_id) references public.profiles(household_id,id) on delete cascade,
 check(private.valid_display_preferences(preferences))
);
create index profile_display_household_idx on public.profile_display_preferences(household_id);
alter table public.profile_display_preferences enable row level security;
revoke all on public.profile_display_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.profile_display_preferences to authenticated;
create policy member_read on public.profile_display_preferences for select to authenticated using(private.is_member(household_id));
create policy member_insert on public.profile_display_preferences for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.profile_display_preferences for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.profile_display_preferences for delete to authenticated using(private.is_member(household_id));
create trigger touch_profile_display_preferences before update on public.profile_display_preferences for each row execute function private.touch_row();
insert into public.profile_display_preferences(household_id,profile_id) select household_id,id from public.profiles;
create function private.create_profile_display_preferences() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profile_display_preferences(household_id,profile_id) values(new.household_id,new.id); return new; end $$;
revoke all on function private.create_profile_display_preferences() from public,anon,authenticated;
create trigger create_profile_display_preferences after insert on public.profiles for each row execute function private.create_profile_display_preferences();
create function public.save_display_profile(payload jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare pid uuid:=(payload->>'id')::uuid; hid uuid:=(payload->>'household_id')::uuid;
begin
 if not private.is_member(hid) then raise exception 'Not authorized'; end if;
 insert into public.profiles(id,household_id,name,active) values(pid,hid,payload->>'name',(payload->>'active')::boolean)
 on conflict(id) do update set name=excluded.name,active=excluded.active;
 insert into public.profile_display_preferences(household_id,profile_id,preferences) values(hid,pid,payload->'preferences')
 on conflict(profile_id) do update set preferences=excluded.preferences;
end $$;
revoke all on function public.save_display_profile(jsonb) from public,anon;
grant execute on function public.save_display_profile(jsonb) to authenticated;
commit;
