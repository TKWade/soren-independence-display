# Home & Sleep: local-first, optionally calendar-assisted

Every profile owns one `profile_home_preferences` row:
- `overnight_mode`: `local` (default), `calendar_with_local_fallback`, or `calendar_driven`.
- `default_bedtime`: optional normal bedtime, independent of place or caregiver.
- `weekday_bedtimes`: optional weekday-specific times, keys 0 (Sunday) through 6.

Local `home_rules` continue to own repeating weekday locations/caregivers and
specific-date overrides. Their new optional `bedtime_override` is an explicit
assignment-specific time. Existing `bedtime` values are preserved solely for
backward compatibility; new rules no longer receive an invented bedtime.

External Home & Sleep mappings remain the provider-neutral typed effect added
in the preceding milestone (`target: home_sleep`, sleep place/caregiver, normal
or explicit bedtime). They remain reviewed in Calendar Inbox even when the
profile is Local, but they affect overnight locations only after an explicit
calendar-mode choice. No mapping is copied into permanent local rules.

## Location and bedtime resolve independently

| Mode | Overnight location precedence |
| --- | --- |
| Local | Manual date override → local weekday rule → unresolved |
| Calendar + local fallback | Manual date override → calendar assignment → local weekday rule → unresolved |
| Calendar-driven | Manual date override → calendar assignment → unresolved |

Manual date overrides always win. Disconnected, disabled, cancelled or missing
external occurrences do not participate. Calendar-driven mode never silently
uses weekly custody locations. Changing modes preserves every rule and mapping;
switching back to Local restores use of the local schedule.

For the chosen assignment, bedtime precedence is:
1. Its explicit bedtime override.
2. Profile weekday bedtime override.
3. Profile default bedtime.
4. Legacy repeating Home & Sleep rule bedtime for that profile/weekday.
5. Unresolved, requiring caregiver review.

The compatibility bedtime fallback also works in calendar-driven mode, but does
not activate that rule's location. A calendar-driven household can configure a
profile default without creating any local rule. A local household never needs
a calendar account for bedtime, weekday plans, date exceptions or child display.

## External nights and review

All-day events assign every calendar date before the exclusive end. Timed
events assign their household-local start-date night, including DST conversion.
Occurrence-specific Activity/Ignore/Home decisions take precedence over series
mappings. New synced occurrences inherit series mappings; moves and cancellations
change the derived nights without stale copied overrides.

Identical assignments coalesce. Different place, caregiver or effective bedtime
is a conflict, with no arbitrary winner or silent weekly fallback. Conflicts,
missing bedtime and missing locations suppress that night's sleep card and
appear in caregiver review. A manual date override is the escape hatch.

The top-level **HOME & SLEEP** section selects a profile and shows normal bedtime
and source settings. Local mode shows weekly schedules and date overrides without
calendar status clutter. Fallback mode adds calendar status/review. Calendar-driven
mode shows status/review and date overrides, with local weekly controls collapsed
as inactive. Calendar modes without an eligible connected calendar show an explicit
configuration message, never an automatic mode change.

Review covers the next 14 nights and future cached calendar nights. Inbox previews
up to 12 occurrence dates and effective assignments before saving; Local profiles
are explicitly identified as not using the mapped overnight assignment yet.
Activity title rules, matching, normalization, sync, and child renderers remain
unchanged. No automatic sync or notifications are introduced.

## Migration and deployment (not performed)

The prior `202609290002_external_home_sleep.sql` remains intact. The forward
migration `202609290003_profile_home_preferences.sql` adds the single profile
settings model, defaults **all existing and new profiles to Local**, and leaves
normal bedtime unset. It does not infer source mode from connections or mappings.
All old local rules and times remain. Existing date-override times are copied to
the explicit assignment override field so they retain precedence. Existing weekly
times remain the legacy fallback. No duplicate bedtime settings table is added.

1. Review pending migrations: `npx supabase migration list --linked`.
2. Dry-run: `npx supabase db push --linked --skip-vault --dry-run`.
3. Apply only after reviewing the pending set:
   `npx supabase db push --linked --skip-vault`.
4. Build/publish the frontend after schema changes. No Edge Function changes or
   redeployment are required.
5. Test Local with no integrations: profile bedtime, weekly place/caregiver, date
   exception, child SLEEP card. Then explicitly choose a calendar mode, map an
   overnight and verify preview/resolution. Disconnect or remove the occurrence:
   fallback mode uses the weekly rule; calendar-driven mode reports unresolved.
   Switch back to Local and confirm local configuration is still present.

Only isolated test databases receive migrations during tests. No hosted migration,
commit, push, or deployment is performed by this work.
