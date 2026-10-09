# Static hosting for the scheduling prototype

This is a standalone fictional interaction study, not a production deployment. It reuses the current prototype: family/residential scenarios, direct editing, sticky tools/back navigation, cross-day movement, Caregiver Setup, per-profile visibility, Month, import review and the 16-task checklist.

## Build and preview

From the repository root, using Node 24 (verified locally with 24.21.0) and the existing lockfile:

```sh
npm ci
npm run build:prototype
npm run preview:prototype
```

The build type-checks the prototype, bundles it with `prototype/vite.config.ts`, and checks the finished output. Output is **`dist-prototype/`**, ignored by Git. Preview is **http://127.0.0.1:4174/**. No environment variables or accounts are needed. Preview serves built files, so rebuild and refresh after changes.

| Route | Page |
| --- | --- |
| `/` | SOREN Scheduling Prototype landing page |
| `/family/` | Soren and Siv |
| `/residential/` | Fictional residents with dense schedules |
| `/setup/` | Family scenario with Caregiver Setup initially open |
| `/tasks/` | Usability Checklist |

Each route has its own real `index.html`; direct visits and reloads do not require a wildcard rewrite. A real `404.html` handles unknown routes. Cloudflare Pages serves these directory indexes and canonicalizes their URLs. See [Pages route matching](https://developers.cloudflare.com/pages/configuration/serving-pages/).

State lives in React memory. Refreshing, switching scenario pages, or following Home/Checklist links resets that page's edits; profile switching, Setup, Month and Day within a scenario retain state. Keep the checklist in another tab if desired. The fixed fictional date remains October 6, 2026. No Day/profile URL persistence has been added.

## Existing Cloudflare Worker: soren-prototype

The current destination is the existing **Worker** `soren-prototype` at `https://soren-prototype.tyler-kaufman86.workers.dev`, rather than a Pages project. Point this Worker's build/deploy commands explicitly at the isolated build and config. A successful upload of the normal `dist/` application can show its NOT READY screen; upload success alone does not identify the correct frontend.

Use these exact **Workers Builds** settings (repository root):

| Setting | Value |
| --- | --- |
| Worker name | `soren-prototype` (keep the existing Worker) |
| Build command | `npm run build:prototype` |
| Deploy command | `npx wrangler deploy --config wrangler.prototype.jsonc` |
| Root directory | Repository root (leave blank or use `/` in the dashboard) |
| Build environment | `NODE_VERSION=24` |
| Application/provider environment variables | None |

Workers Builds has separate build and deploy commands and uses the Wrangler version in `package.json`; see [Cloudflare build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/). Wrangler is pinned exactly to **4.149.0** in the manifest and lockfile. CI should install with `npm ci`. A Cloudflare CI deployment token is separate from application secrets and is never bundled.

The isolated **`wrangler.prototype.jsonc`** is:

```json
{
  "$schema": "./node_modules/wrangler/config-schema.json",
  "name": "soren-prototype",
  "compatibility_date": "2026-10-08",
  "assets": {
    "directory": "./dist-prototype",
    "html_handling": "auto-trailing-slash",
    "not_found_handling": "404-page"
  }
}
```

There is no `main`, script, binding, production asset directory or SPA fallback. `/family/` serves `dist-prototype/family/index.html`; `/family` redirects to `/family/`. Other page directories work the same way. Unmatched requests receive `dist-prototype/404.html` with HTTP 404. These are the documented [Workers static-site routing settings](https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/).

Always specify `--config wrangler.prototype.jsonc`. No generic root Wrangler config is created, and no future production deployment should reuse this prototype config. The normal `npm run build` still produces `dist/`, which this Worker configuration never uploads. This site is served at the origin root; keep it separate from any production domain.

Local verification, without deployment:

```sh
npm run build:prototype
node --test tests/schedulingPrototype.test.mjs tests/prototypeHosting.test.mjs
node scripts/verify-prototype-worker.mjs
```

The final command starts and closes Wrangler's local test runtime using the actual config, checks physical pages and asset bytes, and requires 404 for production/config/signing paths. If `dist/` is present, its actual JavaScript filenames are tested too. It disables telemetry and `.env`-based dev-variable loading, and never authenticates or deploys.

For interactive Wrangler preview, if needed:

```sh
npx wrangler dev --local --config wrangler.prototype.jsonc --ip 127.0.0.1 --port 8787
```

After a separately approved deployment, verify `/`, `/family/`, `/residential/`, `/setup/`, `/tasks/`, and an unknown URL. Use a fresh browser session first. If an earlier visit installed the accidentally deployed production PWA, its cached service worker can still control an existing tab: clear this prototype origin's site data/unregister its old service worker before retesting. This task adds no cleanup behavior to either application.

No deployment or Cloudflare setting change was made for this fix; the existing remote Worker remains unchanged until its next correctly configured deployment. No commit or push was made.

### Pages alternative (not the existing deployment)

For a future separate Pages project only: Framework None, repository root, `npm run build:prototype`, output directory `dist-prototype`, `NODE_VERSION=24`. The Worker above uses the explicit Deploy command instead of a Pages output-directory setting. See [Pages build settings](https://developers.cloudflare.com/pages/configuration/build-configuration/).

## Isolation

- The normal **`npm run build` remains `tsc -b && vite build`**, producing the existing production/PWA `dist/`. Its entry/config are unchanged and do not import this host or prototype.
- The existing local `tests/browser/scheduling-main.tsx` DEV guard stays intact. Only the explicit `build:prototype` entry bundles the fictional components for static hosting; production authentication is untouched.
- The isolated config uses `envDir: false`, `envPrefix: []` and `publicDir: false`. It does not read local environment files or expose `VITE_` values. The module boundary admits only the prototype, React dependencies and an explicit list of existing presentation modules.
- Only the approved horizontal logo and favicon are copied from `public/`. Activity pictures/avatars are built-in visuals. No repository-wide public copy, real photos, APKs, keystores, signing artifacts, source maps or machine-specific files are included.
- No Supabase SDK/client, provider endpoints, API/telemetry transport, real household data or credentials are bundled. Imported appointments are in-memory fiction, with no Google connection.
- The built HTML has a content security policy with `connect-src 'none'`. Scripts/images are site-local; no external API connection is permitted. Inline styles remain allowed for timeline positioning. `_headers` adds the same policy plus frame protection for Workers static assets and Pages; see [Workers asset headers](https://developers.cloudflare.com/workers/static-assets/headers/).
- No service worker is installed by this prototype. The prototype's noindex metadata/robots file discourage search indexing; they are not authentication. Enter fictional information only.

## Verification

Commands run for this packaging milestone:

```sh
npm run build:prototype
node --test tests/schedulingPrototype.test.mjs tests/prototypeHosting.test.mjs
npm test
npm run lint
npx tsc -p tests/browser/tsconfig.scheduling.json
npm run build
```

The hosting regression builds an isolated copy with fake `VITE_` credential canaries and verifies none appear. The artifact verifier checks five route documents and their asset references, the static-file allowlist, no provider/config/credential/machine-path leaks, exact logo/favicon bytes, and the network-blocking policy. Tests scan emitted JavaScript for API/telemetry transports. The normal production output was separately scanned for prototype code/styles/routes and contained none.

Built-site browser checks at port 4174: landing links; direct reload of Family, Residential, Setup and Checklist; Siv's 42-date Month and Month-to-Day navigation; local PT move from Tuesday to Wednesday preserving 2:00–2:45 PM and Undo; fictional imported-event inclusion; checklist count. Loaded assets were local and no browser errors or blocked-connection warnings appeared. The content policy and bundle checks enforce the absence of provider/API connections. Remote-host and real-device acceptance still follow deployment approval; no hosted claim is made here.

## Worker-routing fix verification

Verified locally with Wrangler 4.149.0: all five pages returned HTTP 200 with byte-for-byte equality to their own `dist-prototype/` HTML; slashless page URLs redirected to their directory routes; all static assets matched their files; 17 excluded URLs (including actual production JavaScript assets) returned the prototype 404 page. The 21 prototype/build tests, lint, prototype build and normal production/PWA build passed. Production output still excludes prototype code, and neither application's behavior was modified. The remote Worker was not deployed or changed by this verification.
