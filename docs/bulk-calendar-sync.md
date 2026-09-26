# Bulk calendar commit (2026-09-26)

Migration: `202609260003_bulk_calendar_sync.sql`. Apply it after the preceding migrations; none of those files is modified by this change.

## Cause and approach

SQLSTATE 57014 means query cancellation. The hosted timeout diagnosis is consistent with the local reproduction, but the code alone cannot rule out lock waits or another cancellation source. The old implementation did one identity SELECT, one event upsert and one source upsert per incoming event. More significantly, its event row trigger scanned `pg_timezone_names` for every insert/update, including status-only cancellation updates. An existing-row upsert invokes both insert and update checks. Replacement sync first cancelled every overlapping event, then rewrote all events still present. These costs multiplied with calendar size.

The new fast path validates identities in bulk, materializes incoming JSON and resolved stable event IDs in CTEs, then bulk upserts scheduling rows and source rows. It bulk cancels occurrence/series matches and adds a calendar/series index. Replacement cancellation uses an anti-join so only absent overlapping cached events are cancelled. The event timezone trigger is replaced by statement-level transition-table validation: it validates the same timezone-name set for all inserted/updated rows, including local editor writes, and raises transactionally for invalid zones. No validation is disabled.

Unique upsert-only batches (the actual Google snapshot output), cancellation-only batches and empty batches use set-based SQL. Mixed upsert/cancel batches and repeated upsert identities retain the original sequential implementation behind an owner-only private function. This deliberately preserves ordering, series reassignment and intermediate validation failures instead of silently applying last-write-wins deduplication. Such unusual batches remain slower. There is no per-event SQL loop in the normal Google bulk path.

Connection-before-calendar locking, enabled/connected checks, revision compare-and-swap, the 20,000-change and 366-day bounds, recurrence/original-start metadata, account-namespaced identity and checkpoint atomicity remain. The event/source data-modifying CTEs and checkpoint execute in the same RPC transaction. No visual, profile mapping, matching-rule or home/sleep rows are written. Tests force failures both during event writes and after valid event writes at checkpoint insertion, then verify complete rollback.

## Local benchmark

Measured on this Windows machine with PGlite (PostgreSQL/WASM), using the real migration chain, indexes, constraints and triggers. Each value is one awaited database RPC duration measured with `performance.now()`, including JSON serialization and the local WASM bridge. No network, hosted PostgREST or Google requests are included. The original runs precede the bulk runs in one database; later runs benefit from warmed caches and have more accumulated rows. These are illustrative measurements, not production latency promises or hard test thresholds.

| Events | Old initial | Bulk initial | Old replacement update | Bulk replacement update |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 43 ms | 44 ms | 50 ms | 30 ms |
| 100 | 1,259 ms | 38 ms | 3,628 ms | 50 ms |
| 500 | 6,315 ms | 101 ms | 17,961 ms | 194 ms |
| 1,000 | 13,023 ms | 211 ms | 37,651 ms | 423 ms |

The 1,000-event case improved approximately 62× for inserts and 89× for replacement updates. Reproduce with `node --test tests/bulkCalendarSync.test.mjs`. The normal full test suite also includes this benchmark, so it now takes longer while reproducing the old bottleneck.

Regression coverage includes 1/100/500/1000 events, recurring occurrences, recurrence data, stable IDs on updates, per-event and series cancellations, unknown cancellations, empty replacement windows (existing tests), absent/outside-window behavior, all-day timezone conversion, mixed ordering, duplicates, visual/profile metadata, invalid input rollback, checkpoint rollback, revision conflicts and browser-role denial. Safe diagnostics explicitly test SQLSTATE 57014 still reporting `database_commit` / `commit_calendar_sync` without exposing provider text or credentials.

## Timeout and deployment

The public RPC and private bulk function use `SET statement_timeout='30s'`. This is bounded headroom for legitimate batches on smaller hosted instances, not the primary optimization. It is below the documented 60-second client API ceiling. No global, authenticated-role or service-role timeout changes are made. The migration notifies PostgREST to reload its schema/function metadata. See [Supabase function-level timeouts](https://supabase.com/docs/guides/database/postgres/timeouts#function-level). Direct SQL sessions can have an already-running outer statement deadline, and platform/gateway limits still apply; the local tests assert the function configuration rather than claiming to reproduce hosted timeout enforcement.

Deployment sequence:

1. Review linked migration history and dry-run the pending set. Only this migration should be pending if the preceding PKCE work was deployed. Resolve any unexpected history discrepancy before pushing; do not replay applied migrations.
2. Apply the migration, then verify the recorded version and the function timeout.
3. Run Sync Now for a representative enabled calendar. Verify sync status returns to idle, its checkpoint advances, and existing visual mappings stay intact. If it fails, inspect the existing safe Edge Function logs for stage/code.

No Edge Function redeployment is needed for this database-only optimization if the safe diagnostics are already deployed. If they are not, deploy `calendar-actions` separately as described in the Google setup guide. No hosted changes were performed during this implementation.

```powershell
npx supabase migration list --linked
npx supabase db push --linked --skip-vault --dry-run
npx supabase db push --linked --skip-vault
npx supabase migration list --linked
```

After applying, verify in SQL Editor (read-only):

```sql
select proconfig from pg_proc
where oid = 'public.commit_calendar_sync(jsonb)'::regprocedure;
-- Expected: search_path="" and statement_timeout=30s
```
