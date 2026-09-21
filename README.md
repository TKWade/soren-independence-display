# Soren’s Calendar

An image-first React + TypeScript + Vite calendar for a landscape Android tablet. Tailwind CSS is integrated through its Vite plugin. All schedule data and illustrations are local mocks; there are no backend services or accounts.

## Run

Requires Node.js 22.12+ (developed with Node 24).

```sh
npm ci
npm run dev -- --host 0.0.0.0
npm run lint
npm run build
npm run preview -- --host 0.0.0.0
```

The development server defaults to http://localhost:5173. A tablet on the same Wi-Fi can open the Network URL printed by Vite, subject to the computer’s firewall.

## Interface

- Seven Monday–Sunday columns with large, full-column touch targets.
- A green outline and sun/TODAY badge mark the current local date.
- Every day has the same activity, person, and sleep slots.
- Tap a day for its visual event timeline; tap WEEK to return. Keyboard Enter/Space opens a day and Escape returns, with focus restored.
- Dates refresh after midnight and when the tablet wakes. The illustrative weekly routine repeats; it is not Soren’s real schedule.
- Designed for landscape viewports of 1024 pixels and wider. Narrow screens retain a horizontally scrollable week and scroll the timeline within its own region.

## Project structure

- `src/types/calendar.ts`: UI data contracts, including an optional photo URL.
- `src/data/mockWeek.ts`: reusable mock people, places, activities, and weekly events.
- `src/components/`: reusable day cards, picture tiles, vector illustrations, and today badge.
- `src/hooks/useToday.ts`: live local clock and resume handling.
- `src/App.tsx`: week/detail navigation.
- `src/index.css`: Tailwind import and tablet layout/theme.
- `public/icons/`: installable PWA PNG icons, including a maskable icon.

To add real data later, supply `DaySchedule` records to the existing components. `PictureItem.photoUrl` replaces the illustration, falling back if the image fails. New photos will need their own offline caching policy. No data edits or persistence are implemented yet.

## PWA

`vite-plugin-pwa` generates the manifest, registration script, and service worker during production builds. The app shell and bundled pictures are precached for offline use after the first successful online load. The manifest requests standalone display and landscape orientation. Updates install automatically.

Use `npm run build` then `npm run preview` to inspect the production version at http://localhost:4173. Service workers are deliberately disabled in development. Android installation and offline operation require HTTPS on a deployed origin; plain HTTP over the Wi-Fi IP is only suitable for checking the development UI. On Android Chrome, open the HTTPS site and choose Install app / Add to Home screen. Orientation behavior ultimately depends on the browser/device.

## Validation

Lint and TypeScript/production build are required checks. Browser smoke checks cover seven-day layout, TODAY, detail navigation, and keyboard focus. Before mounting the tablet, verify its actual display scaling, touch comfort, installation, and offline reload on the final HTTPS origin.

Configuration references: [Tailwind Vite setup](https://tailwindcss.com/docs/installation/using-vite) and [Vite PWA guide](https://vite-pwa-org.netlify.app/guide/).

## v0.1 schedule model and timeline

`Person`, `Place`, `Activity`, `CalendarEvent`, and `DaySchedule` are the reusable contracts in `src/types/calendar.ts`. Events carry timestamps, a short label, an activity, any number of people, a place, a picture, and an optional sleep destination. A day references its primary event for the simple Week summary. No fields depend on a particular child or parent.

`src/data/mockWeek.ts` supplies the current Monday–Sunday sample week. Wednesday includes school, pickup, swimming, home, dinner, and sleep. Dad’s and Mom’s homes are separate Place records with distinct picture IDs and portrait cues, ready for different local photos later.

`src/lib/schedule.ts` owns chronological sorting, Week summaries, local date labels, and NOW/NEXT calculations. End times are exclusive; a missing end extends to the next event or midnight. A gap has no NOW and points to the upcoming event as NEXT. The final sleep destination remains current through that night. Different dates never get a false NOW. Overlaps prefer the most recently started active event. The clock refreshes every 15 seconds and on resume/focus.

`DayTimeline` presents every event in order with arrows. NOW has a play symbol and heavy outline; NEXT has an arrow and dashed outline; past events have checkmarks and subdued pictures. Tapping the whole event reveals person/place pictures below the sequence. The single WEEK button returns to the overview; Escape also returns with focus restored.

Run `npm test` for pure schedule-logic tests (Node 22.18+ or 24 recommended for native TypeScript stripping). Browser checks cover Week and the six-event Day at 1280×800, 1024×640, and 960×600: all seven days and all six events fit without page-level horizontal scrolling. Production Android installation/offline checks still require the final HTTPS origin.
