# Responsive display refinement

The approved single-event Day-B hero is unchanged: 720px maximum width, 44/56 two-pane anatomy where space permits, intentional stacked phone anatomy, explicit context rows and content-sized height. Browser measurements matched the previous Sleep fixture: 720×295px on desktop/tablet and about 350×409px on phone portrait.

## Multi-event Day

All statuses use the same 330px-wide card structure, 140px activity-image frame, padding and context alignment. Status color, text/icon and borders provide emphasis. Future cards reserve the same status band for image/title alignment without adding a new child-facing label. Representative School/PT/long-label/Sleep cards measured about 411–413px tall. Heights remain content-driven; no hard maximum clips long labels or several caregivers.

Exactly two cards center together. Three or more stay top-aligned in the bounded horizontal timeline with snapping. Neither the cards nor their scroll container expands to consume available screen height.

Phones up to 600px in portrait use a complete vertical list with downward arrows. Short landscape screens (500px high or less) also use the page's vertical flow, with reduced header/date spacing, 100px image frames and smaller padding. Text sizes remain unchanged. The tested multi-event cards were about 355–357px tall in short landscape. These rules explicitly exclude single-event composition.

## Week

Week's grid no longer has vertical `flex:1`, and summary rows no longer use `repeat(3, 1fr)`. Rolling Week uses `align-items: stretch; align-content: start; grid-auto-rows: auto` on its grid and `align-self: stretch` on its day cards. The tallest natural card sets the row height and siblings stretch only to that height. The grid retains `flex: 0 0 auto` and has no viewport-driven height. Activity image frames are 64px high; WITH/SLEEP image frames are 48px. Empty summaries use a small 48px minimum rather than an oversized placeholder.

At widths up to 1000px, Standard Week uses 180px minimum columns and horizontal scrolling (roughly two phone / four tablet columns visible). Rolling Week uses 140px minimum columns when narrow, preserving yesterday/TODAY/next-five ordering and existing TODAY cues. Both retain all seven days; neither adds navigation. Seven columns remain visible on the target 1280px landscape tablet.

At fixed 1280px width, increasing viewport height from 800px to 1080px produced identical rolling Week column heights: about 483px for all seven cards in the wrapped-label fixture. Standard summaries including activity times retain their earlier content-sized behavior. Taller narrow columns reflect wrapping existing times/labels, not viewport filling.

## Height/flex audit

- Root `min-h-dvh`: fills the page background only; Week and Day-B content does not flex-grow into it.
- Week image `height:100%`: applies to the image inside its explicitly bounded frame; `object-fit:contain` preserves proportions.
- `.people-summary > .picture-tile {flex:1}`: shares horizontal width among people, not vertical space.
- Remaining `1fr` values in display layout define columns, not stretched Week rows.
- Generic `.detail-panel`, `.timeline-step`, `.event-card .picture-tile` fill rules remain for the development-only Day-A fallback; Day-B overrides them.
- First/Next/Then viewport/image sizing is intentionally unchanged because its cognitive layout is out of scope.
- Empty-state `min-height:50vh` applies to no-plans messaging, not populated cards.
- Day section's clamped `3vh` top padding is bounded spacing in the approved hero; multi-event short-landscape spacing overrides it.

## Review and validation

Browser-checked single, two and four events plus both Week modes at 1280×800, 1920×1080, 768×1024, 390×844 and 844×390. No horizontal page overflow occurred. Deliberate timeline/Week scrolling remained inside their containers. The additional 1280×1080 comparison verified that Week tiles do not stretch vertically.

The local fixture uses School, PT, Sleep, long labels and a synthetic tall photo through the real photo-rendering component. Private household photos and physical-device touch gestures were not accessed; review those on the Android tablet. Fixture URL: `/tests/browser/index.html?day=2026-09-23&scenario=multi&count=4&comparison` (use count=2 for the pair). Existing single-event fixtures remain available.

No scheduling, cognitive-mode selection, normalization, data models, migrations or backend deployment changes. No commit or push.

## Targeted equal-height and final-card follow-up

The `?view=rolling&wrapped` fixture includes MRS STELTER and MOM NORTHSIDE HOME. All seven outer bottoms align at 1280×800 (483px height), 768×1024 and 412×924 (472px), and 844×390 (470px). MRS STELTER wraps to two lines at narrow widths without truncation or smaller text. Week scrolling remains internal to its horizontal strip; no horizontal document overflow was observed.

The reported portrait clipping was not reproducible before this follow-up: the local fixture already had natural list height, visible overflow, and a reachable final card. No specific clipping ancestor was identified. Existing bottom timeline padding was only 24px and was not safe-area-aware. The targeted hardening explicitly makes the multi-event mobile shell block flow, clears height ceilings on the section/composition/list, prevents card flex shrinking, and keeps overflow visible. The document owns vertical scrolling. These rules exclude the approved single-event hero.

The vertical list now has `padding-bottom: max(var(--space-6), env(safe-area-inset-bottom, 0px))`, where space-6 is 32px. At 412×924, both two- and four-event final cards were entirely visible at the page bottom, with approximately 91px of total clearance including existing page/footer spacing. The single Sleep hero remained content-sized at 372×409px. At 844×390, the 355px final card could be scrolled fully into view; the list has 32px bottom padding and no nested vertical scroller. Browser safe-area inset was zero; physical-device browser chrome/insets require device confirmation.

Four-event cards stayed about 411–413px tall at 1280×800 and 768×1024, with horizontal scrolling inside the timeline and no page overflow. Full validation passed: 139 tests, lint, production build and PWA generation. Added a focused layout regression test for natural rolling-row stretching and mobile flow/clearance.


## Tablet polish follow-up

Multi-event context uses a scoped `--context-image-size: clamp(64px, 5vw, 72px)`; phone widths at most 600px and short landscape at most 500px high use `clamp(48px, 12vw, 56px)`. At 1280x800 context frames measure 64px, at 1440px they reach 72px, at 412px they measure 49px, and at 844x390 they measure 56px. PhotoFrame's existing contain fit is preserved. Multiple caregivers share a two-column context group without horizontal overflow. Tighter secondary spacing limits growth: representative 330px-wide cards changed from 411-413px to a shared 457px natural row height. The approved single hero remains 720x295px with 44px context frames. No fixed event-card height was introduced.

### Month and Admin scrolling

No clipping ancestor or scroll interception was found in the audited html/body/#root/Admin/Month source. The local pre-change Admin fixture already had growing document height and visible overflow. Consequently a definite root cause for the reported device-preset-only failure was NOT established. The browser tool supports viewport dimensions, not Surface hardware/touch emulation; that exact preset remains a device verification item.

The explicit scroll contract now sets html height:auto/max-height:none/overflow-y:auto and body/#root height:auto/max-height:none/overflow:visible only when Admin or Month is present. Admin has min-height:100dvh, height:auto, max-height:none and visible overflow; its workspace fieldset also clears height ceilings/clipping. Month's shell uses block document flow and its grid uses natural height with visible overflow. Both add max(32px, safe-area-inset-bottom) bottom padding. No inner vertical page scroller is introduced; bounded modal scrolling remains intact. Existing cell/text sizes remain unchanged.

Month fixtures verified February 2027 (28 days, four rows), April 2026 (30 days, five rows), December 2026 (31 days, five rows), and August 2026 (31 days, six rows). At 960x1440 all final rows fit naturally. At 1024x640 the six-row month grew the document to 1085px; its last date scrolled fully into view at y=473-573, leaving about 67px below it. No horizontal page overflow or nested month scrolling occurred.

Long Admin forms at 960x1440 grew the document to approximately 2240px (expanded Profiles), 1493px (Activities), 2029px (Schedule), 2718px (Home & Sleep), and 1507px (Calendars). Their final Save/Sync controls were reachable. Schedule also passed at 768x1024 with the actual workspace fieldset structure mirrored in the fixture. These are browser viewport checks, not a claim of physical Surface certification.

### Caregiver toolbar

CaregiverToolbar is shared by Admin and the read-only fixture. Bounded Household and Display selectors, adjacent Open, and Refresh share a row down to 768px. At 412px, Household occupies its own row and Display/Open/Refresh form the next. Checks at 1440x900, 1280x800, 1024x768, 960x1440, 768x1024, 412x924 and 844x390 found no horizontal page overflow.

Display selection is local React state scoped to the household, filters to active profiles, falls back to the first active profile when necessary, and automatically selects a sole profile. Empty/loading profile lists disable Open with accessible explanatory text. Admin passes only data belonging to the currently selected household. Open preserves the existing `/?household=<id>&profile=<id>` same-tab route. The redundant links below Profile editing were removed. Fixture checks verified switching Soren/Sister, switching to a different household with Alex, and the empty-household disabled state.

Regression checks preserved the single hero, Soren's equal-height rolling columns, Standard Week, First/Next/Then, logo and clock. The enriched multi-event fixture includes two caregivers, synthetic photos and a long place label. All 142 tests passed, along with lint and the production/PWA build. No scheduling changes, migrations, deployments, commits or pushes.


## 1032x1376 clipping investigation and toolbar correction

The Open misalignment had a confirmed CSS-cascade cause: `.admin-shell a.secondary` (two classes plus an element) beat `.admin-toolbar .secondary` (two classes). Open retained `margin: 6px 8px 6px 0` and ended 6px above the selects/Refresh. Selects measured 44.8px while buttons/links measured 45.6px. The scoped `.admin-shell .admin-toolbar :is(select, button, a.secondary)` rule now resets margins and gives all controls height/min-height 48px. Existing grid end alignment is retained. Empty-profile guidance is a separate full-width toolbar row, so it cannot shift only the Display/Open group. Browser measurements confirmed matching 48px controls/bottom edges at 1032x1376, 1440x900, 1280x800, 960x1440 and intentional phone rows at 412x924.

The clipping cause remains UNCONFIRMED. The following pre-change trace is from the actual available Calendar Connections fixture at 1032x1376, not an authenticated household page. Every ancestor was inspected. Root and AuthenticatedApp are React components without DOM wrappers. The real /admin page was checked on both localhost:5173 and 127.0.0.1:5173; both required sign-in.

| Ancestor | Computed height | Min height | Max height | Overflow / Y | Position | Display | clientHeight | scrollHeight |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Final calendar form | 386.7px | 0px | none | visible / visible | static | block | 386 | 386 |
| Connection section | 616.1px | 0px | none | visible / visible | static | block | 615 | 615 |
| Calendar Connections section | 937.8px | 0px | none | visible / visible | static | block | 936 | 936 |
| Admin workspace fieldset | 1063.4px | 0px | none | visible / visible | static | block | 1063 | 1063 |
| Admin shell | 1512.44px | 1376px | none | visible / visible | static | block | 1512 | 1512 |
| #root | 1512.44px | 0px | none | visible / visible | static | block | 1512 | 1512 |
| body | 1512.44px | 0px | none | visible / visible | static | block | 1512 | 1512 |
| html | 1512.44px | 0px | none | auto / auto | static | block | 1376 | 1513 |

Here html is the sole document scrolling element. Maximum scroll was 137 CSS pixels (actual scrollY 136.8 due to subpixel rounding). After settling at the bottom, the final form occupied y=774.54..1161.24, entirely inside the 1376px viewport with about 215px below it. No ancestor clipped it. Visual viewport height also matched 1376px. This evidence cannot establish the cause of a different signed-in/device state. No further scrolling, height, or padding workaround was applied in this follow-up. Inspection of the user's reproducible affected state is required before claiming that issue fixed.

## Surface portrait fixture investigation (2026-09-30)

This follow-up used only the development Calendar Admin fixture, not authenticated Admin. No production CSS, authentication, toolbar, or child-display behavior was changed in this follow-up. The clipping root cause remains unconfirmed: no inspected ancestor terminated document flow.

The originally reported 1440px document and 816.5px workspace were reproduced with the collapsed New profile / Rolling week form. Its final Save control ended at 1107.3px, inside the viewport; zero scroll was correct for that state. Before fixture extensions, switching to Standard calendar and expanding Advanced display preferences produced document height 2279px and scrollY 839.2px, with the final Save fully visible. These are different content states, not before/after evidence of a CSS fix.

The fixture now accepts `?stress` to render six fictional calendar forms and includes an Audit document scroll button. It calls window.scrollTo at document height, then logs the full computed ancestor/editor hierarchy, viewport and document dimensions, actual scrollY, and visibility of the final workspace control. Logs are available under `Admin scroll audit` in the browser console. This diagnostic is development-only and does not save or call a backend.

All seven editors passed at all five dimensions below (35 combinations). Cells show document scrollHeight / rounded scrollY after the audit. Profiles used an existing profile, Standard calendar and expanded Advanced preferences; library editors included image controls and danger zones; Schedule used New event; Calendars used six fictional calendars.

| Editor | 960x1440 | 1440x960 | 768x1024 | 412x924 | 1920x1080 |
| --- | --- | --- | --- | --- | --- |
| Profiles | 2566 / 1126 | 2566 / 1606 | 2598 / 1574 | 2858 / 1934 | 2566 / 1486 |
| People | 1761 / 321 | 1759 / 799 | 1793 / 769 | 2252 / 1328 | 1759 / 679 |
| Places | 1862 / 422 | 1860 / 900 | 1894 / 870 | 2454 / 1530 | 1860 / 780 |
| Activities | 1760 / 320 | 1758 / 798 | 1792 / 768 | 2150 / 1226 | 1758 / 678 |
| Schedule | 2142 / 702 | 2165 / 1205 | 2174 / 1150 | 2754 / 1830 | 2165 / 1085 |
| Home & Sleep | 2778 / 1338 | 2777 / 1817 | 2834 / 1810 | 3869 / 2945 | 2777 / 1697 |
| Calendars | 3622 / 2182 | 3645 / 2685 | 3986 / 2962 | 5595 / 4671 | 3645 / 2565 |

At 960x1440, six-calendar shell/body/root heights were 3621.7px; workspace height was 3116.9px. Forms were 386.7px tall. These containers had static positioning, visible overflow, no maximum height, no containment, no content-visibility skipping, and no transforms. HTML was the document scroll owner. At maximum scroll, the complete final calendar form occupied y=839..1225.7 and its final control y=1158.1..1203.7. The diagnostic button adds some normal-flow height; it does not create a bottom spacer or nested scroller.

Full tests passed (143/143), lint passed, and production/PWA build passed. Browser checks used explicit viewport dimensions in the in-app Chromium browser, not Chrome's specific Surface device preset. To capture the still-reported failure without production authentication, open `/tests/browser/calendar-admin.html?stress` in that preset, select the affected editor, and click Audit document scroll. The resulting hierarchy and final-control bounds are needed to identify a rule in an actually clipped state. No claim that the reported device-specific bug is fixed is made.
