# UI Refresh Phase 2: caregiver portal

This is a presentation-only Admin refresh. Scheduling, recurrence, Home & Sleep resolution, provider synchronization, permissions, schemas, and child layout geometry are unchanged. No migration or Edge Function deployment is required.

## Design system and shell

Admin imports the existing Phase 1 tokens. Navy supplies structure and primary actions, sky supplies navigation/status accents, neutral surfaces group forms, and gold marks review warnings. Two scoped semantic danger tokens supply accessible red text/buttons and a pale error background; there is no separate Admin brand palette. The old green Admin stylesheet has been replaced.

The caregiver header reuses DisplayBrand and adds Caregiver Portal. Household selection stays prominent; Open display and Refresh are outlined secondary actions, while Sign out is quiet. Both navigation rows remain single-line, horizontally scrollable on narrow screens, keyboard operable, and retain aria-current.

The approved logo is now `public/brand/soren-logo.png`. CaregiverHeader uses the shared DisplayBrand image component. The artwork already includes the tagline, so no separate tagline is rendered. Image errors replace the image with plain SOREN text. Favicon and square PWA icons are unchanged.

## Forms and workflows

Reusable scoped rules cover cards, subsections, info/status panels, warnings, errors, danger zones, controls and buttons. Inputs/selects/buttons have 44px minimum height; checkbox labels supply 44px touch rows. Focus outlines, disabled styling and invalid-state borders are explicit. Two-column forms become one column below 600px.

Profiles distinguish identity, mode/preferences and their existing danger zone. Standard-only controls retain their conditions. Libraries distinguish identity/child labels, photo preview, active/archive state and permanent deletion. Inactive entries remain editable. Schedule adds Basic event and Display behavior headings, retains Repeat and profile/people fieldsets, and separates deletion from Save. Home & Sleep retains its source-dependent controls and existing precedence, with a source heading and gold review panel.

Calendar connections retain all actions and read-only behavior. Each calendar now has a system-status panel with eligibility/progress/attention, last successful sync, last attempted sync, failure count and reconnect guidance. Eligibility wording deliberately does not claim that a remote scheduler has been verified. Error status uses semantic danger styling. Calendar Inbox and matching rules inherit the same forms/navigation/surface system.

DeletionDialog is a reusable presentation component used by DeleteControl; the existing preview/delete RPCs and cleanup flow remain in DeleteControl. The dialog retains dependency blocking, typed profile-name confirmation, native modal behavior and clear Cancel/Confirm actions. It has a viewport-bounded scrolling area so long dependencies remain reachable. Tests cover blocked/unblocked and matching/mismatching typed names, shared-event explanation, labels and disabled confirmation.

## Review

The development-only `/tests/browser/calendar-admin.html` fixture now exposes all real editors using fictional household data and a no-op action runner. Its deletion preview uses the real dialog with blocked fictional dependencies. No saves or provider actions are executed. A repository PNG was loaded into the local image editor; crop sliders remained 44px high and keyboard-operable, and the image preview rendered without horizontal overflow.

Browser viewport checks:

- 1440x900: shell, calendar status, controls; no horizontal page overflow or undersized primary controls.
- 1024x768: Schedule's two-column form and navigation; no page overflow.
- 768x1024: Profile mode/settings and conditional Standard controls; no page overflow.
- 412x924: scrolling navigation, calendar forms, library/image editor and deletion dialog; no page overflow. Dialog measured 380x604px with dependencies and actions visible.
- 844x390: Home & Sleep and deletion dialog; no page overflow. Dialog height was bounded to about 358px and its content scrolled to the actions.

These are browser viewport checks, not physical-device/browser-chrome certification. Live authorization, provider actions, uploads to storage and destructive operations were not performed.

Child regression checks at 1280x800 covered rolling Week, single/multiple Day events, Standard Week, Month and First/Next/Then. No page overflow occurred. Wrapped rolling cards remained 483px high, the single Sleep hero 720x295px, and multiple Day cards 330px wide with 411-413px natural heights. No child component, shared token value or child CSS was modified in Phase 2.

Validation: all 140 tests passed, including Admin navigation/presentation, safe deletion, calendar integration, scheduling and display regressions; lint and production/PWA build passed. Focused Admin tests also passed separately. There are no remaining old-green declarations in admin.css. Shared image-preview geometry in index.css remains intentionally in use; Admin overrides its surface/border colors locally. No commit or push.


## Approved logo integration

DisplayBrand uses an actual image with intrinsic 1774x887 dimensions, height:auto, max-width:100% and object-fit:contain. Alt text includes SOREN and its tagline. The supplied file is not cropped, redrawn or distorted. Its intrinsic dimensions reserve space while loading. Child logo width is clamp(150px,16vw,230px), with clamp(120px,34vw,160px) below 600px and 150px in short landscape. Admin uses clamp(120px,14vw,180px), capped to 120px on phone and short landscape.

Measured child/Admin widths: 1440 desktop 230/180px; 1280x800 205/179px; 1024 tablet 164/143px; 768 portrait 150/120px; 412 portrait 140/120px; 844x390 150/120px. All retained the full 2:1 image ratio, without header collisions or page overflow. The header accommodates the image's natural height; no fixed extra height or spacing was added. Existing header grid positions, clocks and navigation remain unchanged.

Single-event Day remained 720x295px; multi-event cards remained 330px wide and 411-413px tall at 1280x800. Standard Week/Month retained clocks and controls. First/Next/Then intentionally retains its existing header-free geometry. The fixture query `?logoFallback` deliberately requests a missing logo and verified that only SOREN text remains, with no image element/broken icon. The production PWA precaches the new PNG via the existing image glob; its manifest icons and favicon remain unchanged.
