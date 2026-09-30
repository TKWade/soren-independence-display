# SOREN UI refresh — Phase 1

Presentation only. No scheduling, normalization, recurrence, Home & Sleep resolution, mode selection, permissions, admin workflow, database or server changes.

## Brand system and components

`src/display/tokens.css` centralizes the approved navy/blue/sky/gold palette, light surfaces, text colors, spacing, radii, shadows, borders, type hierarchy and focus treatment. `--border-strong` supplies a darker control outline. System/local fonts remain the only fonts.

`DisplayHeader` / `DisplayBrand` replace the sun badge with a replaceable text lockup. There is no synthesized logo. Standard mode shows the secondary tagline; low-navigation rolling Week uses only SOREN to avoid extra reading. Profile name, day/week/month context, preference-controlled clock and existing navigation remain available. First/Next/Then intentionally receives no new header or controls.

`DayTimelineB` uses a bounded activity image next to activity information, with `EventContextRow` showing WHERE / WITH. Existing context filtering is unchanged, including redundant portrait deduplication. Day-B additionally shows supplied sleep caregivers when WHO is enabled; other renderers retain their prior sleep-context filtering. The activity remains dominant. Existing labels stay as supplied by the normalized schedule; no domain labels are rewritten for capitalization.

## Day geometry

Removed `.day-variant-b .event-card { height: 100%; }`. Cards now explicitly use `height: auto; min-height: 0`, and the timeline uses `align-items: flex-start`. The semantic Day section has no outer border/background and does not flex to fill the viewport. A centered 1160px composition wrapper contains a compact content-width date/TODAY row and the timeline. Empty space belongs to the open page, not a giant panel. There is deliberately no hard card max-height that could clip long labels or multiple people.

- One event: centered 720px-wide card (capped by available width), 220px-high primary image on larger screens. Measured approximately 295px card height for the sample current activity across landscape viewports.
- Two events: the pair is centered as a group with balanced widths up to 470px each and arrows. Widths shrink together on smaller tablets; below 290px per card the timeline scrolls internally. Auto margins avoid clipping the first item when overflowing.
- Many events: later/completed cards use 250px bases and 150px images; current/next remain prominent. DOM order and status selection stay chronological and unchanged. Overflow stays within the existing timeline scroll container, including crowded tablet timelines.
- Cards narrower than 440px deliberately stack STATUS / IMAGE / INFORMATION. Wider cards use two panes, including tablet portrait and phone landscape. Single cards use available padded width; pairs retain internal scrolling. Stacked images are bounded at 170px.

Context images are 44px, with one WHERE/WITH heading per role and readable labels. Multiple caregivers share a wrapping visual row. NOW uses a play icon and navy-on-gold; NEXT uses an arrow and sky; completed events retain a check/DONE label and readable text without reducing text opacity. Future cards remain neutral.

## Week / Month / simplified modes

Week uses lighter borders/shadows, white surfaces, navy text, sky current-day highlighting and gold TODAY. Standard activity summaries retain their data and ordering. Month keeps seven columns; times stack on constrained widths and labels wrap instead of spilling horizontally. Existing Week scrolling on narrow screens remains. Rolling yesterday/today positioning is unchanged; yesterday is subdued without fading text. First/Next/Then keeps its existing structure, with gold immediate and blue secondary treatments.

## Accessibility and validation

Focus rings use dark navy with an offset. Timeline scrolling is keyboard-focusable. Existing return-focus handling, screen-reader labels, decorative-image alternatives and reduced-motion preferences remain. Context/state meaning is not communicated by color alone. Images retain `object-fit: contain`; portrait dimensions cannot stretch cards.

Browser geometry checks covered 1280x800, 1366x768, 1920x1080, 1024x768 and 390x844. Single/two/six-event Days, Standard Week/Month, rolling Week and First/Next/Then were exercised. No page-level horizontal overflow was observed. Clock/header/back control bounds did not overlap. Month → Day → Month restored keyboard focus to the selected date. Narrow Month can grow vertically with long titles; dense Day timelines scroll horizontally inside their panel.

Manual follow-up: inspect real photos and unusually long labels at these sizes, confirm comfortable touch scrolling on the Android tablet, test multiple caregivers inside one event, clock on/off, Day times on/off, reduced motion and keyboard focus. Check current and next cards when many completed events precede them.

The local-only fixture contains synthetic images, makes no backend calls, and supports:

- `/tests/browser/index.html?day=2026-09-23&count=1&comparison`
- `/tests/browser/index.html?day=2026-09-23&count=2&comparison`
- `/tests/browser/index.html?day=2026-09-23&comparison`
- `/tests/browser/index.html?view=week`
- `/tests/browser/index.html?view=month`
- `/tests/browser/index.html?view=rolling`
- `/tests/browser/index.html?view=sequence`

Child-facing presentation CSS has no remaining hardcoded legacy color hex values outside the token definitions. Existing illustrative SVG palette colors in `Picture.tsx` remain to preserve recognizable pictures; existing PWA icon assets are unchanged. Admin-only image-editor/repeat-preview colors and admin status colors remain outside this display refresh.

No migration or Edge Function deployment is required. Publish the frontend/PWA normally after approval. Nothing is committed or pushed by this milestone.

### Day composition refinement

Single-event image/content columns now use a 44/56 ratio on larger screens. A surface-muted information pane groups title, optional time, WHERE and WITH, with centered vertical alignment when content is sparse. Three or more events retain chronological left-to-right scrolling, with no independent centering of the first event. The list remains keyboard-focusable and status/context logic is unchanged.

Browser measurements after refinement: single cards in the earlier outer-composition pass were 800 × 289px and centered at 1920×1080, 1366×768, 1280×800 and 1024×768. At 390×844, the card used about 350px of padded width and was 359px tall. Pairs were centered and balanced on all four larger sizes, shrinking to about 468px each at 1024px. Phone pairs scrolled inside the timeline. Single/pair/six-event checks found no page-level horizontal overflow. Date/TODAY stayed together in a roughly 265px content-width row rather than spanning the viewport.

### Internal card refinement review

The current hero cap is 720px; no outer page composition was redesigned. The status banner connects edge-to-edge with the card. Card-width container queries switch the entire anatomy at 440px rather than allowing context to wrap below a side-by-side title incidentally. Time remains governed solely by `showTimes`. Context exists only within the information pane, without tiny bordered chips or a heavy nested card.

Browser-reviewed title-only, WHERE-only, WITH-only, Sleep with WHERE, Sleep with WHERE/WITH, timed activity, long place name, and two-caregiver cases. The five viewport sizes were 1920×1080, 1280×800, 768×1024, 390×844 and 844×390. No page or context-label horizontal overflow was observed. Desktop/tablet/phone-landscape cards used two panes; phone portrait stacked. Sleep-WHERE measured about 720×295px in landscape and 350×409px in portrait. Adding a second caregiver kept the grouped row at the same height as one caregiver in the tested samples.

Append `&scenario=sleep-where`, `sleep-with`, `activity-time`, `long-place`, `two-caregivers`, `title-only`, or `with-only` to the Day fixture URL to review these synthetic examples. No backend data is written.
