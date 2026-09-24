# External calendar integration foundation

## Current boundary

The family calendar owns event titles, descriptions, times, recurrence, location text and cancellation state. This app owns per-profile relevance, visual activities, short labels, people, pictures, visual places and visibility. Week and the default Day B view still consume only `DisplayEvent`; their components and layouts are unchanged. Local recurring events and home/sleep rules remain supported and independent.

This milestone implements provider-neutral contracts, pure Google/Microsoft normalization, an incremental-sync coordinator, trusted persistence/actions, and caregiver connections/inbox/rules screens. **No real Google or Microsoft OAuth, token exchange, HTTP adapter, webhook, scheduled sync or provider write operation is implemented.** Connect controls explicitly show that authorization is not enabled. The server's provider registry is empty, and requests for a live provider return `provider_not_configured`; fixture adapters are test-only. Apply the database migration before running the updated app.

## Models and database

`src/types/externalCalendar.ts` defines `CalendarConnection`, `ExternalCalendar`, the browser-safe `CalendarSyncState`, `ExternalEvent`/`ExternalChange`, `EventProfileMapping` and `CalendarMatchingRule`. Existing `CalendarProvider`, title-match operator types, event/source rows, visual libraries and rule table are reused.

New public tables:

- `calendar_connections`: household, provider, human label, connection status and last sync. Browser read-only; an eventual OAuth callback provisions it.
- `external_calendars`: one selectable provider calendar, scoped to its connection. Discovery defaults every new calendar to disabled/ignore. Browser can update only `enabled` and `behavior`; names, IDs and sync summaries are trusted-server-owned.
- `event_profile_mappings`: per-profile manual include/ignore decisions and visual references, scoped by calendar plus `event:<provider-event-id>` or `series:<provider-series-id>`. Compound household FKs protect profiles, calendars, people, activities and places.

New private tables:

- `private.calendar_sync_state`: opaque adapter checkpoint, exact UTC window, optimistic revision and timestamp. No browser grants.
- `private.calendar_connection_secrets`: protected Vault secret UUID reference only. No raw access/refresh tokens are stored by this milestone. No browser grants.

Extended existing objects:

- `calendar_events` gains description, modification time, external status/kind and date-only all-day bounds. Provider updates modify these scheduling fields only. Local title and recurrence constraints remain in force; external titles may be empty or up to 10,000 characters rather than truncating them to a child label.
- `external_event_sources` gains a household-checked calendar reference. Provider identity uniqueness is now `(calendar_id, external_event_id)` so accounts with the same provider calendar/event IDs cannot collide. Existing sources with no connection/calendar association remain preserved but are not automatically displayed; explicitly reconcile them before real sync.
- `event_matching_rules` gains include/ignore action, calendar scope, picture-person override and Week primary flag. Existing `source_filter` and title/operator/priority fields are reused. Existing incomplete rules are retained but do not create incomplete child cards.

New RPCs: authenticated `save_external_mapping` atomically stores selected profile decisions and optional rules. Service-role-only `cache_provider_calendars`, `read_calendar_sync_state` and `commit_calendar_sync` support the trusted worker. Browser roles cannot write external scheduling/source rows, connection metadata, cursors or credential references. No existing migration is edited.

## One-way provider interface

`server/calendar/provider.ts` exposes `CalendarProviderAdapter`:

- `listCalendars()` returns available calendar metadata.
- `initialSync(calendar, window, nextPage?)` returns a bounded, complete initial snapshot in pages.
- `incrementalSync(calendar, state, nextPage?)` returns provider updates and tombstones since the checkpoint.
- `normalizeEvent(raw, calendar, syncedAt)` produces the shared model.

No method can create, edit or delete a provider event. Provider-specific wire fields exist only in pure normalizers and test fixtures. `ExternalEvent` includes provider/connection/calendar/event/series identities, original occurrence start, title, description, start/end, all-day flag, IANA zone, provider location text, recurrence metadata, resolved-occurrence/master kind, status, last modification and last sync. Cancellations use sparse tombstones because deleted provider records may contain only identity; the cache retains prior fields and marks the event cancelled.

Adapters must supply **resolved recurring occurrences** (including moved exceptions). Series masters and their raw recurrence metadata can be cached but never displayed as a single timed activity. Google and Microsoft raw recurrence representations are opaque to the display. Original occurrence identity is retained even when its time changes; manual series mappings survive provider updates.

All-day dates have exclusive ends. The display projects each date range at household-local midnight boundaries without changing cached provider scheduling. Timed events retain absolute instants. Graph wire date-times must arrive with an offset, UTC, or an IANA zone; unsupported Windows zones are rejected rather than silently interpreted. A real Graph adapter must request UTC or translate zones before calling the normalizer.

## Incremental state, atomicity and limits

The coordinator collects at most 100 pages / 20,000 changes for a window no longer than 366 days. Initial HTTP action windows cover 30 days back and 180 days ahead. A saved window is reused until fewer than 30 future days remain, then deliberately rebased. Equivalent timestamp representations do not trigger a reset. A future background runner should reuse this action/coordinator rather than repeatedly downloading account history.

Page cursors and final checkpoints are opaque to the coordinator and browser. Only after **all pages succeed** does `commit_calendar_sync` lock the calendar, verify revision and ownership/selection, write event changes and advance the checkpoint in one transaction. Concurrent workers with stale revisions fail and retry from fresh state. A failed page, malformed identity, invalid event or database failure advances nothing. Adapter-signaled `SyncCursorExpired` restarts one bounded initial snapshot; no unbounded retry loop.

Complete replacement snapshots mark previously cached events overlapping that window as cancelled when absent; this only happens inside the final transaction. Incremental tombstones mark matching instances cancelled; a tombstone for a series ID also cancels its cached instances. App visual mappings are never deleted by sync. Outside-window cache retention and long-term pruning remain future maintenance work. Normalization/persistence assumes adapters resolve duplicate/out-of-order provider revisions correctly before returning the batch.

Google implementation must follow its [incremental sync token/query and pagination rules](https://developers.google.com/workspace/calendar/api/guides/sync) and [events-list restrictions](https://developers.google.com/workspace/calendar/api/v3/reference/events/list). Do not mechanically combine arbitrary date filters with an existing token. The adapter must preserve its query state and provide a complete bounded occurrence snapshot for reset/reconciliation.

Microsoft implementation must preserve opaque next/delta links and the calendarView range. The documented [v1.0 calendarView delta endpoint](https://learn.microsoft.com/en-us/graph/api/event-delta?view=graph-rest-1.0) has calendar-support constraints; verify the strategy for non-primary calendars before shipping selectable-calendar sync rather than silently importing the wrong calendar. [Event identities, series, exceptions and cancellation fields](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0) stay inside the adapter. Stable/immutable provider IDs and expiry recovery must be tested against a real account next.

## Relevance and caregiver workflow

Admin → **CALENDARS** → **Calendar connections** shows accounts and calendars. Enable only chosen calendars, and select “Include and evaluate events” or “Ignore calendar.” Disabled/ignored calendars immediately stop contributing to the child projection after refresh; their cache and mappings are retained. Refresh/sync buttons request trusted actions, not provider APIs. With the empty registry they cannot import live data yet.

**Calendar inbox** lists selected-calendar events without a complete decision for one or more active profiles, grouped by recurring series. It shows current decisions for each profile and read-only provider title/date/location. Choose profiles, activity, caregiver, visual place, child label, picture source, visibility and optional Week primary status, or ignore for those profiles. Whole-series scope is the default for recurring events; occurrence-only decisions are also possible. Saving changes only checked profiles. Ignoring for Soren leaves siblings independent; select all current profiles to ignore for the whole current family. A newly added profile starts unreviewed. “Include reviewed events” allows replacement of previous decisions.

Optionally create a title-contains rule from the inbox decision. The decision and one rule per checked profile save atomically. Rules created this way are restricted to that calendar. **Matching rules** also supports create/edit/disable/delete, equals/contains, case sensitivity, priority, profile, calendar scope, and visual defaults or ignore. Names and whitespace are normalized for matching; there is no AI.

Precedence per profile:

1. Manual occurrence decision.
2. Manual series decision.
3. Existing explicit per-event `event_visuals` enrichment.
4. Highest-priority matching rule (stable ID breaks ties).
5. Unmatched: inbox, omitted from child display.

Automatic rule results are derived, not copied into thousands of visual rows. Editing a rule or provider title intentionally re-evaluates automatic matches; a no-longer-matching event returns to the inbox. Manual decisions remain unchanged by provider updates and rule edits. Missing referenced visual libraries make a proposed include decision incomplete rather than creating blank child cards. Hidden mapped events count as reviewed, while an unmapped event never leaks provider text into the child UI.

## Trusted action and credential boundary

`server/calendar/actions.ts` checks an explicit CORS origin allowlist, verifies the bearer token with Supabase Auth, checks household membership using the caller's RLS client, and resolves the requested calendar/connection within that household **before** using a service-role client. The request cannot supply a cursor, provider URL, credentials or arbitrary cache batch. Failure responses are fixed codes; provider errors/tokens/URLs are not returned or logged. The browser repository calls `calendar-actions` via Supabase Functions.

`supabase/functions/calendar-actions/index.ts` is the Edge Function entry point; its Deno import map pins server dependencies. The shared server implementation is typechecked with the application build and tested locally, but the Edge Function has not been deployed or tested against hosted Auth. Production browser imports do not include server modules.

For actual OAuth next: implement state+PKCE, exact redirect allowlists, household binding, least-privilege **read-only** scopes, authenticated connection callbacks, rotation/revocation and refresh handling. Encrypt refresh tokens in Supabase Vault or an external KMS-backed secret store. Store only the protected Vault reference in `private.calendar_connection_secrets`. The `CredentialVault.withCredentials` contract keeps token access inside a trusted callback. Vault integration and refresh-token encryption operations are intentionally not simulated or implemented yet. Never use `VITE_` variables, browser-readable tables or localStorage for provider credentials/cursors. Existing Supabase browser session tokens are separate from provider OAuth credentials.

## Apply / validate / next steps

Apply **only the new** `202609230002_external_calendars.sql` after the earlier foundation/sample/recurrence migrations. The migration was tested in local PGlite against existing seeded household data with Supabase Auth/Storage stubs; hosted deployment has not been changed.

For an already-linked project with accurate migration history:

```sh
npx supabase db push --linked --skip-vault --dry-run
npx supabase db push --linked --skip-vault
```

Review the pending set before the second command. If earlier migrations were applied with SQL Editor without CLI history, execute just the new migration there instead. Refresh the app after applying it.

The function can be deployed later with `npx supabase functions deploy calendar-actions`. Configure the server-only `CALENDAR_ALLOWED_ORIGINS` secret (comma-separated exact origins) first. Supabase supplies its server URL/keys. Keep JWT verification enabled. Deploying this entry point alone does **not** connect Google/Microsoft: a real adapter factory must be registered and real OAuth/Vault handling implemented next.

Ready for both providers: models, private checkpoint persistence, transactional sync cache, selected calendars, per-profile/series decisions, deterministic rules, inbox, child projection, and pure wire normalizers with fixture coverage. Still required: OAuth/Vault implementation, real read-only transports, provider pagination/checkpoint handling and recurrence expansion, real-account integration tests, scheduling/retry operations and deployment.

Sign-in-free browser fixture: `/tests/browser/calendar-admin.html` exercises connections, inbox and rule forms with fictional read-only data; save/network actions are blocked. Automated tests cover normalization, recurrence instances, all-day ranges, multiple profiles, ignores, rules/inbox, preserved visuals, cancellations, shared child contracts, page failures/reset, cache atomicity, RLS/credential/cursor isolation, account-scoped identities and upgrade preservation. Run `npm test`, `npm run lint`, `npm run build`.

Significant files: `src/types/externalCalendar.ts`, `src/calendar/relevance.ts`, `src/data/{records,repository,calendarRepository}.ts`, `src/lib/persistentSchedule.ts`, `src/admin/Calendar{Admin,Inbox,Rules,VisualFields}.tsx`, `src/admin/Admin.tsx`, `server/calendar/{provider,normalization,supabaseStore,actions}.ts`, the Edge Function entry/import map, the new migration, external/calendar database tests and fixtures, and `tsconfig.app.json` (includes shared server typechecking).
