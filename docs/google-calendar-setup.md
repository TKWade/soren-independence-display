# Google Calendar: deployment and end-to-end verification

Google is the first live provider. Microsoft remains unavailable. Week and Day are unchanged; imported scheduling goes through the existing ExternalEvent normalization, profile matching and Calendar Inbox. Google remains authoritative for scheduling; visual enrichment and home/sleep rules stay in this application.

## 1. Google Cloud setup

1. Open https://console.cloud.google.com/ and select/create a project for this app. Under **APIs & Services → Library**, enable **Google Calendar API**.
2. Open **Google Auth Platform → Branding** (or OAuth consent screen). Set an app name, support email and developer contact email. For production, supply your real homepage/privacy-policy URLs and verify any required domains.
3. Under **Audience**, select Internal only if every intended account belongs to your Google Workspace organization. Otherwise select External. While in Testing, add every caregiver Google account under Test users. External Testing grants using these scopes normally expire after seven days; this is Google's testing policy, not a refresh implementation failure. Move to Production and complete any required verification before relying on unattended long-term access.
4. Under **Data Access**, add exactly these two scopes:
   - `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
   - `https://www.googleapis.com/auth/calendar.events.readonly`
5. Under **Clients → Create client**, choose **Web application**, name it, and add this exact **Authorized redirect URI** (no trailing slash):

   ```text
   https://pvkrwzieiyuztqupxifj.supabase.co/functions/v1/google-oauth/callback
   ```

   This is the currently linked Supabase project. A different project needs its own matching URI in both Google and the server secret. Do not use Supabase Auth's `/auth/v1/callback`: Google Calendar is a separate connection, not the caregiver sign-in provider. Authorized JavaScript origins are not needed for this server authorization-code flow.
6. Save the client ID and client secret securely. Neither belongs in Vite configuration, source control, browser code or a public table. Use a dedicated OAuth client so revoking it does not affect unrelated integrations.

The authorization request uses `response_type=code`, `access_type=offline`, `prompt=consent select_account`, one-use state and S256 PKCE. Both requested scopes must be granted. No write, broad Calendar, Gmail, OpenID or email scope is requested. The connected account label is its primary calendar ID, ordinarily the account email, discovered using CalendarList; no separate identity API is called. Calendars with only free/busy access are excluded because they cannot supply event details. New calendars default to disabled/ignore.

References: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth), [OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

## 2. Supabase server secrets

Set these via **Supabase → Edge Functions → Secrets**, or a local secret file outside the repository:

```dotenv
GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=YOUR_WEB_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI=https://pvkrwzieiyuztqupxifj.supabase.co/functions/v1/google-oauth/callback
GOOGLE_OAUTH_RETURN_URL=http://localhost:5173/admin
CALENDAR_ALLOWED_ORIGINS=http://localhost:5173
```

For hosted use, change RETURN_URL to the exact HTTPS app `/admin` URL, and ALLOWED_ORIGINS to its origin (no path or trailing slash). Multiple API origins may be comma-separated, but the OAuth kickoff must originate from RETURN_URL's origin. Use separate development/production projects or update this configuration when switching origins. No request-supplied return URL is accepted.

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to hosted functions. Do not place these privileged server credentials in the client. The existing browser variables remain only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Google needs no browser environment variables.

PowerShell, with a secrets file you create outside the repository:

```powershell
npx supabase secrets set --project-ref pvkrwzieiyuztqupxifj --env-file C:\secure\soren-google.env
```

Do not paste real secrets into documentation, chat, command-line arguments or logs.

## 3. Migration and Vault

Apply `supabase/migrations/202609240001_google_calendar.sql` after all previous migrations. It requires the real `supabase_vault` extension and fails if it is unavailable. There is no plaintext fallback.

It adds account identity, private expiring OAuth transactions, a service-only credential RPC, Vault cleanup on connection deletion, and serialized sync/discovery wrappers. OAuth refresh tokens live encrypted in Vault; the existing private credential table holds only secret IDs. Access tokens live only in Edge Function memory. Browser roles cannot execute the credential RPC or read Vault, pending OAuth data or checkpoints. Reconnect/disconnect invalidates checkpoint revisions without deleting visual mappings.

For a linked project with accurate CLI migration history:

```powershell
npx supabase db push --linked --skip-vault --dry-run
npx supabase db push --linked --skip-vault
```

Review the dry-run before pushing. `--skip-vault` skips the CLI's optional Vault secret synchronization; the SQL migration still enables and uses Vault. If earlier migrations were manually applied without recording CLI history, apply only this new migration in SQL Editor instead; do not rerun the foundation against existing data.

[Supabase Vault documentation](https://supabase.com/docs/guides/database/vault). Local SQL tests use an explicitly labeled Vault test double because PGlite cannot load Supabase's extension. Those tests verify permissions and lifecycle, not encryption; real Vault storage must be verified after deployment.

## 4. Deploy the Edge Functions

After configuring secrets and applying the migration:

```powershell
npx supabase functions deploy calendar-actions --project-ref pvkrwzieiyuztqupxifj
npx supabase functions deploy google-oauth --project-ref pvkrwzieiyuztqupxifj
```

Use the repository's `supabase/config.toml`. Both entry points set gateway `verify_jwt=false`: **calendar-actions still explicitly verifies every bearer token with `auth.getUser`, then household membership before any service action**. This supports current signing keys. `google-oauth/start` accepts only a same-app POST containing a valid Supabase session, matched to the initiating OAuth user. `/callback` accepts Google's GET redirect only with the one-use state and Secure, HttpOnly, SameSite=Lax browser cookie. An unauthenticated caller cannot create a connection. Never remove these handler checks. See [Supabase function configuration](https://supabase.com/docs/guides/functions/function-configuration).

The client submits its existing Supabase session to the start endpoint in a POST body, never a query parameter. The kickoff ticket alone cannot authorize a different browser/user. Callback token exchange and account discovery occur server-side. Completion rechecks household membership and refuses expired, replayed or disconnected transactions. Do not log request bodies, callback query strings, provider responses or credential RPC results.

Use a normal Chrome/Edge browser for actual OAuth, not an embedded webview. Start and finish on the same browser within ten minutes. Browser cookie blocking or interrupted/expired consent requires starting Connect Google again.

## 5. Sync behavior and operational limits

Sync Now is the current trigger; no scheduled job or push registration is installed. A future trusted scheduler can reuse `googleAdapter` + `syncCalendar` + `SupabaseSyncStore` without a browser or a new model. Do not make the authenticated action endpoint public to implement scheduling.

The selected calendar's **unexpanded** collection is initially paged with `singleEvents=false`, `showDeleted=true`; its final `nextSyncToken` stays private. Incremental requests use this token with the same query, no incompatible date filters, and the same token on every page. No-change syncs update the checkpoint without fetching occurrences. A change (including cancellation) causes a bounded resolved-occurrence snapshot with `singleEvents=true`, from 30 days back to 180 days ahead. Thus an infinite recurrence does not cause infinite expansion. The window is reused until fewer than 30 future days remain, then rebased.

This first adapter uses incremental change detection plus bounded snapshot reconciliation, not per-event delta writes. Changed calendars cost an extra bounded read; it avoids complex recurrence expansion and exception bugs. Unexpanded initial enumeration can read old events from the selected calendar, but is not repeated on every sync. Neither disabled calendars nor unrelated account history are fetched. Limits: 100 pages / 20,000 entries per collection, 20,000 normalized changes per commit, 15-second HTTP request deadlines. Larger calendars fail with no checkpoint advancement. Automatic retries/backoff and long-running job orchestration are deferred.

The checkpoint is obtained before the bounded snapshot so concurrent provider changes are replayed on the next sync. All snapshot pages must succeed before scheduling and checkpoint are committed atomically. Absent events become cancelled; visual decisions remain. HTTP 410 resets once and reconciles a fresh snapshot. Refresh `invalid_grant` marks the connection as needing authorization. Connect Google again with the same account to preserve mappings; explicitly re-enable calendars after disconnect.

Disconnect disables local authorization and calendars and deletes the Vault secret first. It then attempts Google's revocation endpoint. If Google cannot confirm revocation, the admin sees that local disconnect succeeded and can remove the app under Google Account → Security → third-party connections. Google revokes grants at the Google-user/OAuth-client level: other copies of the same account connection using this OAuth client may require reconnecting. Cached scheduling and visual mappings are retained but cease contributing to the child display. Local events/home rules remain available. In-flight sync/discovery and OAuth completion cannot restore local authorization.

References: [Google incremental sync](https://developers.google.com/workspace/calendar/api/guides/sync), [events-list query restrictions](https://developers.google.com/workspace/calendar/api/v3/reference/events/list).

## 6. End-to-end test sequence

1. Run `npm test`, `npm run lint`, `npm run build`. Deploy the migration/functions and configure secrets. Start the app (`npm run dev`) at the exact RETURN_URL origin. Sign in as a household caregiver and open `/admin` → CALENDARS.
2. Click **Connect Google**, select a configured test user, grant both read-only scopes, and return to Calendar connections. Confirm the Google account label and available calendars. All new calendars must be disabled/ignored. In browser network/storage inspection there must be no Google access/refresh token or client secret (the existing Supabase session is expected).
3. Enable one test calendar, select **Include and evaluate events**, save, then click **Sync Now**. Leave another calendar disabled and confirm its events do not enter the inbox.
4. In Google Calendar create a timed SCHOOL event, a multi-day all-day event, a weekly SWIMMING series, and one moved recurring occurrence within the sync window. Sync. Check exact dates, timezones, exclusive all-day end and series grouping in Calendar inbox. Unmatched events must remain absent from the child display.
5. Map SCHOOL and the SWIMMING series to Soren's existing visuals; optionally include his sister independently. Add a title rule for THERAPY. Confirm Week/Day retain their approved UI and sleeping location still comes from Home & sleep.
6. Edit title/time/provider location in Google; sync again. Check scheduling updates while manual child labels, photos, caregiver, visual place and profile decisions remain intact. Create another matching event and confirm the rule applies. Ignore for one profile without hiding it for the other.
7. Delete a single event, cancel one occurrence, and then delete a test series in Google; sync after each. Confirm removed items disappear without deleting app-owned mappings. Sync once more without changes and confirm success (unit tests verify no bounded snapshot request for an empty delta).
8. Test invalid-token recovery on a **test calendar only**, using SQL Editor as project admin to replace its private cursor with `{"syncToken":"intentionally-invalid-for-test"}`. Click Sync Now. Google should respond 410; fresh sync should recover without duplicate events or lost visuals. Automated HTTP fixtures deterministically cover this response even if Google's live error differs.
9. Disable/re-enable the calendar and confirm child visibility changes after refresh. Click Disconnect Google; confirm status disabled, calendars disabled, cached external events hidden, credentials removed from Vault, mappings retained and local events/home rules unchanged. Reconnect the same account, re-enable and sync; verify mappings return without duplicates.
10. Remove app access in Google's account settings, then Sync Now; expect an authorization failure and reconnect workflow. Cancel a consent attempt, revisit an old callback, and try with a different nonmember Supabase user: none may create/restore a connection. Close the browser, reopen/sign in and Sync Now to verify server-side offline refresh works; continuous syncing while closed requires the future scheduled trigger.

For step 8, replace only the test calendar UUID:

```sql
update private.calendar_sync_state
set cursor = '{"syncToken":"intentionally-invalid-for-test"}'::jsonb, revision = revision + 1
where calendar_id = 'YOUR_TEST_CALENDAR_UUID'::uuid;
```

No migration, secret configuration or deployment is performed automatically by implementing this code. Real-account consent, hosted Vault encryption and live synchronization require the above setup and are not established by local fixture tests.

## Retrying the Vault permission failure

The corrected 202609240001 migration does not change ACLs or ownership on the managed `vault` schema, tables, views or functions. Supabase keeps Vault outside the browser Data API. All application credential entry points remain denied to PUBLIC/anon/authenticated; only the service-role RPC can read decrypted credentials. Keep Vault out of exposed Data API schemas and do not add browser-callable wrappers or views over decrypted secrets. The app-owned cleanup trigger function is also explicitly denied to browser roles. The local Vault double checks access/lifecycle, not hosted Vault ACL defaults or Data API configuration.

This file has explicit `BEGIN` and `COMMIT` and no intermediate commits. If executed as the complete file, the reported permission error aborts the entire transaction, including earlier DDL, function moves and permission changes. A still-open SQL session may need `ROLLBACK` before reuse; disconnected sessions roll back automatically. Earlier successfully applied migrations are unaffected. Running selected statements individually outside the transaction would be different. See [PostgreSQL transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html).

A normal failed CLI push should not mark this version applied. Do not repair history merely because it failed. Check first:

```powershell
npx supabase migration list --linked
```

If 202609240001 is local-only/pending, retry the corrected file using the dry-run/push commands above; no history repair is needed. SQL Editor executions do not themselves record CLI migration history. If using SQL Editor, retry the whole corrected file, not just the removed statement.

If history unexpectedly says applied, inspect before retrying. These read-only SQL Editor checks should show no new column/pending table/credential RPC after the failed transaction (assuming no earlier successful installation):

```sql
select exists (
 select 1 from information_schema.columns
 where table_schema='public' and table_name='calendar_connections'
 and column_name='provider_account_id'
) as google_column_exists,
 to_regclass('private.calendar_oauth_pending') as pending_table,
 to_regprocedure('public.google_calendar_credentials(text,jsonb)') as credential_rpc;
```

Only if history incorrectly marks it applied **and the schema confirms rollback**, use `npx supabase migration repair 202609240001 --status reverted --linked` before retrying. Repair changes history only, not schema. Do not mark a failed migration applied or repair other versions. If the Google objects already exist, investigate whether an earlier/partial execution succeeded before changing history. See [Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair).
