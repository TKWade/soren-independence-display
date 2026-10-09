# Scheduling interaction prototype (development only)

This is a disposable interaction study for Tyler and Lori: **where you see the schedule is where you edit the schedule**. It is not a production scheduling implementation. All schedules, residents, appointments and contextual people/places are fictional. The names Soren and Siv identify the requested family scenario only; no household data is loaded.

## Open locally

Run `npm run dev -- --host 127.0.0.1 --port 5173` (reuse the existing Vite server if it is already running).

- Family: http://127.0.0.1:5173/tests/browser/scheduling-prototype.html?scenario=family
- Residential: http://127.0.0.1:5173/tests/browser/scheduling-prototype.html?scenario=residential
- Caregiver Setup: http://127.0.0.1:5173/tests/browser/scheduling-prototype.html?scenario=family&setup=1
- Task checklist: http://127.0.0.1:5173/tests/browser/scheduling-tasks.html

The clock is frozen at **October 6, 2026, 2:30 PM** so tomorrow always means October 7 and both testers see the same tasks. Changes, library additions, review decisions, visibility preferences and the task checklist live only in React memory. Reloading or changing scenario resets them. Open the task page in a separate tab to keep your current schedule while checking off tasks.

## Isolated static hosting

Run `npm run build:prototype` to produce `dist-prototype/` with a landing page, Family, Residential, Setup and Checklist routes. This is an explicit fictional-study build; the normal production build and local fixture DEV guard remain unchanged. See [build, isolation and Cloudflare Pages settings](scheduling-prototype-hosting.md).

## Interaction model

The first screen is a child display with no editing controls or pending imports. Open the profile avatar, choose **Caregiver tools**, then **Simulate unlock**. This explicitly fictional permission step never calls production PIN/authentication code. The same profile/date stays on screen and gains an **EDITING [NAME] / Add Activity / Done** toolbar. Done hides editing and pending imports.

The separate **Caregiver Setup** experience (landing bar, profile menu or editing toolbar) edits fictional Soren, Siv/resident and Caregiver identities with existing avatars. Dependent profiles also get **How much schedule should this person see?**, offering Now + Next, Today, 2–7 days, 2/3/4 weeks and Month. No renderer/mode choices are exposed. Selecting another person restores their own session-local choice. Soren and Siv both start at 7 Days; set Siv to Month in Setup without changing Soren. Caregiver identity has no child-schedule visibility preference. Configuration stays in React memory only. Schedule Undo preserves the latest profile configuration. Month includes the complete month plus adjacent dates in a six-row, seven-column calendar at every width; multiweek ranges start at the selected anchor date. Tapping a date opens its Day timeline without navigating to Admin.

The Day timeline uses linear 15-minute slots: **30px per slot / 120px per hour** on tablet/desktop. Narrow screens (600px or less) use **52px per slot** to keep 14px titles and short-event controls readable in overlap lanes. Long events retain their duration height with a bounded 32px picture, title/time/context at the top. Today initially opens around 30 minutes before the frozen current time; another date opens near its first event, and empty dates start around 9 AM. The surrounding day remains available through normal document scrolling. Tap empty time to open Quick Add, pick a recent/favorite activity, and Add. Defaults populate duration and contextual people/place. Optional context expands inside the sheet. A local event can be tapped to replace its activity, edit date/time/context, duplicate or cancel it. Duplicate preserves the saved event, starts the copy at the same time, and opens no unrelated page. Cancellation is reversible with Undo.

In editing, **hold an activity for 500ms** with at most 8px movement to enter Move mode, then drag. Moving earlier cancels the hold and leaves native touch scrolling alone. A short tap opens the event editor. Touch listeners prevent scrolling only after a hold activates; if the browser already owns scrolling, the gesture cancels. Long-press never edits imported timing. No vibration permission or dependency was added.

Drag the **six-dot grip** vertically to move an event. Drag its **bottom handle** to resize. Both snap to 15 minutes and retain the existing duration while moving; drag near the top/bottom of the usable viewport to scroll. Edge scrolling starts only after movement, accounts for the sticky toolbar, and contributes to snapped time changes. Escape, pointer/touch cancellation, loss of browser focus, or Cancel move discards the preview; release commits once and exposes Undo. A live time preview appears during changes. Arrow Up/Down on the move/resize controls offers the same 15-minute precision; Shift + Arrow on move changes an hour. The editor's time fields are the alternative for touch users who prefer explicit values. Overlapping events occupy separate lanes within each connected overlap group; touching endpoints do not overlap. Updates re-sort chronologically. No conflict is silently deleted or displaced.

**New Activity** creates name, built-in picture and optional default duration inside the event sheet, automatically selects it and returns to that event. New person/place use the same inline pattern within optional context. These library drafts are committed only when the event is added/saved. Closing the sheet discards them.

The editing toolbar stays sticky at every width. Day has an always-reachable Week/Month/range back control inside that toolbar, plus a quiet fixed back control outside editing. It restores the prior calendar scroll position. Today/Now + Next profiles can temporarily open Week through Back without changing their saved visibility. Toggling Tools measures and restores the visible timeline offset where document boundaries allow. At 1920px the Day timeline and toolbar both measure 1160px wide, centered in the viewport; tablet/phone widths remain fluid. Time scale is unchanged. Add and Done stay visible; secondary actions scroll horizontally on narrow screens. **Add Activity** uses the first visible time below the toolbar, while tapping an empty slot uses that exact time. Outside editing, a quiet fixed **Caregiver tools** button remains reachable throughout Day. Closing sheets restores focus without scrolling back to the header.

**Copy day** and **Apply routine** append local events only for the selected profile. School Day, Weekend and No School are examples; the sheet explicitly explains that existing events remain. Copying included imports creates new local copies and never edits the imported original. Same-day copying is disabled to avoid accidental wholesale duplication. Undo restores the preceding in-memory snapshot (up to 20 operations).

### Add/edit time behavior

Changing Start immediately keeps End if it is still later. Otherwise, End becomes the new Start plus 30 minutes. Start snaps to the nearest 15-minute slot and is bounded to 00:00–23:45. A repaired End is capped at same-day midnight (shown as 00:00), so changing Start to 23:45 repairs an earlier End to midnight, a 15-minute event. The sheet never rolls the event into another date. Dragging remains separate: it preserves the existing duration and stops at day boundaries instead of shortening the event.

## Moving between dates

Open a saved local event and choose **Move to another day**. The horizontal Monday–Sunday picker highlights its current date and offers adjacent-week arrows. Choosing a different day immediately moves the saved event and opens the destination Day. Start/end, duration, event identity, profile relevance and context stay intact. Undo restores the original date. This quick action moves the saved version (unsaved sheet drafts are not applied); the normal form still offers a Custom date section for editing a draft before Save.

Editable full-grid Week/multiweek/Month calendars at viewport widths of 900px or more have dedicated move handles. A Week also needs at least 1040px of available content width; scrollable Week strips always use the day picker. Drag across date cells to preview a highlighted destination; release commits once. Tap a handle or use Enter to open the day picker. Drop outside a date, Escape or pointer cancellation makes no change. Imports remain read-only. The gesture never attaches to ordinary activity-card swipes; narrow layouts omit handles and use the same event-sheet picker. There is no drag across an off-screen month boundary; use the picker's week arrows/custom date.

### Responsive Week strip

Week and other short 2–7-day ranges remain one chronological row. Below 1040px of available calendar width, that row scrolls horizontally with 78vw day cards (bounded to leave at least 44px for the next-day cue). It uses gentle `x proximity` snapping, start-aligned days, a thin scrollbar and a keyboard-focusable region. The page still owns vertical scrolling; neither the body nor the Week introduces page-width overflow. At sufficient width, seven roughly 140px or wider day cards fit with six 10px gaps and no horizontal scrolling. Month and multiweek keep their existing grids.

A fresh current range starts with Today followed by Tomorrow. Returning from Day or toggling caregiver tools restores the Week's horizontal position for that profile/range. Rotation or another layout-width change falls back to the first date. The editing Today button resets the strip to Today. Ordinary activity cards preserve native panning; scrollable Week strips omit cross-day drag handles and retain the event sheet's Move-to-day picker.

## Imported events on the calendar

The family fixture contains Google-style fictional appointments. Gold dashed cards marked **Imported · review** appear only while editing. There is no event-title dropdown. Tap a card to choose Soren, Siv or both, an activity, and Include/Ignore. Imported dates/times remain read-only, including after inclusion. Dragging and resizing are local-event operations only.

For repeated titles, **Apply to future events with this title?** updates currently loaded unreviewed matches from that date onward, scoped to this fixture's single fictional calendar. Earlier occurrences and explicit previous decisions remain unchanged. The prototype records the rule concept in memory; it does not ingest new provider batches or synchronize anything.

The **Imported Events** review layer works on the 7-day, multiweek and Month surfaces. Each appointment has its own selection checkbox. Select multiple appointments, choose target profiles and either retain individual suggested activities or select one activity, then Include/Ignore selected. Select this range is restricted to dates currently on screen. Pending/ignored events never render as accepted child activities.

The residential fixture has four residents, no imported events or external dependency, twelve 15-minute activities each morning, and a deliberately overlapping appointment.

## Usability tasks

The task page now has 16 checks: five setup/cross-day/navigation checks, five touch/scroll checks, followed by the original six tasks. The new checks cover normal swipe without movement, long-press PT +30 minutes, preserving a 45-minute duration, unlocking/Done while scrolled, and adding from the visible time range. The original tasks remain:

1. Add PT tomorrow at 3:15 PM for 45 minutes.
2. Move it to 4:00 PM.
3. Replace an existing activity.
4. Create an activity inline and schedule it.
5. Copy a day's schedule.
6. Include three imported events for one profile.

Also try the routines, new people/places, a multi-profile import, title-wide future review, visibility choices, Done, and the residential overlaps. Record completion time, assistance needed and confusing labels separately; the fixture collects no analytics or feedback.

## Reuse and isolation

Reused unchanged production components: `DisplayBrand` (approved horizontal logo), `ProfileAvatar` (circular fallback art), `Picture` (local SVG pictures), the `PictureKind` type and shared brand tokens. The prototype's editable calendar/timeline are separate development components, not changes to approved production renderers. No production schedule engine, recurrence handling, Google sync, Home & Sleep, profile PIN backend, authentication or native Fire project was changed.

Shared prototype interactions reside under `tests/browser/scheduling/`. The original local `scheduling-main.tsx` entry rejects non-development execution before dynamically importing components. A separate explicit `prototype/` host now packages the same components for fictional static review. Production's Vite entry does not import either entry and its built assets/PWA cache contain none of the prototype pages or code. No new dependencies, migrations, Edge Functions, credentials, persistence or provider calls were introduced.

## Validation

- Initial prototype baseline: full suite **189 passed**, including database/security regressions.
- Current refinement: `node --test tests/schedulingPrototype.test.mjs tests/prototypeHosting.test.mjs`: **22 passed** (20 scheduling and 2 hosting), including horizontal Week restoration and safe fallback after a layout-width change, along with existing editing, profile visibility and isolation regressions.
- `npm run lint`: passed.
- `npx tsc -p tests/browser/tsconfig.scheduling.json`: passed (fixture files are deliberately outside the production TypeScript project).
- `npm run build`: production/PWA build passed; emitted files were scanned to verify no prototype entry, interaction labels or simulated unlock code was bundled.
- Browser: fictional unlock; empty-slot PT add with 45-minute/context defaults; keyboard and actual pointer movement; actual pointer duration resize; replacement; inline activity creation; copy day; bulk inclusion of three imports for Soren only; Month; Done hiding controls/pending imports; independent Soren/Siv visibility; dense residential overlaps.
- Compact layout checks: 1280×800, 960×600, 800×1280, 600×960 (Fire landscape/portrait approximations), 768×1024, 412×924 and 844×390 had no horizontal page overflow. Sticky tools measured about 115px tall (130px with a visible horizontal scrollbar on narrow screens). About 5.7 hours fit under the toolbar at 1280×800, 3.8 hours at 412×924 and 2.3 hours at 844×390.
- Browser interactions: Today/current context and tomorrow/first event; scrolled caregiver unlock; visible-time Add; normal wheel scrolling; native handle drag of Therapy from 9:15–10:00 to 9:45–10:30; Undo; edge auto-scroll. Narrow three-event overlap lanes wrap 14px labels. Time remains in the axis, accessible event name and editor when omitted from a short/narrow block.

## Latest expansion verification

- Setup saves Siv as Month independently of Soren at 7 Days. Month has 42 dates in seven columns; selecting a date opens Day and sticky MONTH returns while scrolled.
- A saved PT event moved Tuesday to Wednesday at 2:00–2:45 PM; Undo restored Tuesday.
- A real pointer drag moved School from Tuesday to Wednesday at 8:00–11:00 AM; Undo restored both columns.
- Latest viewport checks: 1920×1080, 1280×800, 768×1024, 412×924 and 844×390 all retained aligned toolbar/timeline, reachable sticky Back and no horizontal page overflow. Day measured 1160px wide at 1920; the existing 30px/15-minute scale (52px on narrow phones) stayed unchanged.
- Added regressions for valid/invalid calendar drops, cancellation, narrow-screen fallback, day-picker date boundaries, profile isolation, configuration surviving schedule Undo, all supported visibility ranges and current-plus-next selection.

## Responsive Week verification

All requested sizes retained seven dates on one row in child and caregiver modes, with no horizontal page overflow or internal vertical scrolling. Fresh ranges started at horizontal offset zero.

| Viewport | Approximate day width | Week behavior |
| --- | --- | --- |
| 390×844 | 303px | Horizontal strip; 36px next-day preview |
| 412×924 | 321px | Horizontal strip; 39px next-day preview |
| 430×932 | 336px | Horizontal strip; 44px next-day preview |
| 844×390 | 658px | Horizontal strip; 122px next-day preview |
| 768×1024 | 599px | Horizontal strip; 106px next-day preview |
| 1280×800 | 161px | All seven days visible |
| 1920×1080 | 209px | All seven days visible |

Native horizontal wheel/trackpad-style input moved only the Week strip. At 390px, the Move-to-day picker moved School from Wednesday to Thursday with its 8–11 AM duration intact; Undo restored it. Returning from Day restored the prior 313.6px Week offset. Narrow strips exposed no drag handles; the two wider layouts retained them. Siv's Month preference still produced 42 dates in six rows without changing Soren's 7 Days. Physical finger-swipe arbitration and proximity-snap feel remain actual-device checks.

## Known compromises

- This validates interactions, not production authorization or data correctness. Simulated unlock has no security value and must not be wired into the real display.
- Event dates use fixed fictional local date/minute values. There is no DST, timezone conversion, all-day or overnight scheduling, recurrence editing, offline queue or concurrent-edit resolution. Midnight is permitted only as the end of the same scheduling day.
- Pictures are existing built-in placeholders. PT/Therapy need appropriate real activity imagery before daily use. All recent/favorite suggestions are fixture data, not a learned ranking.
- Child and caregiver displays here explore a shared calendar surface; they do not replace the approved Week, Day-B or First/Next/Then layouts. Now + Next uses a frozen clock, one current event and the next future start (or the next two future events when nothing is current); simultaneous current events use stable chronological order and still need product review.
- Long timelines use natural document scrolling. Sheets have bounded scrolling with persistent actions. Narrow Week ranges use a horizontal single-row strip. Month keeps seven columns, with a count and representative activity picture on each date; tap a date for its full timeline. A gold dot marks pending imports, and the mobile Month review layer exposes its selectable imported-event list below the grid. Dense overlap lanes prioritize labels over secondary detail; tap to inspect/edit full details.
- Pointer dragging was verified in desktop Chromium emulation. The available browser driver cannot synthesize a held touch; long-press/swipe/cancel transitions are covered by deterministic gesture tests, but native touch arbitration remains an actual-device acceptance check. Actual Fire/iPad touch, assistive technology, long names and larger overlap clusters still need user testing. There is no production drag library. Calendar drag uses dedicated handles only on sufficiently wide full grids; cards themselves retain normal scrolling. Scrollable Week strips use the day picker.
- Copy/routines append and expose overlaps rather than resolving them. Imports use explicit profile/activity decisions, not the real matching engine. Future-title application covers cached fictional occurrences only.

## Recommended production plan (requires a separate approved milestone)

1. Run the six tasks with Tyler and Lori in both relevant environments. Decide default horizons, how navigation behaves, overlap policy, and whether the shared edit surface is preferable to the approved display-to-editor transition. Keep production display choices until that feedback is settled.
2. Add a versioned, profile-specific visibility preference and a compatibility adapter from existing preferences. Project it through the current normalized schedule and existing renderer contracts. Do not copy this disposable fixture model into database tables or build a second schedule/recurrence engine. Preserve Home & Sleep and visual/profile metadata ownership.
3. Introduce explicit local-event commands (create, move, resize, cancel, duplicate, copy and routine application) over existing repositories and server authorization. Validate household/profile ownership, local versus imported source, 15-minute input policy, timezone/DST and recurrence instance-versus-series semantics. Use transactions for inline library creation + event save, revision checks for concurrent edits and explicit preview/undo behavior for bulk actions.
4. Build real caregiver edit authorization. Existing PIN grants gate display navigation under a trusted household session; they are not yet authorization for arbitrary schedule writes. Define server-checked edit scope/session/profile grants and expiry before enabling edits, preserving all current credential protections. Never promote simulated unlock.
5. Replace fixture import decisions with the existing external-event/mapping/rule/profile-relevance APIs. Keep provider-owned title/time/recurrence/location read-only. Scope future-title rules to a calendar/provider and profile set, preserve explicit decisions, and make bulk review transactional or expose per-item failures. Reuse existing synchronization and Inbox models.
6. Roll out behind a development/feature flag, retaining approved renderers and navigation. Add real mutation, conflict, RLS, timezone, recurrence, accessibility, offline and PWA regression coverage; verify touch on the actual wall tablet before replacing production caregiver scheduling UX.

No commit, push, deployment or hosted configuration change was performed for this prototype.
