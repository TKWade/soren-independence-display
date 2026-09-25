# One schedule, multiple display modes

## Product principles

1. One schedule engine supports multiple presentation modes. Local and Google scheduling, recurrence, matching rules, people, activities, places, profile relevance and home/sleep rules are shared infrastructure.
2. Presentation complexity is profile-specific, expressed through neutral **Display Mode** and interaction preferences, never a ranking of people.
3. More information is not inherently better. Some people benefit only from immediate here-and-now sequence information.
4. The product must not assume that every user can navigate technology independently. A complete useful display must be possible without taps or screen changes.
5. Caregiver setup effort is a first-class requirement: **configure schedule information once whenever possible. Never require a separate schedule for each presentation mode.**
6. Soren's approved Week and Day-B experience remains the primary real-world validation target for current development. The new mode is an architectural proof, not a redesign of his display.

## Data model and defaults

`ProfileDisplayPreferences` is versioned and typed in `src/types/display.ts`. A dedicated `profile_display_preferences` row belongs to exactly one profile; a compound household/profile foreign key and household RLS prevent cross-household access. The `preferences` JSON object has application and PostgreSQL validation. Extra keys are allowed for future additive settings, while required fields, modes, booleans and limits are validated. Only implemented modes are accepted today.

| Preference | Existing/Week default | First/Next/Then recommendation |
| --- | --- | --- |
| displayMode | week | first-next-then |
| maxVisibleItems | 7 | 3 |
| allowNavigation | true | false |
| autoAdvance | true | true |
| showWho / showWhere | true / true | false / false |
| showTimes | false | false |
| motionPreference | normal | normal |
| audioEnabled | false | false |

`maxVisibleItems` is validated from 1 to 7 for extensibility. First/Next/Then caps it at three (and offers 1–3 in admin). Week always retains all seven days and its full Day timeline; its item limit does not truncate existing content. `showTimes` adds start times inside Day or immediate-sequence cards, never to Week summaries. WHO/WHERE preferences also apply to Week summaries and Day-B contexts; defaults preserve all existing context.

The migration backfills every existing profile with Week defaults and creates a trigger for future profiles, including sample data. Missing preference rows fall back to approved Week defaults. Invalid records fail explicitly rather than selecting an unpredictable renderer. Profile name/active status and preferences save together through the authenticated `save_display_profile` RPC, using caller RLS and a single transaction.

## Renderer boundary

```text
Household repository + calendar/recurrence infrastructure
                      ↓
                 normalizeWeek
                      ↓
NormalizedSchedule (DaySchedule[] + household timezone)
                      + ProfileDisplayPreferences
                      ↓
                DisplayRenderer
                 ↙            ↘
          WeekRenderer    FirstNextThenRenderer
```

`App` loads no new provider concepts: it selects the active profile, resolves preferences, calls the existing normalizer and hands the result to the renderer. Renderers do not query Supabase or inspect raw database rows, Google IDs, recurrence or event source. They consume the existing `DisplayEvent` activities, people, pictures and places. Shared timing comes from `getTimelineState`, so boundaries and overlapping-event precedence agree with Day-B.

The original App's Week/Day presentation markup, focus restoration, Escape behavior, day selection, WEEK return, TODAY badge, DO/WITH/SLEEP, embedded context, arrows and NOW/NEXT treatments now live in `WeekRenderer` and the same existing components. Primary stylesheet/layout rules are unchanged. Optional component props add preference gates and times only when requested. The original Day A development query fallback is retained; production still uses Day-B.

## First / Next / Then

This single-screen renderer shows today's current activity, if any, followed by upcoming activities in chronological order. In gaps it starts with the next upcoming activity. FIRST/NEXT/THEN communicate sequence positions, not additional claims about whether an activity has begun. Completed events leave the sequence according to the existing timing engine, including its end-exclusive and final-sleep rules. It does not pull tomorrow's activities into today's view.

Large activity pictures and short labels dominate. Optional WHO/WHERE sections are subordinate and omit missing/redundant context using the existing picture-context logic. With fewer remaining events, show only those events; with none, show the calm NO PLANS state. No date labels, week/calendar navigation, modal screen or activity buttons are required. Allowing navigation is a permission ceiling, not an instruction to add controls: this mode has none even if that setting is true.

With `autoAdvance=true`, the existing clock updates the view as schedule time progresses. With it off, `DisplayRenderer` holds the normalized schedule snapshot and clock from mount. Reopening/reloading the display or changing profile preferences resets this snapshot. Schedule edits also require reopening a paused display; otherwise cancellations/edits will not appear until resumed. This explicit hold behavior avoids silently advancing at midnight or at the start of a new week. Pausing does not persist a manual cursor across reloads.

No caregiver manual advancement is implemented. A future authenticated caregiver control could set a per-profile occurrence cursor/session override passed through this boundary into the shared sequence selector; it should never mutate event times or create another schedule.

## Display & Interaction editor

Under caregiver **Profiles → Display profiles**, select a profile and choose **Week / Detailed** or **First / Next / Then**. Advanced settings offer visible count (immediate mode), navigation permission, automatic progress, WHO/WHERE, start times, motion and future audio permission. Changing modes explicitly starts from that mode's recommended settings, which caregivers can adjust before saving. No unimplemented mode is selectable.

`motionPreference` scopes nonessential motion at the renderer root. Normal preserves existing styling; reduced and none conservatively suppress animation/transitions and smooth scrolling. OS reduced-motion settings are also respected. State changes remain understandable without motion; the palette is unchanged. This is not a complete sensory-profile system.

`audioEnabled` persists future permission only. There are currently no audio cues, voices, recognition or audio services in either renderer, regardless of this value. The editor states that explicitly.

## Extension points (not implemented)

- **Short Sequence:** a small configurable sequence extending the immediate selector.
- **Half Day:** a bounded morning/afternoon projection.
- **Full Day:** an independent one-day presentation without Week navigation.
- **Two Day:** a today/tomorrow presentation.

`PlannedDisplayMode` documents these names separately from the implemented `DisplayMode` union. To ship another mode, add its renderer and validated mode/defaults, a new migration when necessary, admin option, profile tests and viewport checks. Reuse `NormalizedSchedule`; do not add a mode-specific event store or sync path. Time-window expansion, if needed later, belongs in the shared normalization engine rather than in a renderer.

## Migration and verification

New migration: `supabase/migrations/202609240002_profile_display_preferences.sql`. Earlier migrations are unchanged by this milestone. Apply it before deploying this client, because household loading now reads the preference table. No manual edits/backfill of existing profiles are needed.

With accurate linked migration history:

```powershell
npx supabase db push --linked --skip-vault --dry-run
npx supabase db push --linked --skip-vault
```

Review the pending set before pushing; if the corrected Google migration is still pending, it must precede this one. If earlier migrations were applied through SQL Editor without recording history, apply only the new preferences migration there instead of replaying foundation migrations. No hosted database changes are performed by this implementation.

Automated tests cover default modes, invalid settings, renderer selection and real normalized input, sequence timing and fewer/zero events, WHO/WHERE flags, navigation denial, RLS, cross-household references, atomic save/rollback, backfill and automatic new-profile defaults. Existing Week/Day, recurrence, calendar and Vault tests remain in the suite.

Browser fixtures are development-only and excluded from the production bundle:

- `/tests/browser/display-modes.html?size=large` — First/Next/Then, no context.
- Add `&context` for WHO/WHERE, `&paused` for a frozen snapshot, `&mode=week` for the approved Week/Day renderer, `&locked` to deny Week navigation, or `&admin` for a read-only profile editor.
- `size=large|medium|small` creates exact 1280×800, 1024×640 or 960×600 child viewports. The outer fixture button advances time only in the test harness.

Week, Day-B and First/Next/Then were checked at all three sizes without child page overflow. First/Next/Then with secondary context also fit the compact sizes. Automatic advancement, paused hold, Week return and focus restoration were exercised. These checks use fictional normalized data; hosted settings persistence is covered by local PostgreSQL tests and still needs a live-project smoke test after migration.


### Date selection and the SLEEP-only case

The canonical clock is `useToday`: a current `Date` instant refreshed every 15 seconds and on focus/visibility changes. `App` gives this same instant to `normalizeWeek` and `DisplayRenderer`. `selectSequence` resolves the date with `dateKey(now, schedule.timeZone)` / `dateInZone`, using the household IANA timezone inherited by profiles. It selects that exact date, never Monday, the first nonempty day, or Week's selected day. Week's selection is private state inside `WeekRenderer`.

First / Next / Then is the **remaining sequence**, not a recap of the whole day. For example, on Thursday September 24, 2026, once the daytime activities have ended and only Thursday's sleep remains, the correct result is one FIRST card labelled SLEEP. This is true both before bedtime (upcoming) and after bedtime (current through local midnight). Missing activities are not filled from another day. At 04:30 UTC Friday, Chicago is still Thursday, so Thursday's sleep remains correct. The existing explicit paused-view behavior described above still holds the mount-time clock and schedule until reopened; it never borrows a Week selection.

Regression tests cover Thursday selection, nonempty surrounding days and reordered week arrays, missing today, Chicago/Tokyo UTC boundaries, local midnight and week rollover, completed/active/upcoming events, and a single remaining sleep using both normalized fixtures and the persistent engine. The reported live screenshot has no captured clock/data snapshot, so its precise cause cannot be proven from the image description alone; the one-card case is expected when only sleep remains.

### Admin sections

Navigation is **PROFILES → PEOPLE → PLACES → ACTIVITIES → SCHEDULE → CALENDARS**. Profiles is the default section and contains the existing profile editor and all Display & Interaction settings. Schedule contains events, recurrence, profile assignments, and home/sleep rules with date overrides; it does not configure profiles. Calendars retains connections, calendar selection, Inbox, matching rules and sync controls. OAuth returns still open Calendars. All profiles share the scheduling infrastructure; no duplicate schedule is needed for different display modes or people.
