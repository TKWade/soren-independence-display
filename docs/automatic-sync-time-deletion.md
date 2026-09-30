# Automatic sync, Standard time display, and safe deletion

This milestone preserves the existing Home & Sleep modes, provider-normalized scheduling, mappings, recurrence, OAuth/PKCE and child timeline renderers. No hosted configuration is changed merely by updating application source.

## Automatic sync architecture

`calendar-scheduled` accepts a dedicated server-held secret and exactly an empty JSON object. It enumerates enabled/evaluate calendars on connected accounts itself; callers cannot select household/calendar IDs. Cron invokes it every 15 minutes without any browser being open. Manual Sync Now and the worker both call `runCalendarSync`, then the existing provider-neutral incremental engine and atomic bulk commit RPC. There is no second Google sync implementation.

A short database advisory transaction lock protects acquisition of a per-calendar, 10-minute private lease. Its random token fences scheduling/checkpoint commits and final status updates. Manual/scheduled overlaps skip before provider work; abandoned leases expire. Revision compare-and-swap still applies. The provider network budget is 90 seconds for manual operations; the scheduled worker shares a 110-second provider deadline, stops starting new calendars after 80 seconds, and processes oldest-attempted calendars first. Database commit retains its 30-second function timeout. This bounded batch defers excess work to the next tick; very large households/deployments may need a future durable fan-out queue. Job frequency is not a guarantee that an arbitrarily large backlog finishes each interval.

Refresh rejection uses the existing credential-generation-aware invalidation and sets the connection to `needs_authorization`. Subsequent runs exclude it, while its last successful cache remains available to the schedule engine. Disconnected/disabled calendars remain excluded. Admin shows reconnect guidance, last success, last attempt, safe error category, consecutive failures and current status. A crashed worker may show running until a later claim recovers the expired lease.

Diagnostics retain fixed safe messages and allowlisted stage/status/database-code fields. No provider event text or credential is copied into logs, browser errors or stored sync errors. Completion logs contain `calendar_scheduled_complete`, processed, failed and skipped counts. A 202 response confirms dispatch acceptance, not successful calendar completion.

## Deployment (operator steps; not performed by this change)

New migrations, in order:

1. `202609300001_automatic_calendar_sync.sql`: leases, attempt/error status, shared commit fencing.
2. `202609300002_calendar_sync_cron.sql`: pg_cron/pg_net, private dispatcher and job.
3. `202609300003_standard_display_time.sql`: validation of optional profile time/clock preferences.
4. `202609300004_safe_deletion.sql`: controlled deletion RPCs, image cleanup queue and reuse guards.

Do not edit older applied migrations. Review the linked project and migration list before applying. These instructions assume the existing Google/Vault migrations and Google configuration already work.

1. Generate a dedicated high-entropy scheduler secret (at least 32 characters, preferably 32 random bytes encoded base64url) in a password manager. Add it as the Edge Function secret `CALENDAR_SCHEDULER_SECRET` in the Supabase Dashboard. Do not place it in frontend environment variables, SQL files, shell history or Git.
2. In Dashboard Vault create `calendar_scheduler_secret` with that same value and `calendar_scheduler_url` with `https://pvkrwzieiyuztqupxifj.supabase.co/functions/v1/calendar-scheduled`. No whitespace or newline. No service-role key is stored in the Cron command. Existing managed Vault permissions are not changed.
3. Apply reviewed migrations and deploy:

```powershell
npx supabase migration list --linked
npx supabase db push --linked
npx supabase functions deploy calendar-actions
npx supabase functions deploy calendar-scheduled
npx supabase functions deploy household-maintenance
```

The worker uses the existing server-only `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_OAUTH_RETURN_URL`, and built-in Supabase service credentials. Maintenance uses existing `CALENDAR_ALLOWED_ORIGINS`. Do not change the working OAuth redirect URI. `google-oauth` needs no redeployment for this milestone; it was Deno-checked for regression coverage. All new endpoints have `verify_jwt=false` in config: the scheduler verifies its dedicated secret; maintenance validates the user's JWT and household membership itself. This is not an anonymous cleanup endpoint.

The job starts after migration 002. Configure Vault before applying; deploy functions promptly afterward (an early tick before deployment can fail harmlessly). Alternatively disable the job until deployment is complete, then re-enable using the SQL below. Publish the built frontend only after the database/functions are ready.

### Cron operations (trusted SQL editor)

Job name: `calendar-sync-15m`. Schedule: `*/15 * * * *` (UTC, every quarter-hour).

```sql
-- Inspect definition and runs (pg_net dispatch is asynchronous).
select jobid, jobname, schedule, active from cron.job where jobname='calendar-sync-15m';
select d.* from cron.job_run_details d join cron.job j using(jobid)
where j.jobname='calendar-sync-15m' order by d.start_time desc limit 20;
-- Inspect transport status only; avoid selecting request headers with credentials.
select id, status_code, timed_out, error_msg, created from net._http_response
order by created desc limit 20;
-- Pause / resume.
select cron.alter_job(jobid, active:=false) from cron.job where jobname='calendar-sync-15m';
select cron.alter_job(jobid, active:=true) from cron.job where jobname='calendar-sync-15m';
-- Example: change to every 30 minutes; update Admin wording if doing so.
select cron.alter_job(jobid, schedule:='*/30 * * * *') from cron.job where jobname='calendar-sync-15m';
-- Remove only this job.
select cron.unschedule(jobid) from cron.job where jobname='calendar-sync-15m';
-- Trigger without putting a secret in a request or SQL source.
select private.dispatch_calendar_sync();
```

Cron history confirms dispatch; use Edge Function completion/failure logs and `external_calendars` status for actual sync results. The database lease and cleanup tables are private and not browser-readable. Scheduler keys must remain out of public clients; rotate the Edge secret and Vault value together.

Verify after deployment: connect two test accounts, enable/evaluate calendars, disable/ignore others, change a provider event, close all browsers, wait one interval and reopen the display. Verify cache/checkpoint and last success advance only for eligible calendars. Overlap manual Sync Now with a scheduled run: one should skip. Revoke a test account's authorization: reconnect status should appear, its cached schedule should remain, further ticks should skip it while the other account advances. Verify missing/wrong scheduler secret is denied and nonempty request bodies are rejected.

Official setup references: [Supabase scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions), [Cron job management](https://supabase.com/docs/guides/cron/quickstart), [pg_net](https://supabase.com/docs/guides/database/extensions/pg_net).

## Standard Week / Month

Per-profile preferences: `showActivityTimes` and `showClock` default true for Standard, false for low-navigation Week and First/Next/Then; `clockFormat` defaults to `12h` and also accepts `24h`. Existing stored preferences receive mode-appropriate defaults. Controls appear only under Standard profile settings. These preferences do not change the schedule model.

`ActivityTimes` sorts by actual start instant, shows household-local 12-hour start times without seconds, and labels all-day activities `All day`. Sleep context is not duplicated in that list. Month shows the first three activities plus a count linking conceptually to opening the day. Time never truncates before the activity label; phone rows stack time above label. Titles retain a hover title attribute.

`StandardClock` owns its own state, schedules the next minute boundary, and immediately catches up on focus/visibility resume. It uses the household IANA timezone including DST, not device timezone. It does not write ticking time to the database or rerender the calendar every second.

Manual visual checklist: Standard Week and Month at 1280x800, 1024x640, 960x600 and phone width; long activity labels, all-day and crowded dates; both clock formats; both preferences off; device timezone different from household; tab sleep/resume. Verify rolling Week, Day-B and First/Next/Then remain familiar. No new screenshots were captured in this milestone; `WeekRenderer`, `ActivityTimes`, `StandardClock`, and profile settings are the components to review.

## Deletion dependency audit

Existing constraints were inspected before adding the new RPC. The following are the incoming domain references; unspecified delete action means PostgreSQL `NO ACTION` (restricts deletion). No target entity uses `SET NULL`.

| Target | Referencing records/fields | Existing delete action |
|---|---|---|
| People | event_people.person_id; event_visuals.picture_person_id; places.picture_person_id; home_rules.caregiver_id; event_matching_rules.caregiver_id/picture_person_id; event_profile_mappings.caregiver_id/picture_person_id/sleep_caregiver_id | NO ACTION |
| Places | event_visuals.place_id; home_rules.place_id; event_matching_rules.place_id; event_profile_mappings.place_id/sleep_place_id | NO ACTION |
| Activities | event_visuals.activity_id; event_matching_rules.activity_id; event_profile_mappings.activity_id | NO ACTION |
| Profiles | event_visuals.profile_id; home_rules.profile_id; event_matching_rules.profile_id; event_profile_mappings.profile_id | NO ACTION |
| Profiles | profile_display_preferences.profile_id; profile_home_preferences.profile_id | CASCADE |
| Calendar events | external_event_sources.event_id; event_visuals.event_id | CASCADE |
| Event visuals | event_people.visual_id | CASCADE |
| Home rules, mappings, matching rules | No incoming domain references | None |
| External calendars | external_event_sources.calendar_id; mappings/rules.calendar_id | NO ACTION |
| Connections | external_calendars.connection_id; private credential linkage | CASCADE |

Household-owned records also reference households with CASCADE; no household-delete UI is added. Private sync checkpoints and leases cascade from their calendar. Image paths are textual storage references, not foreign keys, so the cleanup worker explicitly checks every library image/source path.

### Intentional behavior

- People / Places / Activities: Archive preserves records and rendering, excludes them from new selection lists; existing references remain editable. Permanent delete shows FK-derived per-table row counts and blocks any referenced item. Reassign/remove dependencies first; there is no implicit destructive cascade.
- Profiles: Inactive is the normal path. Danger Zone requires typing the current profile name. The transaction explicitly deletes only that profile's visuals (and their people links), mappings, rules, Home & Sleep preferences/overrides and display preferences. Calendar events remain, including shared events. The last profile cannot be permanently deleted. Household locking serializes competing profile deletions.
- Local events: confirmed Delete event / Delete entire series removes the local schedule row and its visual assignments. No occurrence-only deletion is invented without a recurrence-exception model.
- External events: delete is blocked in the RPC. Delete the event in the connected calendar. Ignore and app-owned mapping/rule removal remain available; removing a mapping can allow another rule to apply again. No provider writes are added.
- Home & Sleep weekly rules and date overrides: confirmed deletion of that app-owned row. External Activity/Home & Sleep mapping removal changes only the app decision.

`deletion_preview` and `delete_owned_record` validate membership and scope all reads/writes to the household. The preview counts distinct referring rows per table, including multiple person roles without double counting the same row. The delete RPC recalculates dependencies and confirmation, and FK constraints remain the final concurrent-reference barrier. Browser direct DELETE grants on these entities are revoked. A failed operation rolls back atomically. The reusable native dialog names the item, lists counts, explains consequences, supports Escape/Cancel, and uses danger styling; profiles require the stronger typed confirmation.

### Private image cleanup

Deleting an unused library item queues its original/derived image paths in the same transaction, only under that household's storage prefix. The browser requests authenticated `household-maintenance`; scheduled sync also drains up to 100 pending paths per run. Service-only `claim_image_cleanup` checks all People/Places/Activities image and source-image references; shared paths are retained. Advisory path locks and insert/update guards prevent reuse after a deletion claim. Storage removal happens server-side; `finish_image_cleanup` marks completion only after success. Failures stay queued for retry, with completed-path tombstones preventing later accidental reuse. Archive never deletes images. This handles deletion-owned images, not a general orphan sweep of old uploads.

Manual deletion checklist: archive/restore each library type; delete an unused item; confirm referenced items are blocked with counts; cancel a dialog; try an incorrect profile name; delete one of two profiles and verify the other's shared event remains; verify last-profile blocking; delete a local series; remove a weekly rule/date override and both mapping targets; verify provider events survive; delete one of two library records sharing a photo and ensure the photo survives until the last reference is removed; retry temporary storage failures; verify another household cannot preview/delete/clean these records.

## Validation scope

Node tests run the migration chain in PGlite, including RLS/role tests, rollback/regression tests and bulk benchmarks. Cron/pg_net/Vault host services use local test doubles: real hosted dispatch, storage removal and visual browser behavior still require the manual verification above. Four Edge Functions are Deno-checked (`google-oauth`, `calendar-actions`, `calendar-scheduled`, `household-maintenance`). No deployments or remote migrations are performed by tests.
