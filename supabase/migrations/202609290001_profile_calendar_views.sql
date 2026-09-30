-- Extend application-owned preference validation; existing rows resolve to rolling Week defaults.
begin;
create or replace function private.valid_display_preferences(p jsonb) returns boolean language sql immutable set search_path='' as $$
 with effective as (select
  jsonb_build_object('allowedViews',case when p->>'displayMode'='standard-calendar' then '["week","month"]'::jsonb else '["week"]'::jsonb end,
   'defaultView','week','weekPresentation',case when p->>'displayMode'='standard-calendar' then 'calendar' else 'rolling' end,
   'todayPosition',2,'allowCalendarNavigation',p->>'displayMode'='standard-calendar') || p as settings)
 select coalesce(jsonb_typeof(p)='object'
  and p->'version'='1'::jsonb and p->>'displayMode' in ('week','standard-calendar','first-next-then')
  and jsonb_typeof(p->'maxVisibleItems')='number' and p->>'maxVisibleItems' ~ '^[1-7]$'
  and p->>'motionPreference' in ('normal','reduced','none')
  and jsonb_typeof(p->'allowNavigation')='boolean' and jsonb_typeof(p->'autoAdvance')='boolean'
  and jsonb_typeof(p->'showWho')='boolean' and jsonb_typeof(p->'showWhere')='boolean'
  and jsonb_typeof(p->'showTimes')='boolean' and jsonb_typeof(p->'audioEnabled')='boolean'
  and jsonb_typeof(settings->'allowedViews')='array'
  and settings->'allowedViews' in ('["week"]'::jsonb,'["month"]'::jsonb,'["week","month"]'::jsonb,'["month","week"]'::jsonb)
  and settings->'allowedViews' ? (settings->>'defaultView')
  and settings->>'weekPresentation' in ('rolling','calendar')
  and settings->'todayPosition' in ('1','2','3','4','5','6','7')
  and jsonb_typeof(settings->'allowCalendarNavigation')='boolean'
  and case when p->>'displayMode'='standard-calendar' then settings->>'weekPresentation'='calendar'
   else settings->'allowedViews'='["week"]'::jsonb and settings->>'defaultView'='week' and settings->>'weekPresentation'='rolling'
    and settings->'todayPosition'='2'::jsonb and settings->'allowCalendarNavigation'='false'::jsonb end,false) from effective;
$$;
commit;
