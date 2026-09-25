# Visual independence calendar

React + TypeScript + Vite, Tailwind CSS and a PWA shell. The approved child Week and Day views receive persistent Supabase data through a repository and normalization layer. Caregiver tools are separate at `/admin`.

## Start

Requires Node.js 22.18+ or Node 24.

```sh
npm ci
npm run dev -- --host 0.0.0.0
npm test
npm run lint
npm run build
npm run preview -- --host 0.0.0.0
```

Follow [Supabase setup](docs/supabase-setup.md) to apply migrations, configure `.env.local`, create a caregiver login and load optional fictional sample data. Until configured and signed in, the child display shows NOT READY rather than mock data. Never place a service-role/secret key in Vite variables.

## Architecture

- `src/types/calendar.ts`: calendar ownership, external identity, per-profile enrichment and UI contracts.
- `src/data/records.ts`, `repository.ts`, `supabase.ts`: database records, authenticated access and private image storage.
- `src/hooks/useSession.ts`, `useHouseholdData.ts`: auth, household selection and refresh.
- `src/lib/persistentSchedule.ts`, `recurrence.ts`, `time.ts`: resolved local occurrences, effective sleep rules and DST-safe timezones.
- `src/lib/images.ts`, `imageProcessing.ts`, `components/PhotoFrame.tsx`: validated uploads, crop presets, optimized images and fixed display bounds.
- `src/lib/schedule.ts`: Week summaries and NOW/NEXT timing.
- `src/admin/`: login, household setup, library/event editors, profiles and sleep rules.
- `src/components/`, `src/App.tsx`: approved child UI, isolated from database queries.
- `supabase/migrations/`: schema, RLS, private storage and optional authenticated seed.
- `tests/`: domain tests and executable PostgreSQL migration/security tests.

See [calendar ownership](docs/calendar-architecture.md) and [Supabase setup/security](docs/supabase-setup.md). Google Calendar can now remain the scheduling source of truth; visual enrichment and home/sleep rules stay app-owned. Read-only Google OAuth, Vault credentials, selected-calendar sync and the inbox are implemented behind the provider-neutral boundary. Microsoft remains deferred. Follow [Google setup and deployment](docs/google-calendar-setup.md) before connecting.

## Child UI and deployment limits

Week preserves seven columns, DO/WITH/SLEEP and TODAY. Day preserves its horizontal picture sequence, arrows, NOW/NEXT, subdued past events and one large WEEK button. The approved removal of future-event numbers remains in place. Each whole day/event card is tappable; Escape returns to Week with focus restored.

Sign in on the trusted tablet through /admin and open its profile link. This is not yet a restricted kiosk account. The Week/Day responsive design remains the one validated at 1280x800, 1024x640 and 960x600.

Production builds generate install icons, manifest and a precached app shell. Android installation needs HTTPS. Authenticated schedule/image responses are not service-worker cached. Failed refreshes retain in-memory data; a full offline reload cannot recover that data. Live Supabase Auth/Storage and Android checks need your configured project.

`src/data/mockWeek.ts` is only a regression fixture; runtime data and seed records are persistent. Seed data is fictional and uses built-in vector placeholders. No real personal information or credentials are included.

## Local recurrence and photo crops

Caregivers can now save daily, weekly/every-N-weeks and monthly series with date bounds, and preview/position/zoom private photos before saving. See [the model, workflow, migration and validation guide](docs/recurrence-images.md). Apply the new 202609230001 migration before using these admin forms.

## Development Day comparison

During `npm run dev`, open `/?dayVariant=a` (approved original) or `/?dayVariant=b` (inline WHO/WHERE), then tap a day. Variant B is the default, including for missing/unknown query values. Add `&dayVariant=a` to an existing profile URL for the temporary development fallback. Production always selects B and excludes the lazy Variant A component. There is no child-facing selector and no schema change.

The default B view lives in `DayTimelineB.tsx` and its scoped stylesheet; the approved `DayTimeline.tsx` and shared child styles are unchanged. It consumes the same normalized events. People whose picture already is the main activity picture are omitted; sleep shows its location without WHO. Empty context is omitted and single-column footers expand naturally. Tapping still opens larger context pictures. Primary activity sizes remain unchanged; secondary frames use 48px, reducing to 34px at compact tablet sizes.

For a sign-in-free comparison using existing mock fixtures, use `/tests/browser/day-comparison.html?dayVariant=a&size=large` or `dayVariant=b`; sizes `large`, `medium`, `small` create exact 1280×800, 1024×640 and 960×600 browser frames. These development fixtures are excluded from production. Screenshots under ignored `artifacts.local/` show the 1280×800 CSS viewport (capture pixels reflect browser display scaling). All three B sizes were checked without page overflow; card expansion and WEEK return were exercised. Selection/conditional-context tests supplement all existing tests.

## External calendar foundation

The CALENDARS admin area now supports selected calendars, per-profile/series visual decisions, deterministic matching rules and an unmatched-event inbox. Scheduling remains provider-owned. Google read-only OAuth, Vault credentials and incremental sync are implemented; Microsoft remains deferred. Apply migrations through 202609240001 and follow [Google setup](docs/google-calendar-setup.md). See [external calendar architecture, security and deployment](docs/external-calendars.md).

## Per-profile display modes

One normalized schedule now feeds the approved Week/Day-B renderer or the new First/Next/Then renderer. Profiles default to Week automatically. Caregiver **Profiles → Display profiles → Display & Interaction** stores mode, context, navigation, timing and motion preferences. See [display architecture, defaults, migration and validation](docs/display-modes.md). Apply `202609240002_profile_display_preferences.sql` before using this client. Each mode reuses the same local/Google schedule; no separate caregiver schedule is needed.
