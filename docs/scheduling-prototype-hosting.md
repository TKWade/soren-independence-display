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

## Cloudflare Pages settings

Use a **separate Pages project/origin** for the prototype, not the production app's origin or a subdirectory beneath its PWA service-worker scope. This build expects to be served at `/`.

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Root directory | Repository root (leave blank) |
| Build command | `npm run build:prototype` |
| Build output directory | `dist-prototype` |
| Build environment | `NODE_VERSION=24` |
| Application/provider environment variables | None |

These correspond to Cloudflare's [build settings](https://developers.cloudflare.com/pages/configuration/build-configuration/). No Pages Functions, Worker, Supabase bindings, OAuth settings, database migrations or secrets are required. Leave Web Analytics and other script injection disabled for this study. Publish only `dist-prototype/` if using a later, explicitly approved manual upload.

No deployment, upload, commit or push is performed by either build command. Hosting has not been deployed or verified remotely in this milestone.

## Isolation

- The normal **`npm run build` remains `tsc -b && vite build`**, producing the existing production/PWA `dist/`. Its entry/config are unchanged and do not import this host or prototype.
- The existing local `tests/browser/scheduling-main.tsx` DEV guard stays intact. Only the explicit `build:prototype` entry bundles the fictional components for static hosting; production authentication is untouched.
- The isolated config uses `envDir: false`, `envPrefix: []` and `publicDir: false`. It does not read local environment files or expose `VITE_` values. The module boundary admits only the prototype, React dependencies and an explicit list of existing presentation modules.
- Only the approved horizontal logo and favicon are copied from `public/`. Activity pictures/avatars are built-in visuals. No repository-wide public copy, real photos, APKs, keystores, signing artifacts, source maps or machine-specific files are included.
- No Supabase SDK/client, provider endpoints, API/telemetry transport, real household data or credentials are bundled. Imported appointments are in-memory fiction, with no Google connection.
- The built HTML has a content security policy with `connect-src 'none'`. Scripts/images are site-local; no external API connection is permitted. Inline styles remain allowed for timeline positioning. `_headers` adds the same policy plus frame protection for Cloudflare Pages; see [Pages custom headers](https://developers.cloudflare.com/pages/configuration/headers/).
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
