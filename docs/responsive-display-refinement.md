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
