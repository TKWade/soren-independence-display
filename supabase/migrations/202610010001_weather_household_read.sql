-- The weather worker filters by id and reads only the household timezone.
-- GRANT is idempotent, including when this fix was already applied in SQL Editor.
grant select (id, time_zone)
on table public.households
to service_role;
