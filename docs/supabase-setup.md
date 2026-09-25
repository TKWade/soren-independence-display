# Supabase setup

## Project and migrations

Create a Supabase project. In its SQL Editor, run these files in order, once each:

1. `supabase/migrations/202609210001_foundation.sql`
2. `supabase/migrations/202609210002_sample_data.sql`

Both are transactional. The second installs an optional seed function; it does not create user data until called. For existing deployments use Supabase migration tracking rather than rerunning these files. Do not apply over conflicting tables. Keep the `private` schema out of exposed Data API schemas.

The schema includes households, membership, profiles, people, places, activities, calendar events, external sources, per-profile visuals, event/person links, home rules and matching rules. Same-household foreign keys complement RLS. The migration also creates a private image bucket and authenticated RPCs for household creation and atomic local-event saving.

## Login and environment

Enable email/password sign-in in Supabase Authentication. Create the first caregiver manually with a password and confirmed email. Disable public sign-ups for this private prototype. No real user identity or password is included in seed data.

Copy `.env.example` to `.env.local` and fill in:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

Use a publishable key (or legacy **anon** key), never a secret/service-role key. Vite environment values are public browser configuration. RLS protects data. The Vite configuration rejects privileged keys before bundling. No server secret is needed by the application.

Run `npm ci` and `npm run dev -- --host 0.0.0.0`. Restart Vite after environment edits. Production requires the same public variables at build time, HTTPS, and a hosting rewrite from `/admin` to `index.html`.

Open `/admin`, sign in, and create a household with an IANA timezone such as `America/Chicago`. Password resets are managed through Supabase for now; there is no recovery, invitation, public registration or commercial onboarding UI. Additional caregivers can be created in Auth and assigned membership by the project administrator through the SQL Editor. Browser users cannot insert or change memberships. Owner and caregiver membership roles currently share the same data permissions.

## Development seed

Click **Load sample week** while the household is empty. The authenticated `seed_sample_household(hid, week_start)` RPC creates a fictional Sample child, Dad, Mom, two homes, School, Pool, Park, reusable activities, one dated weekly schedule, and recurring sleep rules. It is atomic and refuses to overwrite a nonempty household. It needs no privileged key.

The events persist and do not silently regenerate every Monday. Sleep rules repeat. Create a new empty development household to seed another week. Alternatively add profiles under Schedule, populate the libraries, and create your own events.

Open a profile link under Schedule to show `/?household=<uuid>&profile=<uuid>`. These IDs select records; they are not authorization tokens. RLS applies independently.

## Admin features

- People: name, short label, relationship, photo, fallback icon, active status.
- Places: name, short label, type, address, photo, person badge, active status.
- Activities: name, short label, image/icon, active status.
- Schedule: local-event create/edit/delete, date/start/end, activity, people, place, profiles, label/picture override, visibility, and Week primary-activity flag.
- Home & sleep (under Schedule): repeating weekdays and specific-date overrides.
- Profiles (under Schedule): name, active status, and display links.

The event editor applies its visual choices to all selected profiles; the database supports independent per-profile enrichment. Linked events remain read-only in this editor. Library records are deactivated rather than deleted to preserve existing references. Inactive entries remain resolvable for saved events. Event and profile/person updates occur in one database transaction.

A date-specific sleep rule overrides the weekday rule. Saving the same slot replaces it; deleting the override restores the weekday rule. Sleep does not require calendar events. Household timezone controls dates, TODAY and event instants. Explicit ambiguous/nonexistent DST event times are rejected; recurring bedtimes use compatible DST resolution (earlier offset on repeats, forward shift for missing hours).

## Storage and security

Images use a private `household-images` bucket with paths `<household UUID>/<random filename>`. JPEG, PNG and WebP are accepted, up to 10 MiB after the recurrence/images migration. Policies check membership using the path's household. No public bucket URLs or anonymous enumeration are used. Database rows contain paths, not embedded image data.

The repository generates one-hour signed URLs and refreshes data every minute. Signed URLs are temporary bearer URLs and can remain usable until expiry after membership removal. Do not share them. Photo replacement/removal updates the database reference; old files are retained to avoid deleting files used elsewhere. Orphan cleanup via the Storage dashboard is currently manual. A failed save attempts to remove the newly uploaded image.

Sign in once on the tablet and open its child URL. This is a **trusted caregiver session**, not a restricted kiosk identity: a person with access to that browser can navigate to /admin. Dedicated device authorization is deferred.

## Loading, refresh and offline limits

The child UI shows WAIT during loading, NOT READY before configuration/login, NO PLANS for an empty profile/day, and TRY AGAIN on initial backend failure. It does not display raw errors. A refresh failure keeps the previous in-memory view with SAVED VIEW. Account changes/sign-out unmount all loaded data. Successful membership checks remove inaccessible data; during network outages previously loaded information can remain visible until authorization can be rechecked.

There is no persistent schedule cache or offline mutation queue. Offline reload can recover the PWA shell, but not an unpersisted schedule. Supabase persists the auth session. The service worker does not cache database responses or private image responses.

## Validation and manual checks

Run `npm test`, `npm run lint`, and `npm run build`. Tests execute migrations and the seed in embedded PostgreSQL (PGlite), check two-user RLS/storage isolation and cross-household references, and test normalization, home overrides and timezones. The harness supplies minimal Supabase Auth/Storage schema stubs; it does not test the hosted Auth service or actual image transport.

On your configured project verify sign-in, CRUD/reload persistence, private image upload/access, a second user's isolation, sleep overrides, sign-out clearing the display, and production Android installation. No live Supabase project was provisioned during this implementation.

Google Calendar OAuth and read-only sync are implemented. Apply the new Google migration and configure/deploy the Edge Functions using [Google setup](google-calendar-setup.md). Microsoft remains deferred. Provider scheduling feeds the existing inbox, matching rules and child projection. Admin creates individual timed local events and local daily/weekly/monthly series. The legacy mock-week module remains only as a regression-test fixture, not the runtime source.

References: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

For the new recurring series and photo workflow, apply [202609230001 and follow these deployment steps](recurrence-images.md#migration-and-deployment). Original and optimized image copies remain private; see that guide for validation, cropping and storage limits.

Apply the new 202609230002 external-calendar migration before running the latest client. Follow [external calendar setup and security](external-calendars.md) for provider-neutral ownership, and [Google setup](google-calendar-setup.md) for migration 202609240001, Vault and live Google connections.
