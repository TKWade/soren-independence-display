-- Optional sample data. Only callable by a member, only into an empty household.
begin;
alter table public.places add column picture_person_id uuid;
alter table public.places add foreign key(household_id,picture_person_id) references public.people(household_id,id);
create function public.seed_sample_household(hid uuid, week_start date) returns void
language plpgsql security invoker set search_path = '' as $$
declare
 profile uuid; dad uuid; mom uuid; dad_home uuid; mom_home uuid; school_place uuid; pool uuid; park_place uuid;
 school uuid; swimming uuid; home_activity uuid; dinner uuid; pickup uuid; park uuid;
 caregiver uuid; home uuid; event_day date; i integer; z text; ev uuid; act uuid; loc uuid; t text; st text; en text; primary_flag boolean;
begin
 if not private.is_member(hid) then raise exception 'Not authorized'; end if;
 -- Lock household to serialize concurrent seed attempts (RLS read already checked).
 perform pg_advisory_xact_lock(hashtextextended(hid::text,0));
 if exists(select 1 from public.profiles where household_id=hid) or exists(select 1 from public.people where household_id=hid)
 or exists(select 1 from public.activities where household_id=hid) or exists(select 1 from public.places where household_id=hid)
 or exists(select 1 from public.calendar_events where household_id=hid) then raise exception 'Sample data requires an empty household'; end if;
 select time_zone into z from public.households where id=hid;
 insert into public.profiles(household_id,name) values(hid,'Sample child') returning id into profile;
 insert into public.people(household_id,name,label,relationship,icon) values(hid,'Dad','DAD','Parent','dad') returning id into dad;
 insert into public.people(household_id,name,label,relationship,icon) values(hid,'Mom','MOM','Parent','mom') returning id into mom;
 insert into public.places(household_id,name,label,icon,picture_person_id) values(hid,'Dad’s home','DAD','home',dad) returning id into dad_home;
 insert into public.places(household_id,name,label,icon,picture_person_id) values(hid,'Mom’s home','MOM','home',mom) returning id into mom_home;
 insert into public.places(household_id,name,label,place_type,icon) values(hid,'School','SCHOOL','school','school') returning id into school_place;
 insert into public.places(household_id,name,label,place_type,icon) values(hid,'Pool','POOL','pool','swim') returning id into pool;
 insert into public.places(household_id,name,label,place_type,icon) values(hid,'Park','PARK','park','park') returning id into park_place;
 insert into public.activities(household_id,name,label,icon) values(hid,'School','SCHOOL','school') returning id into school;
 insert into public.activities(household_id,name,label,icon) values(hid,'Swimming','SWIM','swim') returning id into swimming;
 insert into public.activities(household_id,name,label,icon) values(hid,'Home','HOME','home') returning id into home_activity;
 insert into public.activities(household_id,name,label,icon) values(hid,'Dinner','DINNER','dinner') returning id into dinner;
 insert into public.activities(household_id,name,label,icon) values(hid,'Pickup','PICKUP','home') returning id into pickup;
 insert into public.activities(household_id,name,label,icon) values(hid,'Park','PARK','park') returning id into park;
 week_start := week_start - ((extract(dow from week_start)::integer+6)%7);
 for i in 0..6 loop
  event_day := week_start+i;
  caregiver := case when i in (2,3,6) then mom else dad end;
  home := case when caregiver=mom then mom_home else dad_home end;
  insert into public.home_rules(household_id,profile_id,weekday,place_id,caregiver_id)
   values(hid,profile,extract(dow from event_day)::integer,home,caregiver);
  for t,act,loc,st,en,primary_flag in
   select * from (values
    ('School',school,school_place,'08:00','15:00',i<>2),
    ('Pickup',pickup,school_place,'15:00','15:30',false),
    ('Swimming',swimming,pool,'15:30','17:00',true),
    ('Home',home_activity,home,case when i=2 then '17:00' else '15:30' end,'18:00',false),
    ('Park',park,park_place,'09:00','12:00',true),
    ('Home morning',home_activity,home,'09:00','12:00',true),
    ('Home afternoon',home_activity,home,'12:00','18:00',false),
    ('Dinner',dinner,home,'18:00','19:30',false)
   ) as sample(title,activity,place,start_at,end_at,main)
   where (title in ('School','Pickup','Home') and i<5) or (title='Swimming' and i=2)
    or (title='Park' and i=5) or (title='Home morning' and i=6) or (title='Home afternoon' and i>=5) or title='Dinner'
  loop
   ev := public.save_local_event(jsonb_build_object('household_id',hid,'title',t,
    'start_time',(event_day+st::time) at time zone z,'end_time',(event_day+en::time) at time zone z,'time_zone',z,
    'activity_id',act,'place_id',loc,'profile_ids',jsonb_build_array(profile),'person_ids',jsonb_build_array(caregiver),
    'is_primary',primary_flag,'visible',true,'picture_person_id',case when t='Pickup' then caregiver else null end));
  end loop;
 end loop;
end $$;
revoke all on function public.seed_sample_household(uuid,date) from public, anon;
grant execute on function public.seed_sample_household(uuid,date) to authenticated;
commit;
