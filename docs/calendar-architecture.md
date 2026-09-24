# Calendar sources and visual enrichment

## Ownership

Google Calendar or Microsoft 365 can remain the authoritative scheduling system. The application keeps a normalized scheduling snapshot and stores visual enrichment separately. Supabase now persists application records and authenticates caregivers; see [Supabase setup](supabase-setup.md). Local recurrence, deterministic matching, per-profile external-event review and provider-neutral sync infrastructure are implemented. Live provider OAuth/transports are not; see [the external calendar milestone](external-calendars.md).

| Record | Owner | Contents |
| --- | --- | --- |
| `CalendarEvent.calendar` | External calendar for linked events; app for local events | Title, start/end, timezone, all-day flag, recurrence, raw location text |
| `CalendarEvent.source` | Integration boundary | Local/external discriminator and generic external identity/sync metadata |
| `EventVisualEnrichment` | Application | Profile assignment, child label, activity, picture, caregivers, visual place, display visibility |
| `HomeSchedule` | Application | Per-profile recurring weekday home/sleep location, bedtime, caregivers and pictures |
| `DaySchedule` / `DisplayEvent` | Derived, not persisted | Profile-specific picture timeline consumed by the approved Week/Day UI |

`CalendarEvent.source` is a discriminated union: `{ kind: 'local' }` or `ExternalEventSource`. The latter retains `provider: 'google' | 'microsoft'`, `externalCalendarId`, `externalEventId`, optional `externalSeriesId`, optional original occurrence start, and optional `lastSyncedAt`. There are no Google/Graph payload types in UI components and no tokens in this model. A future connector/account boundary must namespace provider identities if multiple accounts are supported.

## Many profiles, one scheduling record

An event has a stable app ID. Each `(eventId, profileId)` pair has its own `EventVisualEnrichment` record. Soren and a sibling can reference the same scheduling event while using different pictures, labels, caregivers, visual places, or visibility. A caregiver `Person` is separate from a display `Profile`; neither is inferred from calendar attendees. Enforce uniqueness of the pair in a future persistence layer.

A provider refresh replaces calendar-owned fields only. It must not replace enrichment records. Editing the child-facing label or hiding an event must not rename or delete the external event. Linked-event scheduling edits belong in the authoritative calendar; any future write-back requires a separately designed workflow. Local events use the same calendar/enrichment structure without external IDs. Provider cancellation/deletion should stop projecting the affected occurrence while retaining app metadata according to a future retention policy; hiding it for one profile must not affect another.

## Projection boundary

The persistent runtime uses `repository.ts` to read authorized rows and `persistentSchedule.ts` to join one profile's visible enrichments with calendar occurrences and effective sleep rules. The older `buildDaySchedule` adapter remains a mock regression fixture. Missing enrichment is omitted from the child display rather than showing unreviewed provider text. Field-by-field projection keeps source identifiers and recurrence details out of `DisplayEvent`. A hidden/missing primary event falls back to the first visible event in the Week summary. Input records are not mutated.

The persistent normalizer accepts individually scheduled timed events and resolves local recurring series through `recurrence.ts`. The external projection now accepts resolved provider instances and cancellations from the normalized cache. A real provider adapter must expand recurrence and process exceptions before committing that cache. It must not pass a recurring series master as if it were a single displayed occurrence. Preserve stable occurrence IDs, the series ID, and the original start when an occurrence moves, so metadata does not accidentally migrate to a different occurrence.

`CalendarRecurrence` expresses provider-neutral RRULE values with additional/excluded dates. Provider adapters will translate into this contract; no provider recurrence object belongs in the UI. External recurrence expansion and series-versus-instance override persistence are deferred. Local rules are separate in `local_recurrence`; see [local recurrence and images](recurrence-images.md) for the engine and future exception strategy.

Imported timed timestamps must identify instants with offsets; `timeZone` retains the calendar’s IANA zone for recurrence/DST semantics. All-day records use date-only start/end with an exclusive end date. A future occurrence adapter must explicitly decide their display timing rather than parsing a date-only value as local midnight. The persistent runtime now uses household timezones and absolute event instants, handles overnight overlap, and resolves sleep rules with compatible DST disambiguation. Real provider recurrence expansion remains deferred; normalized all-day ranges now project at household-local day boundaries.

## Matching rules

`EventMatchingRule` describes an enabled rule, numeric priority, target profile IDs, title match (`equals` or `contains`, explicit case sensitivity), optional external-source scope, and proposed visual defaults. The examples map SCHOOL to the school activity and SWIMMING to swimming. A THERAPY rule can follow the same structure once an appropriate activity/picture exists.

The matching engine normalizes whitespace, applies the requested case comparison, and processes higher priority first, with rule ID as a deterministic tie-break. Rules propose enrichment only; they never change title, time, recurrence, location, or source identity. Explicit per-event/profile enrichment takes precedence. Incomplete matches need review before becoming visible; profile assignment must be explicit. Rules should apply to future recurring occurrences without duplicating the scheduling source. Deterministic rule evaluation and caregiver review/admin controls are implemented for cached external events. Live provider imports are not connected yet; see [external calendar infrastructure](external-calendars.md).

## Home and sleep are app-owned

Sleeping location must not require Google/Microsoft calendar events. The caregiver editor stores recurring weekday rules and date-specific overrides in `home_rules`. The persistent adapter derives the existing SLEEP timeline card and Week SLEEP picture directly from these rules, even with no calendar events. Date overrides take precedence; deleting one restores the weekday rule. These cards are derived display items, not externally synced events. Effective-date ranges remain deferred.

## Current validation

The persistent runtime uses the approved Week/Day components. Tests cover existing timing behavior, source-independent projections, independent profiles, visibility, unchanged prototype summaries, database conversion, sleep overrides and timezone boundaries. Embedded PostgreSQL tests execute the migrations and seed and check household and storage RLS. The old mock adapter remains only as a regression fixture.

See [external calendar integration](external-calendars.md) for connections, selected calendars, private sync state, profile relevance, matching precedence and trusted server boundaries.
