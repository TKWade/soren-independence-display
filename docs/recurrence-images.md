# Local recurrence and image presentation

## Scheduling ownership and storage

`calendar_events.local_recurrence` stores a versioned `LocalRecurrence` object for locally authored series. A null rule means a one-time event. Existing provider `recurrence` and `external_event_sources` remain separate; no external recurrence expansion or synchronization has been added. A series still has one calendar row and independent per-profile `event_visuals` and people links. Home/sleep remains an application-owned weekday schedule with date overrides, not calendar events.

For Thursday every three weeks:

```json
{
  "version": 1,
  "frequency": "weekly",
  "interval": 3,
  "startDate": "2026-09-10",
  "endDate": "2026-12-17",
  "weekdays": [4]
}
```

ISO weekdays run Monday=1 to Sunday=7. Frequency is daily, weekly or monthly. Interval defaults to 1 (validated integer 1–999); weekly accepts multiple weekdays, monthly uses `dayOfMonth` 1–31. Dates are local calendar dates, with inclusive start/end; null end means no end. The master row's start/end instants and IANA `time_zone` retain the template wall-clock times and end-day offset. Admin uses the household timezone. Existing series retain their saved zone until edited; changing the household zone does not silently reinterpret an existing series. Recurring events require both times and can span up to seven local days.

Daily intervals count calendar days from the anchor. Weekly intervals count Monday-based calendar weeks containing the anchor; weekdays before the start date are excluded. Monthly intervals count months from the anchor month; months without the requested day are skipped, never clamped. A range can start partway through a series without changing its phase.

## Caregiver workflow

Schedule → New event (or select a series) → set **Starts**, start/end times, activity/place/profiles/people → **Repeat**. Choose Daily, Weekly or Monthly, interval, weekdays or monthly day, and prominent **Series ends**. A plain-language summary appears before saving. Blank end explicitly means no end date. “First event ends on” allows an overnight event; it is separate from the series end date. Save/edit/delete affects the entire series. Linked events remain read-only. The existing visual fields and per-profile visibility model are retained.

## Resolution and DST

`src/lib/recurrence.ts` is independent of React. It enumerates only the requested date range (bounded to 371 dates), plus a small lookback for overlapping overnight events, using Temporal calendar-date arithmetic. It never repeatedly adds UTC milliseconds. `persistentSchedule.ts` joins resolved occurrences to the master event's profile enrichment, selects the Week primary occurrence, and supplies flat `DisplayEvent` objects to the unchanged child components.

Each date is converted separately in the series timezone. At DST gaps the compatible policy shifts nonexistent wall times forward; at repeated times it selects the earlier instant. An occurrence whose resulting end is not later than its start is omitted (e.g. 02:30–03:00 across a spring gap). Ordinary 08:00 events stay at 08:00 across both transitions. Explicitly entered ambiguous/nonexistent template times are rejected for caregiver correction. End dates limit occurrence start dates; an overnight event may finish after the last series date.

Occurrence identity is `seriesId@originalLocalDate`, with `seriesEventId` and `originalLocalDate` retained below the display layer. Future exceptions should use a table with unique `(household_id, series_event_id, original_local_date)` and compound household foreign keys. A cancellation suppresses that key; an edited instance overlays scheduling and optionally profile enrichment, retaining its original key even when moved. Apply exceptions before range filtering, including moved instances entering the range. A series re-anchor must explicitly reconcile exceptions. No exception editor/table is implemented in this milestone.

## Images

People use a square 768×768 maximum derivative; activities use a square 960×960 maximum; places use a 4:3 landscape 1280×960 maximum. Smaller crops are not enlarged. The shared `PhotoFrame` uses a fixed-height container with clipped overflow and absolutely positioned, bounded images. `object-fit: contain` shows the entire saved crop across Week, Day and context cards, without a second implicit crop; narrow letterboxing is intentional. Intrinsic photo dimensions cannot size grid/flex children. Legacy uncropped tall originals also stay within the frame and can be recropped in admin.

Before any upload, validate JPEG/PNG/WebP MIME and matching file signature, nonempty file ≤10 MiB, successful browser decode, at least 64 pixels per side, maximum 12,000 pixels per side and 40 million decoded pixels. Browser decoding handles orientation. Invalid selections block save until replaced or removed. These are browser validation rules; Storage independently enforces MIME, byte size and household access. A malicious authorized client can bypass client dimension checks, but cannot bypass RLS or the bucket limits.

The reusable `ImageEditor` previews through the actual `PictureTile`/`PhotoFrame`, with the WITH frame for people and DO/WHERE for activities/places. Native accessible horizontal/vertical focal sliders (0–1) and zoom (1–3) update the preview immediately. No custom drag/pointer math or crop dependency is needed. Versioned metadata stores `{version, preset, x, y, zoom}`. Position is the fraction of available pan distance after cropping, not source pixel coordinates.

On save, canvas renders a cropped, resized WebP at quality 0.9; browsers without WebP encoding fall back to PNG, and the extension follows the actual Blob MIME. Preview uses a small rendition of the identical crop. The original is preserved privately for future recropping; display copies are stripped of source EXIF by re-encoding. Private originals may still contain metadata. Legacy `image_path` is treated as the original when first recropping.

Storage paths are `householdId/images/randomId/original.ext` and `householdId/images/randomId/display.ext`. Rows store `source_image_path`, `image_path`, and `image_presentation`; signed URLs are generated for one hour. The child loads only the display path. New failed-save uploads are cleaned up on a best-effort basis. Replaced/removed originals and old derivatives remain private rather than risking deletion of a shared reference. Orphan retention/cleanup remains manual; do not delete referenced files. Photos are never made public or service-worker cached.

## Migration and deployment

New migration: `supabase/migrations/202609230001_recurrence_images.sql`. Previous migration files are unchanged. It adds the local rule and validated image fields, enforces local-only recurrence, anchor/time bounds and same-household source paths, replaces the atomic local-event save RPC, and raises the private bucket limit to 10 MiB. Existing RLS and compound profile/library foreign keys continue to apply. Omitting `local_recurrence` in an older RPC update preserves the rule; explicitly sending null converts to a one-time event.

The test suite applies all migrations to local embedded PostgreSQL (PGlite), including the new migration over the existing schema. Hosted Auth/Storage transport is not simulated by those tests. No hosted migration was applied automatically.

For your already-linked Supabase project, review pending migrations first and then apply:

```sh
npx supabase db push --linked --skip-vault --dry-run
npx supabase db push --linked --skip-vault
```

Only proceed if the pending set matches the migrations your project has not applied. If the previous migrations were applied via SQL Editor without CLI migration history, run **only the new migration file** in SQL Editor instead; do not rerun the foundation/seed migrations. Apply before using the updated admin save forms. Refresh/restart the app afterward.

## Verification

`npm test` covers daily/weekly/monthly rules, intervals 1–4, anchoring, inclusive boundaries, multi-weekdays, missing month days, spring/fall DST and gap/fold policy, overnight lookback, stable IDs, Week/Day projection and per-profile visuals. Image tests cover formats/signatures/limits, crop normalization, crop bounds, aspect ratios and no upscaling. Migration tests cover atomicity, invalid rules/metadata, backwards-compatible updates and two-household isolation.

With Vite running, `/tests/browser/index.html` is a development-only, no-backend harness with the real Week/Day components and a synthetic 600×6000 portrait. It also exposes the real crop and recurrence controls without saving. The production build has only the normal application entrypoint and excludes this harness. Use it at 1280×800, 1024×640 and 960×600. No real household photo is embedded in the fixture.

Verified in this milestone: 40 passing automated tests, clean lint, successful production/PWA build, and Week/Day photo bounds at all three requested tablet sizes. Browser checks used the synthetic portrait because the household browser session was signed out. The pre-save crop sliders, icon fallback and actual WebP encode/decode were exercised without uploading to hosted Storage. Live authenticated save/reload and private Storage transport remain checks for the configured project after migration.
