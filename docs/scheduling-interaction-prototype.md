# Scheduling interaction prototype (development only)

This is a disposable interaction study for Tyler and Lori: **where you see the schedule is where you edit the schedule**. It is not a production scheduling implementation. All schedules, residents, appointments and contextual people/places are fictional. The names Soren and Siv identify the requested family scenario only; no household data is loaded.

## Open locally

Run `npm run dev -- --host 127.0.0.1 --port 5173` (reuse the existing Vite server if it is already running).

- Family: http://127.0.0.1:5173/tests/browser/scheduling-prototype.html?scenario=family
- Residential: http://127.0.0.1:5173/tests/browser/scheduling-prototype.html?scenario=residential
- Task checklist: http://127.0.0.1:5173/tests/browser/scheduling-tasks.html

The clock is frozen at **October 6, 2026, 2:30 PM** so tomorrow always means October 7 and both testers see the same tasks. Changes, library additions, review decisions, visibility preferences and the task checklist live only in React memory. Reloading or changing scenario resets them. Open the task page in a separate tab to keep your current schedule while checking off tasks.

## Interaction model

The first screen is a child display with no editing controls or pending imports. Open the profile avatar, choose **Caregiver tools**, then **Simulate unlock**. This explicitly fictional permission step never calls production PIN/authentication code. The same profile/date stays on screen and gains an **EDITING [NAME] / Add Activity / Done** toolbar. Done hides editing and pending imports.

The profile-specific question **How much schedule should this person see?** offers Now + Next (0 days), 1–7 days, 2/3/4 weeks and Month. No renderer/mode choices are exposed. Selecting another person restores their own session-local choice. Month includes the complete month plus adjacent dates in a six-row calendar; multiweek ranges start at the selected anchor date. Tapping a date opens its Day timeline without navigating to Admin.

The Day timeline uses 15-minute slots. Tap empty time to open Quick Add, pick a recent/favorite activity, and Add. Defaults populate duration and contextual people/place. Optional context expands inside the sheet. A local event can be tapped to replace its activity, edit date/time/context, duplicate or cancel it. Duplicate preserves the saved event, starts the copy at the same time, and opens no unrelated page. Cancellation is reversible with Undo.

Drag the **six-dot grip** vertically to move an event. Drag its **bottom handle** to resize. Both snap to 15 minutes; drag near the top/bottom of the viewport to scroll. A live time preview appears during changes. Arrow Up/Down on the move/resize controls offers the same 15-minute precision; Shift + Arrow on move changes an hour. The editor's time fields are the alternative for touch users who prefer explicit values. Overlapping events occupy separate lanes within each connected overlap group; touching endpoints do not overlap. Updates re-sort chronologically. No conflict is silently deleted or displaced.

**New Activity** creates name, built-in picture and optional default duration inside the event sheet, automatically selects it and returns to that event. New person/place use the same inline pattern within optional context. These library drafts are committed only when the event is added/saved. Closing the sheet discards them.

**Copy day** and **Apply routine** append local events only for the selected profile. School Day, Weekend and No School are examples; the sheet explicitly explains that existing events remain. Copying included imports creates new local copies and never edits the imported original. Same-day copying is disabled to avoid accidental wholesale duplication. Undo restores the preceding in-memory snapshot (up to 20 operations).

## Imported events on the calendar

The family fixture contains Google-style fictional appointments. Gold dashed cards marked **Imported · review** appear only while editing. There is no event-title dropdown. Tap a card to choose Soren, Siv or both, an activity, and Include/Ignore. Imported dates/times remain read-only, including after inclusion. Dragging and resizing are local-event operations only.

For repeated titles, **Apply to future events with this title?** updates currently loaded unreviewed matches from that date onward, scoped to this fixture's single fictional calendar. Earlier occurrences and explicit previous decisions remain unchanged. The prototype records the rule concept in memory; it does not ingest new provider batches or synchronize anything.

The **Imported Events** review layer works on the 7-day, multiweek and Month surfaces. Each appointment has its own selection checkbox. Select multiple appointments, choose target profiles and either retain individual suggested activities or select one activity, then Include/Ignore selected. Select this range is restricted to dates currently on screen. Pending/ignored events never render as accepted child activities.

The residential fixture has four residents, no imported events or external dependency, twelve 15-minute activities each morning, and a deliberately overlapping appointment.

## Usability tasks

The task page provides these six checkable tasks with expected outcomes:

1. Add PT tomorrow at 3:15 PM for 45 minutes.
2. Move it to 4:00 PM.
3. Replace an existing activity.
4. Create an activity inline and schedule it.
5. Copy a day's schedule.
6. Include three imported events for one profile.

Also try the routines, new people/places, a multi-profile import, title-wide future review, visibility choices, Done, and the residential overlaps. Record completion time, assistance needed and confusing labels separately; the fixture collects no analytics or feedback.

## Reuse and isolation

Reused unchanged production components: `DisplayBrand` (approved horizontal logo), `ProfileAvatar` (circular fallback art), `Picture` (local SVG pictures), the `PictureKind` type and shared brand tokens. The prototype's editable calendar/timeline are separate development components, not changes to approved production renderers. No production schedule engine, recurrence handling, Google sync, Home & Sleep, profile PIN backend, authentication or native Fire project was changed.

All executable prototype code resides under `tests/browser/scheduling/` plus the guarded `scheduling-main.tsx` entry and two fixture HTML files. The entry rejects non-development execution before dynamically importing prototype components. Production's Vite entry does not import these modules and its built assets/PWA cache contain none of the prototype pages or code. No new dependencies, migrations, Edge Functions, credentials, persistence or provider calls were introduced.

## Validation

- `node --test --test-concurrency=4 tests/*.test.mjs`: **189 passed**, including all existing database/security regressions and 8 prototype tests.
- `npm run lint`: passed.
- `npx tsc -p tests/browser/tsconfig.scheduling.json`: passed (fixture files are deliberately outside the production TypeScript project).
- `npm run build`: production/PWA build passed; emitted files were scanned to verify no prototype entry, interaction labels or simulated unlock code was bundled.
- Browser: fictional unlock; empty-slot PT add with 45-minute/context defaults; keyboard and actual pointer movement; actual pointer duration resize; replacement; inline activity creation; copy day; bulk inclusion of three imports for Soren only; Month; Done hiding controls/pending imports; independent Soren/Siv visibility; dense residential overlaps.
- Layout: 1280×800, 960×1440, 768×1024 and 412×924 had no horizontal page overflow. Dense 15-minute blocks remained separate. Three simultaneous phone events wrap titles and omit duplicate time text inside the block; slot labels and the accessible event editor retain exact time information.

## Known compromises

- This validates interactions, not production authorization or data correctness. Simulated unlock has no security value and must not be wired into the real display.
- Event dates use fixed fictional local date/minute values. There is no DST, timezone conversion, all-day or overnight scheduling, recurrence editing, offline queue or concurrent-edit resolution. Midnight is permitted only as the end of the same scheduling day.
- Pictures are existing built-in placeholders. PT/Therapy need appropriate real activity imagery before daily use. All recent/favorite suggestions are fixture data, not a learned ranking.
- Child and caregiver displays here explore a shared calendar surface; they do not replace the approved Week, Day-B or First/Next/Then layouts. Now + Next uses a frozen clock and the first two unfinished fixture events; simultaneous-event choice needs product review.
- Long timelines use natural document scrolling. Sheets have bounded scrolling with persistent actions. On phones, Week/Month ranges stack into two-column date cards instead of compressing seven days into unreadable columns. Dense overlap lanes prioritize labels over secondary detail; tap to inspect/edit full details.
- Pointer dragging was verified in desktop Chromium emulation. Actual Fire/iPad touch, assistive technology, long names and larger overlap clusters still need user testing. There is no production-quality drag library or cross-day drag gesture.
- Copy/routines append and expose overlaps rather than resolving them. Imports use explicit profile/activity decisions, not the real matching engine. Future-title application covers cached fictional occurrences only.

## Recommended production plan (requires a separate approved milestone)

1. Run the six tasks with Tyler and Lori in both relevant environments. Decide default horizons, how navigation behaves, overlap policy, and whether the shared edit surface is preferable to the approved display-to-editor transition. Keep production display choices until that feedback is settled.
2. Add a versioned, profile-specific visibility preference and a compatibility adapter from existing preferences. Project it through the current normalized schedule and existing renderer contracts. Do not copy this disposable fixture model into database tables or build a second schedule/recurrence engine. Preserve Home & Sleep and visual/profile metadata ownership.
3. Introduce explicit local-event commands (create, move, resize, cancel, duplicate, copy and routine application) over existing repositories and server authorization. Validate household/profile ownership, local versus imported source, 15-minute input policy, timezone/DST and recurrence instance-versus-series semantics. Use transactions for inline library creation + event save, revision checks for concurrent edits and explicit preview/undo behavior for bulk actions.
4. Build real caregiver edit authorization. Existing PIN grants gate display navigation under a trusted household session; they are not yet authorization for arbitrary schedule writes. Define server-checked edit scope/session/profile grants and expiry before enabling edits, preserving all current credential protections. Never promote simulated unlock.
5. Replace fixture import decisions with the existing external-event/mapping/rule/profile-relevance APIs. Keep provider-owned title/time/recurrence/location read-only. Scope future-title rules to a calendar/provider and profile set, preserve explicit decisions, and make bulk review transactional or expose per-item failures. Reuse existing synchronization and Inbox models.
6. Roll out behind a development/feature flag, retaining approved renderers and navigation. Add real mutation, conflict, RLS, timezone, recurrence, accessibility, offline and PWA regression coverage; verify touch on the actual wall tablet before replacing production caregiver scheduling UX.

No commit, push, deployment or hosted configuration change was performed for this prototype.
