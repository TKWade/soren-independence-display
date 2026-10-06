# Amazon Fire / Amazon Kids fictional packaging test

Status: feasibility scaffold, **not a production app or a verified Amazon Kids installation**.
Package: `com.soren.display.demo`; launcher label: **SOREN Demo**; current versionCode 2.
Do not upload or submit this package without explicit approval.

## Corrected icon integration — October 2, 2026

The new **unsigned** release is
`native/fire-demo/artifacts/20261002-icons-v2/soren-demo-icons-v2-unsigned.apk`.
VersionName remains 1.0; versionCode is 2, distinguishing it from the previous
signed versionCode 1 package. The current LAT draft has not been inspected or
changed. When replacement is approved, sign this build with the existing release
identity using fresh output paths before replacing the draft binary. Do not
upload this unsigned artifact. No signing credentials were accessed in this task.

The previous signed APK and its idsig are preserved outside Gradle's build tree:
`native/fire-demo/artifacts/preserved-signed-v1/soren-demo-release.apk`.
The archive is ignored by Git. SHA-256 of that unchanged signed APK:
`4CB23AE5671222D89B1217406C10F40E8EAEFA48584CDF1CA9CC96052DD03C45`.
SHA-256 of the new unsigned APK:
`1E5A82CF9542942E225D5B3DA8AF4105737F891AC86D1ACA3AF2EF03DAA0BD0C`.

Supplied artwork was inspected and left unchanged:

| File in public/icons | Actual dimensions | Transparency |
| --- | --- | --- |
| soren-app-icon-1024.png | 1024 × 1024 | RGBA, transparent pixels |
| icon-192.png | 192 × 192 | RGBA, transparent pixels |
| icon-512.png | 512 × 512 | RGBA, transparent pixels |
| maskable-512.png | 512 × 512 | RGB, fully opaque |

The existing PWA manifest already references 192/512 as `any` and maskable-512
as `maskable`. Production copies match the supplied PNGs byte-for-byte. The
horizontal SOREN header logo remains unchanged.

`native/fire-demo/tools/prepare-icons.py` (Python with Pillow) resizes the supplied
1024 artwork into legacy icons, and uses the supplied maskable artwork for round
and adaptive icons. Run `python native/fire-demo/tools/prepare-icons.py` to repeat.
Legacy and round sizes for mdpi through xxxhdpi: 48, 72, 96, 144, 192 px. Adaptive
layers: 108, 162, 216, 324, 432 px. The supplied maskable image occupies the central
72dp viewport; only background edge pixels extend into the 18dp overscan margins.
The adaptive background fallback is #064786. Existing manifest and adaptive XML
references remain intact. No artwork or mark proportions were redesigned.

Preview: `native/fire-demo/android/app/build/icon-review/launcher-masks.png`.
Circle and rounded-square previews retain the S, sun and path without clipping
or distortion. Actual launcher rendering of the updated icon remains a device
test; nothing was installed. All 15 compiled PNGs match source visible pixels and
alpha (AAPT may clear invisible RGB values at zero alpha).

Build: `npm run sync --prefix native/fire-demo`, then from
`native/fire-demo/android`, `./gradlew.bat --no-daemon --console=plain :app:assembleRelease`,
using the documented process-local JDK 21/SDK setup. Release compilation and
lintVitalRelease passed. The unsigned verifier passed alignment, non-debuggable
status, package/version/SDK checks, unchanged permissions and exact fictional
web-asset equality. Only its expected versionCode changed to 2; its protections
were not relaxed. Full existing suite: 168 passed; two new icon tests passed;
lint and production/PWA build passed. Dependencies, SDK levels and authentication
are unchanged.

The version 1 preparation/signing notes below are historical. Do not overwrite
the archived version 1 APK or create another key; use distinct version 2 paths
for any later, explicitly authorized local signing.

## Approach and isolation

Capacitor 8.4.3 wraps locally bundled React assets in the standard Android WebView.
This is smaller to maintain than a second native UI or schedule implementation.
The separate entry imports the existing DisplayRenderer, mockWeek fixture, built-in
pictures and clock. It starts directly in rolling Week; tapping a day uses Day-B.
The visible profile name is Demo. Fixture names, places and schedules are fictional.
Dates follow the device clock/timezone, including rolling across week boundaries.

Production Root/App, login, household repository and Supabase are not entry points.
The build rejects production auth/admin/device/repository/Supabase modules.
It does not load .env files or copy the general public directory; only the approved
brand image is explicitly included. The native package has no service worker,
remote server URL, account configuration, analytics, native plugins, purchases,
camera, microphone or location permissions. CSP denies connections and form
submission. Android INTERNET permission and unused FileProvider are removed.
No authentication or hosted configuration has changed.

The launcher uses the supplied blue SOREN artwork in native density-specific
resources, with the SOREN Demo label. The horizontal approved logo remains
inside the display. No kiosk, lock-task, immersive
mode, custom launcher, orientation lock or Back override is added. Verify system
Home/Back and parental exits on the device.

## Local prerequisites and compatibility

- Install root dependencies with `npm ci`; Node 22.12+ (Node 24 LTS recommended).
- Install Android Studio Otter 2025.2.1 or newer, JDK 21, Android SDK Platform 36,
  SDK Build Tools and Platform Tools. Set JAVA_HOME to JDK 21 and configure the
  SDK path in ignored android/local.properties, or use Android Studio's SDK setup.
- Gradle wrapper 8.14.3 and Android Gradle Plugin 8.13.0 are checked in.
  Initial Gradle dependency downloads require internet on the build machine.
- Native minSdk is 24 (Android 7); target/compile SDK 36. Fire OS 5/API 22 is excluded.
  Fire OS 6/7/8 API compatibility alone does **not** establish WebView compatibility.
- Shared Tailwind 4 CSS targets modern Chromium (Chrome 111+ baseline). The demo
  JS target is chrome111. Test the actual Amazon WebView version and modern CSS
  rendering on the exact model; Silk's version alone is not sufficient. Older
  WebViews may need a separately scoped compatibility effort. Do not install Play
  or sideload a replacement WebView to work around a failure.
- No Google Play Services runtime dependency. Google's Maven repository supplies
  Android build dependencies; it does not require Google Play on the tablet.

References: [Capacitor setup](https://capacitorjs.com/docs/getting-started/environment-setup),
[Fire OS 8](https://developer.amazon.com/docs/fire-tablets/fire-os-8.html),
[device specifications](https://www.developer.amazon.com/docs/device-specs/ft-identify-tablet-devices.html),
[Tailwind browser support](https://tailwindcss.com/docs/compatibility).

## Build and signing (PowerShell, repository root)

```powershell
npm ci
npm ci --prefix native/fire-demo
npm run sync --prefix native/fire-demo
.\native\fire-demo\android\gradlew.bat -p native/fire-demo/android assembleDebug
```

Debug output: native/fire-demo/android/app/build/outputs/apk/debug/app-debug.apk.
A debug APK is only a development artifact, not evidence of Kids eligibility.
For a local browser inspection of the exact bundled assets:

```powershell
npx vite preview --config native/fire-demo/vite.config.ts --host 127.0.0.1 --port 4174
```

For a release candidate, run sync again, then `npm run open --prefix native/fire-demo`.
In Android Studio choose Build > Generate Signed App Bundle or APK > APK > app.
Create/select a dedicated demo signing keystore **outside the repository** (for
example a protected user signing directory). Enter passwords through Studio;
do not put them in source, shell history, Gradle files or .env. Back up the key
securely; updates need the same signing identity. Choose release and a private
output directory. Do not enable automatic publishing.
Verify the result with SDK Build Tools `apksigner verify --verbose <release.apk>`.
Inspect the merged release manifest for unexpected permissions and the APK assets
for only fictional content. Record its SHA-256 with Get-FileHash. Increment
versionCode for each subsequent test upload. Generated bundles, APKs, SDK paths,
keystores and signing properties are ignored. Never force-add them.

## Personal-information restriction and eligibility gate

This test must not collect, request, transmit or display real personal information:
no real names, household schedules, addresses, photos, account login or identifiers.
Do not enable the real repository after a successful demo test.

Treat personal-information collection restrictions in the Appstore submission/
child-profile flow as a release gate. Answer privacy/content-rating questions
truthfully for this **demo binary**, not the production web service. If Amazon
flags collection or the app is unavailable for sharing, stop and resolve eligibility
with Amazon; do not change parental controls or misrepresent collection.

Amazon's [LAT guide](https://developer.amazon.com/docs/app-testing/live-app-testing-getting-started.html)
explicitly says LAT submissions collecting personal information are not accepted.
This corrects the earlier uncertainty: it is a LAT-specific restriction, not
proof of a universal Kids sharing rule. Keep this binary fictional and offline.
Kids eligibility and future real-data deployment remain separate gates.

## Exact Amazon Kids test path — only after upload approval

1. Record actual tablet model/generation, Fire OS build, Amazon WebView version,
   marketplace, orientation and screen size. Keep the existing child profile.
2. Build and sign the release APK above. Verify the artifact, permissions and
   fictional-only content. Do not supply real household data for review.
3. After explicit approval, in Amazon Developer Console > My Apps, create/select
   the separate SOREN Demo app > Live App Testing > Create a new Live App Test.
   Upload that signed APK; complete device targeting, content/privacy and required
   listing fields honestly. Select compatible Fire tablets; do not claim all models.
4. Invite the **parent Amazon account registered to the tablet**. Submit LAT only
   after approval. LAT distribution is external publication to selected testers.
5. Parent accepts the invitation using that same account, obtains the test app
   from the linked Amazon listing and downloads it on the tablet's adult profile.
   If absent, verify account, invitation acceptance, device targeting and Sync
   Amazon Content. Do not substitute a browser bookmark or ADB child-profile bypass.
6. From the adult profile: Amazon Kids > existing child's settings (gear) >
   Manage Content > Amazon Content > Apps/Games > SOREN Demo > Done.
   Labels vary by Fire OS. Amazon's older LAT guide calls this Add Content > Share
   Content > Games & Apps. **Do not enable in-app purchases**; this demo has none.
7. Enter the child profile. Confirm an identifiable SOREN Demo tile actually
   appears, launches directly into the fictional Week and can reopen after exit.
   If it cannot be shared, record the exact message and stop. Do not root, install
   Google Play, replace launchers or relax parental controls.
8. Test all seven days, Day-B and WEEK return; no blank pictures, clipped cards or
   permission prompts. Test airplane-mode cold launch, portrait/landscape, Home,
   Back, parent exit, sleep/wake and reboot. Confirm no login or real-data path.
9. Record pass/fail, model/OS/WebView, versionCode, APK hash and screenshots.
   Success means **that exact device/profile** passed; it does not prove general
   eligibility or approval for a later connected app.

Amazon documents LAT delivery and child-profile sharing in its
[LAT integration-test guide](https://developer.amazon.com/docs/in-app-purchasing/test-pending-purchases.html#set-up-a-live-integration-test).
Only its delivery/sharing steps apply here; we do not implement or test purchases.
[Amazon's Fire FAQ](https://developer.amazon.com/docs/fire-tablets/ft-faq.html)
distinguishes parent-selected Kids apps from curated Kids+.

## Initial local results — 2026-10-01 (superseded by debug build below)

- Existing full suite: 166 passed; two additional packaging boundary tests passed.
- Lint and existing production/PWA build passed.
- Demo TypeScript/Vite build and Capacitor Android sync passed.
- Pinned Capacitor dependency install: zero npm audit findings.
- Browser preview at 1280x720 renders all seven columns, opens Day-B and returns
  to Week; no browser console errors. Explicit Tailwind source scanning preserves
  shared utilities in the separate build root.
- assembleDebug blocked before compilation: JAVA_HOME unset, java unavailable.
  Android SDK/Android Studio were not found in standard local installation paths.
  **No APK, signing, native runtime validation or child-profile installation has
  been completed.** No Amazon upload, migration, deployment or hosted change.

## Debug build continuation

Keep the pinned Capacitor, Gradle and Android plugin versions. Android Studio's
bundled JDK may be newer than the project requires: select JDK 21 explicitly.
Use process-local JAVA_HOME and ANDROID_HOME; do not change system-wide Java.

From native/fire-demo/android, after running the existing npm sync script:

```powershell
$env:JAVA_HOME = '<JDK 21 installation directory>'
$env:ANDROID_HOME = '<installed Android SDK directory>'
# Optional Windows IPC workaround if Gradle reports an invalid-argument
# UnixDomainSockets.connect failure. This directory is ignored by Git.
$demoSocketDir = Join-Path (Resolve-Path ../../..).Path 'node_modules/.tmp'
New-Item -ItemType Directory -Force $demoSocketDir | Out-Null
$env:JAVA_TOOL_OPTIONS = "-Djdk.net.unixdomain.tmpdir=$demoSocketDir"
.\gradlew.bat --no-daemon --console=plain assembleDebug
```

The workaround changes only Java's temporary socket location for this process
and its children. It does not change firewall settings or app permissions.
A normal Android debug build uses a development debug signing identity; do not
create a release signing key or use the debug APK as a release submission.

### Verified debug APK result

The continuation built successfully in 6m 57s (93 Gradle tasks). Actual tools:
Microsoft OpenJDK 21.0.12.1+1-LTS (portable temporary installation), Gradle 8.14.3,
AGP 8.13.0, SDK Platform 36 revision 2, Build-Tools **35.0.0**, and Platform-Tools
37.0.1. Studio bundled JDK 25 was not used. Build-Tools 36.0.0 was already present;
the pinned plugin selected and installed its default 35.0.0 under the SDK's
existing accepted license. No tool versions or minSdk were changed.

Run npm run sync --prefix native/fire-demo from the repository root, then the
process-local Gradle command above from native/fire-demo/android.

Output: native/fire-demo/android/app/build/outputs/apk/debug/app-debug.apk
(4,658,863 bytes). SHA-256:
DF3DD51FC9032AF6876FA235405975F6D73B1FA80DF6A078E1FB17383E1F7344

SDK aapt verified label SOREN Demo, application ID com.soren.display.demo,
versionCode 1, minSdk 24, target/compile SDK 36. apksigner verified the Android
Debug certificate and APK v2 signature. Only AndroidX's app-specific signature
permission DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION is requested. There are no
network, camera, microphone, location or billing permissions. The public assets
match the fictional web bundle byte-for-byte; credential-pattern checks found
no secrets, JWTs, Supabase endpoints, environment files or signing keys. The
native plugin list is empty. Both packaging tests pass. Production auth and
application source were not changed in this continuation.

Non-fatal warnings: flatDir repositories from the Capacitor template, SDK XML
metadata version mismatch, and unchecked operations in dependency Java code.
No compilation error remains. Fire WebView rendering, navigation and Amazon Kids
availability are still untested on hardware. No release signing key was created;
no device installation, upload, deployment, hosted change, commit or push occurred.
The JDK lives in temporary storage; reselect/provision JDK 21 if it is cleaned up.


## Actual Fire HD 10 result (user-confirmed)

Adult-profile launch, Week/Day navigation, general rendering and touch passed.
The sideloaded demo is NOT offered for sharing into Amazon Kids. Amazon-installed
LAT availability in the existing Kids profile remains **unverified**.
Portrait refinements are a separate follow-up. Model generation, Fire OS and
WebView versions have not yet been recorded.

## Release signing handoff — local input required

Release explicitly sets debuggable false. Label SOREN Demo, application ID
com.soren.display.demo, versionName 1.0, versionCode 1, minSdk 24 and targetSdk 36
are unchanged. Dependencies are unchanged. No release key or password has been
created or accessed by the agent. Do not upload unsigned or debug APKs.

Use a **local PowerShell 7 terminal**, not chat or an agent terminal. Stop any
terminal recording/transcription before password entry. Set JAVA_HOME to JDK 21
and ANDROID_HOME to your installed SDK; run from the repository root.
For the installations used here (these variables affect this terminal only):

    $env:JAVA_HOME = Join-Path $env:LOCALAPPDATA 'Temp/soren-demo-jdk21/jdk-21.0.12.1+1'
    $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk'
    if (-not (Test-Path "$env:JAVA_HOME/bin/keytool.exe")) { throw 'Locate JDK 21 before continuing' }
    if (-not (Test-Path "$env:ANDROID_HOME/build-tools/35.0.0/apksigner.bat")) { throw 'Locate SDK Build-Tools 35.0.0 before continuing' }

Create a dedicated key only if you do not already have a SOREN Demo release key.
This guard refuses to overwrite an existing path. If it exists, stop creation
and verify ownership/alias locally before reusing it. Back up the key securely.

    $demoKeyDir = Join-Path $env:USERPROFILE 'SorenSigning'
    $demoKey = Join-Path $demoKeyDir 'soren-demo-release.jks'
    New-Item -ItemType Directory -Force $demoKeyDir | Out-Null
    if (Test-Path -LiteralPath $demoKey) { throw 'Existing key: stop; never overwrite' }
    & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore $demoKey -storetype JKS -alias soren-demo -keyalg RSA -keysize 3072 -validity 10000
    if ($LASTEXITCODE -ne 0) { throw 'Key creation failed' }

Passwords are entered only into keytool's local prompts. Use publisher identity
for certificate fields, never child information. Never add password flags/values
to commands, logs, source, Gradle properties, environment files or chat.

Align and sign the already-built release APK. Do not overwrite previous output:

    $demoTools = Join-Path $env:ANDROID_HOME 'build-tools/35.0.0'
    $demoOut = Join-Path (Get-Location) 'native/fire-demo/android/app/build/outputs/apk/release'
    $unsigned = Join-Path $demoOut 'app-release-unsigned.apk'
    $aligned = Join-Path $demoOut 'soren-demo-release-aligned.apk'
    $signed = Join-Path $demoOut 'soren-demo-release.apk'
    if ((Test-Path $aligned) -or (Test-Path $signed)) { throw 'Output exists; choose fresh paths' }
    & "$demoTools/zipalign.exe" -P 16 4 $unsigned $aligned
    if ($LASTEXITCODE -ne 0) { throw 'Alignment failed' }
    & "$demoTools/apksigner.bat" sign --ks $demoKey --ks-key-alias soren-demo --out $signed $aligned
    if ($LASTEXITCODE -ne 0) { throw 'Signing failed' }
    ./native/fire-demo/verify-release.ps1 -Apk $signed -SdkDirectory $env:ANDROID_HOME

Apksigner obtains passwords through local interactive input, with no password
arguments. Verification checks signature, alignment, identity/version/SDKs,
debugging, permissions, plugin list, asset equality and credential patterns.
It prints the SHA-256. Do not use -Unsigned for final acceptance. Do not rebuild
web assets between signing and verification. Compare the signer certificate
locally against your intended release key; it must not be CN=Android Debug.
Only report completion and the APK path; never send passwords or the keystore.

## Short LAT checklist (upload/submission remains unauthorized)

- Signed output after local steps:
  native/fire-demo/android/app/build/outputs/apk/release/soren-demo-release.apk.
  Current preparation artifact in that directory: app-release-unsigned.apk.
- Icon candidate: public/icons/icon-512.png (corrected 512x512 SOREN artwork).
  The horizontal logo is unsuitable. It is a 512x512 RGBA PNG with an alpha channel, matching the required large-icon
  dimensions and PNG format. Review its appearance in the console before submission. A 114x114 export is
  missing for standard submission; LAT omits the small-icon field.
- Suggested description: "SOREN Demo is an offline visual-calendar demonstration
  with fictional schedules and built-in illustrations. View seven days and tap
  a day for an activity timeline. No login, personal calendar connection,
  purchases or personal-data collection."
- Select the tested Fire HD 10 generation after recording model/OS details.
  Do not select all Fire tablets or Fire TV. API compatibility does not guarantee
  WebView compatibility. Portrait polish remains a separate follow-up.
- Invite the parent Amazon account registered to the tablet, using its actual
  marketplace. Do not create a child tester account.
- Before Amazon installation, parent uninstalls sideloaded SOREN Demo via normal
  Fire settings. The same package ID has a different signature; do not update
  over the debug build. Only fictional data is removed. Agent has not uninstalled
  or installed anything.
- After approved LAT distribution: accept parent invitation, install from Amazon,
  then test Amazon Kids > child settings > Manage Content > Amazon Content.
  Record whether the tile is actually shareable and launches in the child profile.
- Complete content rating/export compliance truthfully. Keep fictional-only data.
  Do not claim Kids approval, Kids+ inclusion or medical benefit.

Sources: [LAT requirements](https://developer.amazon.com/docs/app-testing/live-app-testing-getting-started.html),
[tablet icons](https://developer.amazon.com/docs/app-submission/appstore-details.html#tablet-assets),
[interactive Android signing](https://developer.android.com/build/building-cmdline).


### Release preparation checks completed

- Release build passed (3m 27s), including Android lintVitalRelease.
- Unsigned release alignment and package checks passed: non-debuggable,
  SOREN Demo, com.soren.display.demo, version 1 / 1.0, SDK 24/36.
- Expected fictional web assets matched; only framework bridge files and generated
  Android baseline profiles accompany them. No new permissions or native plugins.
- Verifier negative checks reject both a debug signer and a debuggable APK.
- Full web/database suite: 168 passed; lint and production/PWA build passed.
- Unsigned APK SHA-256:
  52EDE81C86888CC625F5332A2E943A779AED07FD3E7F6D6678A7A3E7DE9AA064
- **Pending:** local secure password entry, release signature, final signed-APK
  verification/hash, and (only after separate approval) LAT upload/installation.
