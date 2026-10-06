# Wall Display Readiness — trusted-device pilot

## Caregiver controls and launch

The existing Household / Display / Open / Refresh toolbar is unchanged. A collapsed **This device** panel immediately below it uses the selected Display profile and offers:

- **Use this profile on this device**
- **Keep screen awake while displaying the calendar**

Only profile/household IDs and the keep-awake preference are stored locally, under a versioned key scoped to the authenticated user. Each household has its own entry; saving a profile also chooses the household for the next generic launch. A blocked/full local storage write reports failure in the caregiver panel. Browser/installed-app storage is origin-specific; localhost, 127.0.0.1 and production do not share these preferences.

The manifest still starts at `/`, without any household/profile ID. After the real session and accessible household data load, the display validates the saved profile against active profiles in that household. Existing explicit `/?household=…&profile=…` links take precedence and do not overwrite the saved preference. An explicit invalid link, missing default, inactive/deleted profile, or inaccessible saved household leads to **Choose a display → Caregiver setup**, never a different child's default. `/admin` continues its existing selection/navigation behavior and ignores the saved launch household. Saved IDs are preferences only; real Supabase authentication and RLS remain the authorization boundary.

Use **Open** for an immediate display visit; use the device-default button for subsequent generic installed-app launches. Saving a different household's profile makes that household the launch target but preserves the other household's setting. Another authenticated account cannot use the first account's preference. Signing out clears loaded application data through the existing keyed authentication subtree; preferences remain scoped to their original account for later sign-in.

## Keep awake

The display route requests a Screen Wake Lock only after it has a valid active profile, usable schedule and an explicitly enabled device setting for that household. It does not run in Admin or the selection/error screen. It releases on disabling, unmount/leaving, hidden visibility, and pagehide. It reacquires on visible visibility/pageshow when enabled. In-flight requests are deduplicated; a late grant after cleanup is released. Unsupported/rejected requests are silent on the child screen, and OS release never starts a timer retry loop.

This requires browser support and normally HTTPS. The OS/browser may still refuse or release the lock. It does not launch the app after reboot, override battery-saving restrictions, hide system controls, or provide kiosk lockdown. Physical-device behavior must be verified separately.

## Refresh and overnight findings

The existing useHouseholdData lifecycle still owns exactly one 60-second polling timer, plus online and focus refresh. It now also refreshes on visibilitychange when visible. The lifecycle is extracted for controlled tests; no second refresh loop was added. Concurrent triggers are deduplicated while a request is in flight. Cleanup fences both household-list and snapshot responses so an old household/session cannot commit after switching. Root continues to key the entire data subtree by authenticated user.

Loaded data remains during routine requests and failures. Calendar and cached-weather snapshots reach the same display renderer, whose key is still profile plus display preferences, not loading/error/refresh count. A routine refresh therefore does not intentionally remount the selected Day or timeline. An actual profile/preferences change can reset the renderer as before. If successful membership/profile data shows access revoked or the profile removed, the display stops showing it; stale IDs cannot authorize continued access.

The existing display clock still updates every 15 seconds, on focus and visibility change, using current time rather than accumulating elapsed timer ticks. Controlled tests cross America/Chicago midnight: Today advances, the rolling week keeps it in column two, NOW/NEXT recompute, and weather selects the local forecast date under existing freshness rules. Calendar normalization and weather normalization are unchanged.

Existing navigation semantics remain: an explicitly opened Day stays on that date after midnight while it remains in the visible date range. It does not automatically navigate to today's Day. Once that date leaves the rendered range, the renderer falls back to Week. Standard calendar navigation anchors remain selected until Today is chosen. Profiles with autoAdvance disabled retain their existing paused-clock/schedule semantics. For a daily wall pilot, enable autoAdvance and prefer the rolling Week as the unattended resting screen. No new overnight interaction was invented.

## Offline boundaries

| Scenario | Result / boundary |
| --- | --- |
| A: Already-open display loses network | The loaded in-memory schedule stays visible. Failed refresh does not replace it with WAIT. Loaded weather retains existing stale/expiry behavior. Private photo URLs may expire; this task does not cache private photos. |
| B: Connectivity returns | The existing online event triggers refresh; subsequent calendar and cached-weather data replace the loaded snapshot. Focus/visible resume and the existing polling timer also recover. |
| C: Full reload while offline | Offline cold-start of private household data is not supported. The installed PWA may load its cached application shell, but an absent/unverifiable session or unavailable data produces NOT READY / TRY AGAIN rather than a private schedule. A passing A/B test does not establish C. |

There is no new service-worker caching of authenticated API responses, credentials or private photos. The smallest safe offline cold-start follow-up would be a separately reviewed, explicit opt-in local snapshot design scoped to account/household, with expiry, sign-out/account-switch erasure, revocation limitations, and a separate private-image strategy. That security/storage work is outside this milestone.

## Authentication and actual pilot blockers

This is an existing caregiver session on a trusted family device, **not a restricted display account**. Hiding Admin navigation is not a permission boundary: a person with access to the unlocked signed-in tablet retains caregiver access. No auth bypass, injected credentials, public data access, new role or account system is implemented.

A connected trusted-device trial needs a valid session, accessible active profile, installed current frontend, saved device default and appropriate tablet/browser power settings. Automatic weather refresh is still a hosted verification item; this milestone does not change its provider, normalization, cron jobs, credentials or grants. Manual weather refresh working does not establish automatic refresh. Unattended recovery after offline reboot, guaranteed wake lock, and OS kiosk behavior are not provided and may block an unattended deployment if those are required. They need not prevent a supervised connected home trial.

## Validation and physical-tablet checklist

Automated tests use fictional data and controlled lifecycle hosts; no real caregiver login is used. Coverage includes scoped preferences, explicit link precedence, invalid/removed defaults, account/household changes, unavailable local storage, wake-lock lifecycle and rejection, refresh deduplication/fencing, offline retention/reconnect/cold-start failure, clock resume, local midnight, Today column two, NOW/NEXT and local weather date/expiry. The production build retains the generic manifest launch route and shell-only service-worker strategy.

Development browser harness: `/tests/browser/wall-readiness.html`. Its controls simulate pending/failing/successful snapshots and resume at midnight, using the real display renderer and caregiver device panel. It only stores fictional preference IDs and makes no authentication/backend calls. Its render controls are deliberately simulated; controlled tests exercise the real extracted refresh lifecycle separately. The fixture is not included as a production entry point and cannot bypass production authentication.

On the actual wall tablet, before the first daily trial:

1. Load the approved production URL over HTTPS, sign in normally as the caregiver, select the correct Household and Display profile, expand This device and choose Use this profile on this device. Optionally enable keep-awake.
2. Install/add the PWA to the home screen. Close and reopen it through the icon (generic `/` launch). Confirm the chosen household/profile appears after authentication/data loading. Test an explicit different-profile link; generic launches should still use the saved default.
3. Confirm a removed/inactive default or lost household access asks for caregiver selection instead of opening a sibling. Test account switching with fictional/test accounts, never by sharing credentials.
4. Leave the app visible beyond the configured screen timeout. Verify it stays awake when supported, then disable keep-awake or leave the display and verify normal power behavior returns. Test hide/resume and battery-saving mode; do not assume emulator results guarantee hardware support.
5. Open a Day and scroll its sequence. Change a fictional event and refresh cached weather from a caregiver device. Within the normal refresh cadence, confirm both update without WAIT, changed date, or a reset timeline position.
6. Leave rolling Week open across household midnight and suspend/resume the tablet. Confirm Today remains second and NOW/NEXT/time/weather catch up. Test an explicitly selected prior Day separately; retaining that date is existing behavior.
7. Test A (network off while open), B (network restored), and C (offline full reload) separately. Expect C to lack private schedule data; reconnect/reopen to recover. Check private image availability after long disconnection.
8. Confirm the independent hosted weather job updates without the tablet open and calendar synchronization continues. This is verification only; no hosted settings were changed here.
9. After a device reboot, manually reopen/sign in if needed. Configure any OS auto-launch/kiosk requirements outside this app, and acknowledge that this pilot uses a trusted caregiver session.

No schema changes, migrations, hosted configuration changes, deployment, commit or push are part of this milestone.


Browser fixture results: a saved fictional profile resolved after full fixture reload; simulated America/Chicago midnight moved Today to the second column. On an already-open October 2 Day, timeline scrollLeft remained 366.4px across pending refresh, failure and reconnect. Event labels updated and cached daily weather changed from 68°F to 86°F after the recovered snapshot. These are fictional browser renderer checks, not a claim that real hosted refresh or physical device installation has been tested.


Production verification: the built manifest keeps start_url `/` with no household/profile parameters. A local production preview at `/` without an authenticated session displayed NOT READY. This confirms the existing authentication gate remains, not a successful installed Android launch with a caregiver session. Full suite: 165 tests passed; the additional direct App no-WAIT/offline/removed-default regression and all eight wall-readiness tests passed afterward. Lint and production/PWA build passed.
