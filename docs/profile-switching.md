# Profile switching and caregiver PIN

Profiles have an explicit `child | sibling | caregiver | other` role. Existing
profiles migrate to `child`; names never determine roles. Older clients omitting
role/photo fields preserve existing values when updating a profile. Profile photos use the
existing private household image bucket. A configured sun, star, flower or moon
is the next fallback, followed by initials on a deterministic dark ID-based color.
Broken photos fall back without a broken-image icon. White initials meet AA
contrast. Photo cropping is circular with `object-fit: cover`; rings are outside.

The display header has a secondary 48px touch target showing the current avatar.
First/Next/Then uses a small top-right avatar action. The chooser shows only active,
server-authorized profiles in the same household. Avatars are 144px on large
screens, 112px on tablets and 92px on phones, wrapping rather than shrinking.
The chooser and PIN prompt are native modal dialogs with focus management,
Escape/Cancel, a masked numeric input, a tablet keypad and Enter submission.
`showProfileSwitching: false` hides the trigger; missing legacy preferences show it.

## Policy and server storage

Defaults permit child/sibling switching without a PIN. Caregiver targets always
require it. Caregivers can leave for an unprotected child/sibling without a PIN.
Other profiles are unprotected unless lock-all is enabled. Disabling child-to-child
switching protects child/sibling targets when leaving any non-caregiver (and at an
initial launch with no recorded current profile). Lock-all protects every target
switch. Closing the chooser on the current profile is not a switch.
Each caregiver owns a PIN. Entering Sheri always requires Sheri’s credential;
Tyler’s grant cannot unlock her direct URL. The named prompt shows the caregiver’s
avatar/name, “Caregiver access”, and “Enter <First Name>’s PIN”. Protected child,
sibling or other targets offer all configured active caregivers in the household;
the parent explicitly chooses any one before entering that person’s PIN. There is
no household default caregiver. An unconfigured caregiver is unavailable. A child
switch is unavailable only if no eligible caregiver can authorize it.

Admin > Profiles keeps only the household behavioral checkboxes in **Profile
Switching & Access**. The existing persisted/API spelling
`requirePinForAllProfileSwitches` is retained for compatibility. The selected
caregiver’s **Caregiver access** section sits between identity and Display &
Interaction. It shows Configured / Not configured / Change required, Set or Change
PIN, Reset PIN, and Require PIN change. Reset clears the credential and locks that
profile until a new PIN is set. It requires confirmation. Changing to a non-caregiver
also requires confirmation and removes the credential, attempts and related grants.
Children/siblings/other profiles have no credential-management section.

New caregiver profiles and role conversions show PIN + confirmation and **Set PIN
& Save Profile**. The Edge function hashes the PIN, then a single database RPC
saves identity, display preferences and credential in one transaction. Cancellation
writes nothing. A deferred database constraint rejects direct profile creation or
conversion without a configured PIN in that same transaction. Existing ambiguous
caregivers from migration can still be edited, but remain locked until configured.

PINs accept 4–8 numeric digits. WebCrypto PBKDF2-HMAC-SHA-256 uses 600,000
iterations, a fresh random 32-byte salt and a 32-byte derived key, as in the prior
implementation. `private.caregiver_profile_credentials` is keyed by
`(household_id, profile_id)` and stores separate `pin_hash`, `pin_salt`,
`pin_version`, and `pin_change_required`. Only caregiver profiles may own rows.
RLS and explicit revocations deny direct browser and service-role table access;
only narrowly granted server RPCs can return a credential to the Edge function.
Browser context exposes configured/change-required booleans, never hash/salt.
No PIN/hash/salt is stored in localStorage, display preferences, the bundle or logs.

Attempts are keyed by household/caregiver/authenticated user, isolating one
caregiver’s backoff from the others. Reserving the failure count before hashing
prevents concurrent/interrupted attempts from bypassing backoff. Minimum spacing
is one second; the fifth failure starts five seconds, doubling to a 60-second cap.
The one-use, 15-second internal ticket binds caregiver, target, user, verified
Supabase session, credential version and household policy revision.

A required PIN change first verifies that caregiver’s old PIN. No display grant is
issued yet. A random one-use five-minute change token stays in dialog memory and
is bound server-side to the same caregiver/target/user/session/version. New PIN
and confirmation complete an atomic change; cancellation, expiry, reset and replay
cannot produce a grant. Credential changes increment only that caregiver’s version
and invalidate grants/attempts authorized by them. Other caregivers remain usable.

Grants are keyed by household/user/session/target and record the authorizing
caregiver plus credential version, with a 15-minute expiry. Multiple independent
caregiver grants may coexist; leaving a profile does not discard the other grants.
Caregiver targets require the grant’s authorizer to equal that target. A child grant
does not authorize a different child target. Revalidation checks active caregiver,
configured credential, version and forced-change flag. A stale caregiver selection
cannot act as an unlocked source. Policy changes invalidate household grants;
role/active changes invalidate only grants related to the affected profile.

Responses expose only safe allowed/reason/retry/expiry state, plus the temporary
change token only after successful old-PIN verification. Raw errors, PINs,
hashes/salts, internal tickets and JWTs are never logged or returned.

## Authorization boundary and direct navigation

`profile-access` verifies the bearer with `auth.getUser`, derives `session_id`
only from that verified token, and checks household membership. Caller-supplied
user/session identities are ignored. Public context/authorization RPCs derive
identity from PostgREST's verified claims and repeat membership, household,
active-target and PIN policy checks. Browser roles cannot call the hash/ticket
RPCs. Server-recorded current profiles prevent spoofing a caregiver source role.

App renders no schedule at initial launch until the server authorizes the target.
URLs, reloads and browser Back/Forward use that same check. Successful selection
updates the profile query parameter, retains household/query context and the
existing session, and keys the renderer by the selected profile's own preferences.
All calendar, clock, weather, context and Home & Sleep settings still come from
the existing per-profile projection. No schedule engine was duplicated.

An already authorized current display can retain cached data during a temporary
outage. This never permits a new switch. Protected grants expire locally as well
as on the server. Access is rechecked every 30 seconds and on foregrounding;
expired, inactive, different-household or changed-role grants fail closed.

**Temporary trusted-session limitation:** the current app still runs under a
caregiver's authenticated household-member session. Existing member RLS permits
that caregiver to read household schedules and use Admin. The PIN gates display
navigation; it does not turn that session into a restricted device credential or
hide its authorized data from developer tools/direct Data API calls. Do not give
this trusted session to an untrusted user and describe it as display-only access.

The typed display authorization boundary contains household ID, allowed profile
IDs, default profile ID and scope. Today the server emits `trusted-caregiver-display`.
The contract also accepts planned `display-only` scope. Future restricted-device
sessions must provide server-enforced allowed IDs and limit schedule/image reads
to those profiles (RLS or an authorized projection endpoint) before this scope
is issued. The chooser consumes this authorization contract independently of the
schedule renderers. No restricted-device authentication bypass was introduced.

## Setup for a later authorized rollout

Migrations: the original `202610030001_profile_switching.sql` remains unchanged.
The new `202610050001_caregiver_profile_pins.sql` conservatively migrates a legacy
household PIN only when **exactly one caregiver profile exists** (including inactive
caregivers when counting ownership). Zero/multiple caregivers receive no inferred
credential. It drops the shared hash and clears old grants/attempts. Existing
unconfigured caregivers remain unavailable until explicitly configured. New service
RPCs handle atomic save, credential management, begin/finish verification and forced
change. Image cleanup and schedule components are preserved.

Edge Function: `supabase/functions/profile-access` (shared implementation in
`server/profiles/handler.ts`). A future approved rollout needs the new migration,
redeployment of **profile-access**, and the web build together. Existing prerequisite
migrations must also be present on a fresh database. No other function requires
redeployment for this PIN change.

The function uses the existing Supabase URL, anon/publishable server verification
key and service-role server key. Set `PROFILE_ALLOWED_ORIGINS` to a comma-separated
list of exact HTTPS app origins; it falls back to `CALENDAR_ALLOWED_ORIGINS`.
For local development the existing strict URL validator permits `http://localhost:5173`.
URL whitespace/newlines/userinfo fail closed. No new privileged browser key is used.

On a later approved rollout: apply the new migration, configure allowed origins,
deploy `profile-access`, publish the web build, then configure each caregiver’s PIN and roles
through Admin. An already authenticated caregiver sets the PIN directly; the agent
does not need its value. Before these steps, the new UI fails closed when the
access RPCs are unavailable. Nothing was deployed or applied during implementation.

## Local review and tests

Development-only fictional fixture:
`http://127.0.0.1:5173/tests/browser/profile-switch.html`.
It explicitly simulates outcomes without authentication/backend calls; it is not
a security test or part of the production bundle. The existing Admin fixture
shows read-only access settings and the real profile editor.

Named PIN dialog measurements: 598px high at 1280×800, 960×1440, 768×1024
and 412×924; no dialog scrolling at these sizes and no horizontal overflow.
Short phone landscape may use bounded dialog scrolling; the document is not a new
nested scroller. These are Chromium fixture checks, not a new actual Fire-device
verification. The isolated fictional Fire APK remains unchanged.

Regression tests use actual database roles plus real KDF verification: two different
caregiver PINs, cross-PIN rejection, independent backoff, direct URL and session
binding, one-use tickets/change tokens, forced-change expiry, target-only reset,
atomic creation/conversion and downgrade cleanup, both caregivers authorizing
protected child targets, conservative zero/one/multiple ownership migration,
cross-household denial, no secret responses/logs, and existing shared photo cleanup.
Legacy migration behavior is tested against its original schema separately.

Validation for caregiver-owned PINs: all 181 tests (including database/migration
coverage), lint, production/PWA build, and Deno checks for profile-access,
calendar-actions and google-oauth passed. The fictional browser forced-change flow was also exercised through old-PIN
entry, new-PIN confirmation and successful profile selection after recovering
from a browser timeout. Real security is covered separately by the database and
Edge handler tests. No migration was applied to a hosted
or local Supabase database; tests use disposable PGlite databases. No deployment,
commit or push was performed.
