# External calendar integration

## Ownership and provider-neutral models

The family calendar owns titles, descriptions, start/end, recurrence, location text and cancellation. This app owns per-profile relevance, short child labels, activities, photos, caregivers, visual places and visibility. Home/sleep remains an application-owned recurring schedule. Week and Day consume the same `DisplayEvent` model and have no Google fields.

Google is now implemented as a read-only live provider. Microsoft has a pure normalizer and the shared contracts, but no live transport or OAuth. See [Google setup, secrets, migration, deployment and end-to-end tests](google-calendar-setup.md).

`src/types/externalCalendar.ts` defines connections, selectable calendars, safe sync summaries, normalized `ExternalEvent`/`ExternalChange`, manual per-profile mappings and title-matching rules. One provider occurrence can have independent enrichment for multiple profiles. Provider identity is scoped by connection/calendar, so shared calendars in different accounts do not collide.

## Storage and service boundary

- `calendar_connections`: household, provider, account label/status and public provider account ID. Browser read-only.
- `external_calendars`: discovery metadata and selections. Browser updates only enabled/behavior; discovery preserves selections, defaults new calendars to disabled/ignore, and disables missing calendars.
- `calendar_events` and `external_event_sources`: scheduling cache and stable event/series/occurrence identities. Browser cannot write provider-owned data.
- `event_profile_mappings`: manual `event:<id>` or `series:<id>` decisions per profile, with household-checked library references.
- `event_matching_rules`: deterministic per-profile visual/ignore defaults with provider/calendar scope and priority.
- `private.calendar_sync_state`: opaque checkpoint, bounded window and optimistic revision. Browser-inaccessible.
- `private.calendar_connection_secrets`: Vault UUID reference only; refresh credentials are encrypted in Vault. Browser-inaccessible.
- `private.calendar_oauth_pending`: transient, expiring OAuth state hashes, browser-binding hash, PKCE verifier and initiating household/user. Single-use callback consumption and authenticated completion. Browser-inaccessible.

Authenticated `save_external_mapping` atomically saves decisions and optional rules. Service-only cache/sync RPCs serialize connection then calendar locks, validate identities, require a selected/connected calendar, and atomically commit scheduling plus checkpoint. Google credential operations are service-only and recheck membership at completion. Disconnect removes authorization before attempting remote revocation; checkpoint revisions remain monotonic even before the first sync. Provider refresh never writes visual tables.

`calendar-actions` verifies the Supabase bearer with Auth and checks household membership and target ownership before privileged operations. It accepts action/household/target IDs, never arbitrary provider URLs, credentials or cursors. CORS uses explicit origins. `google-oauth` uses authenticated same-app kickoff, state, S256 PKCE and a browser-bound HttpOnly cookie. Tokens and upstream error details are never returned in browser responses. Supabase session tokens are separate from Google tokens. See the setup guide for the required function gateway settings.

## Adapter and synchronization

`server/calendar/provider.ts` defines `CalendarProviderAdapter`: calendar discovery, initial sync, incremental sync and normalization. It has no provider event write operation. Provider-specific wire fields live in server normalizers/adapters. `SyncPage.replaceWindow` allows a complete bounded reconciliation even when triggered by incremental change detection; other providers may emit direct updates/tombstones.

Resolved recurring occurrences include moved exceptions and original occurrence identity; masters are never child-facing cards. All-day values are date-only with exclusive ends, projected at household-local boundaries. Timed values identify absolute instants. Google expansion is delegated to its bounded events endpoint. A future Microsoft adapter must resolve Graph timezone IDs and validate non-primary-calendar delta support before implementation.

The coordinator validates identity, pagination, final checkpoints and limits (100 pages / 20,000 changes / at most 366 days). Initial display windows span 30 days back and 180 ahead, rebased when fewer than 30 future days remain. Partial failures advance nothing. A cursor-expired signal resets once. A complete replacement marks absent cached events overlapping the window cancelled inside the same transaction, preserving all enrichment. Series tombstones also hide cached instances.

Google keeps an unexpanded collection sync token and fetches a bounded resolved snapshot only when changes occur. This handles infinite recurrence without repeatedly fetching full history. Checkpoint-before-snapshot ordering replays concurrent changes on the next run. Manual Sync Now is implemented; scheduled jobs, push notifications, automatic retry queues and long-term cache pruning are deferred.

## Relevance and caregiver workflow

Calendar connections shows Google account/calendar selection and Sync Now. Disabled/ignored calendars and disconnected accounts are excluded from the child projection after refresh. Their cached data and visual decisions remain available for reconnect.

Calendar inbox groups undecided events by series and lists active profiles still needing decisions. Select profiles, activity, caregiver, visual place, child label, picture and visibility, or ignore. Series scope is the recurring default; individual occurrence overrides are possible. Saving affects only selected profiles. Optionally create a title-contains rule atomically with the decision. Matching rules supports equals/contains, case sensitivity, scope, priority, enabled state and visual defaults/ignore.

Precedence per profile:

1. Manual occurrence mapping.
2. Manual series mapping.
3. Existing explicit event visuals.
4. Highest-priority matching rule; stable ID breaks ties.
5. Unmatched: inbox, absent from child display.

Rules are evaluated rather than copied into thousands of rows. Provider title changes can change automatic matches, while manual decisions remain intact. Missing required visuals keep an include decision incomplete. Newly added profiles start unreviewed. No raw provider title becomes a child label automatically.

## Validation

Apply migrations in order; the Google milestone adds only `202609240001_google_calendar.sql`. Follow [Google deployment](google-calendar-setup.md) for commands and hosted checks. No old migration is rewritten.

Run `npm test`, `npm run lint`, `npm run build`. Tests cover state/user/browser/expiry/replay, normalized timed/all-day/recurring/cancelled events, Google request pagination and sync-token reset, preserved visuals, multi-profile relevance, RLS, credential isolation, disconnect and upgrade preservation. PGlite uses explicit Auth/Storage/Vault test doubles; Google HTTP is fixture-driven. Hosted consent, Vault encryption and live Google transport still require the documented end-to-end checks. The read-only `/tests/browser/calendar-admin.html` fixture exercises admin UI without executing save/network actions.
