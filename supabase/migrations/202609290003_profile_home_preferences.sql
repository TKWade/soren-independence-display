begin;
-- Profile-owned normal bedtime and opt-in overnight sources; no external connection changes the default.
create function private.valid_weekday_bedtimes(value jsonb) returns boolean language sql immutable set search_path='' as $$
 select case when jsonb_typeof(value)='object' then not exists (
  select 1 from jsonb_each_text(value) where key !~ '^[0-6]$' or value is null or value !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
 ) else false end;
$$;
revoke all on function private.valid_weekday_bedtimes(jsonb) from public,anon;
grant execute on function private.valid_weekday_bedtimes(jsonb) to authenticated;
create table public.profile_home_preferences (
 household_id uuid not null,profile_id uuid primary key,
 overnight_mode text not null default 'local' check(overnight_mode in ('local','calendar_with_local_fallback','calendar_driven')),
 default_bedtime time check(default_bedtime<'24:00'::time),
 weekday_bedtimes jsonb not null default '{}'::jsonb check(private.valid_weekday_bedtimes(weekday_bedtimes)),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(household_id,profile_id) references public.profiles(household_id,id) on delete cascade
);
alter table public.profile_home_preferences enable row level security;
revoke all on public.profile_home_preferences from public,anon,authenticated;
grant select,insert,update,delete on public.profile_home_preferences to authenticated;
create policy member_read on public.profile_home_preferences for select to authenticated using(private.is_member(household_id));
create policy member_insert on public.profile_home_preferences for insert to authenticated with check(private.is_member(household_id));
create policy member_update on public.profile_home_preferences for update to authenticated using(private.is_member(household_id)) with check(private.is_member(household_id));
create policy member_delete on public.profile_home_preferences for delete to authenticated using(private.is_member(household_id));
create index profile_home_household_idx on public.profile_home_preferences(household_id);
create trigger touch_profile_home before update on public.profile_home_preferences for each row execute function private.touch_row();
insert into public.profile_home_preferences(household_id,profile_id) select household_id,id from public.profiles;
create function private.create_profile_home_preferences() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profile_home_preferences(household_id,profile_id) values(new.household_id,new.id);return new;end $$;
revoke all on function private.create_profile_home_preferences() from public,anon,authenticated;
create trigger create_profile_home_preferences after insert on public.profiles for each row execute function private.create_profile_home_preferences();
-- Existing weekly times are retained only as compatibility fallback; new rules use the profile bedtime.
alter table public.home_rules alter column bedtime drop not null,alter column bedtime drop default;
alter table public.home_rules add column bedtime_override time check(bedtime_override<'24:00'::time);
-- Preserve every existing manual date override's explicit bedtime.
update public.home_rules set bedtime_override=bedtime where override_date is not null;
commit;
