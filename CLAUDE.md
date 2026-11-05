# CLAUDE.md: TrackingOpsControl prototype

Read this before changing anything. The full product brief is `docs/design-brief.md`, and the data contract is `DATA.md` plus `src/data/types.ts`.

## What this is
A single-venue operator UI that sits on top of BMCC (Baseball Multi-Camera Combiner). It also brings in BMCA's (Baseball Multi-Camera Analysis) everyday camera controls. **Core principle: the system finds the problem and takes the operator to it.** Every alert declares where it is fixed, and "Take me there" opens that exact place with it highlighted.

## Commands
- `npm run dev` runs the Vite dev server on :5173. `npm run build` runs a type-check and production build. `npm run typecheck` checks types only.
- `npm test` runs the Vitest unit tests (alert ledger, time parsing). Add tests next to the module (`*.test.ts`), especially for new engine rules.
- `data/` (git-ignored) holds local sample data: `*sessions*.json` feeds the launch page, `data/<sessionId>/` is that session's dataset. Served at `/local-data/` by the dev server (`vite.config.ts`). See DATA.md.
- `node scripts/make-demo-data.mjs` regenerates the `demo`, `healthy` and `long` (320-pitch) datasets.
- Verify UI changes in a browser (Playwright is fine). Check the `demo` dataset for problem states and `healthy` for the calm state.

## Architecture
```
src/data/types.ts        Data contract (dataset files). Change it deliberately and update DATA.md.
src/data/load.ts         Loads public/data/<name>/ (?data=), image path resolution; normalises every time to absolute ms.
src/data/time.ts         Time parsing: full timestamps or clock times resolved against game.now (midnight-safe).
src/data/model.ts        Pure domain logic: camera labels/health, PP task state, cloud state, strike zone.
src/alerts/engine.ts     Raw status messages + data → routed Condition[] (what is wrong now). Add rules here for new BMCC/BMCA messages.
src/alerts/ledger.ts     Conditions → alert occurrences with a lifecycle (raised → cleared → acknowledged).
src/state/launch.ts      Launch flow: placeholder sign-in (operator name in sessionStorage), open / switch session (?data=).
src/views/launch/        Sign-in page and session list (public/data/sessions.json).
src/state/store.ts       One zustand store for UI state, the alert ledger and some operator actions (acks, saves, queues, zoom).
src/state/hooks.ts       useDs / useAlertSync (runs the engine once, in App) / useAlerts / usePpOps / useCloudOps / useSession.
src/components/          Shell (header, banner, drawer, toasts), ui primitives, ZoomBox.
src/views/{game,cameras,pp,cloud}/   One folder per view.
```
- **One clock.** `clockMs()` in `store.ts` is the dataset clock, and every time on screen is UTC (`fmtClock`). Components that show a ticking time use `useNow()` (or `<AlertWhen>`). Never use `Date.now()` or local time for display.
- **Subscribe narrowly.** Components read the store with `usePick('field', …)` or a `useUi((s) => s.x)` selector, never `useUi()` with no selector: the clock ticks every second and zoom drags update the store continuously.
- **Data is read-only.** Operator actions (acknowledge, save camera settings, reprocess, repush, session change) live in the store as overlays on the dataset. When the real backend arrives, those store actions become API calls.
- Mock behaviour is in `App.tsx` (`useMockProcessing`): the reprocess queue drains one task every 2 s, and a repushed cloud task succeeds after 4 s.

## Design rules (keep these)
- Cameras are always named by tracking group: **PitchToPlate 1–6, FullField 1–8, Biomechanics 1–16**. BMCA hosts and 1–30 numbering appear only in raw messages and "Open in BMCA".
- One health model for every camera: running, full frame rate (600/600), and for P2P/FF, multicam and player tracking.
- Status is never colour-only: circle = ok, square = problem, plus text.
- Every alert needs a `route`. A notification never acknowledges; taking the fix does. Cleared alerts stay until acknowledged.
- Every engine condition needs a stable `key` (same problem → same key). Acknowledgements are per occurrence (`<key>#n`), never per key, so they can't hide a later problem. Grouped alerts list their `members` so a new member raises them again. See the lifecycle table in DATA.md.
- Any jump to another view from the pitch card goes through a "Take me there" popout first, then shows "Back to Game · Pitch N".
- Camera control changes apply live (as in BMCA). **Save** keeps them, **Revert** drops them. Each camera is tuned on its own (no copying between cameras). Nudging is off by default.
- Post-processing and Cloud use row selection (click / Ctrl / Shift), a right-click menu, and a bar with the action button and **Clear selection**. No checkboxes.
- A spin with a result whose fit error is at or over `spinFitErrorReview` shows **Needs review** (amber) and can be accepted with **Mark reviewed** or reprocessed; either removes it from the spin alert. A spin with no result is **Failed**, reprocess only.
- Trackpac result wording: **Valid** (green) / **Validation failed** (amber) / **Failed** (red, no result).
- **Views fit the window.** On a desktop window (at least 1200 × 600) no view scrolls as a page. Fixed panels stay put, and long content (camera list, pitch lists, pitch card, PP detail, control settings) scrolls inside its own panel. Use the layout classes in `styles.css` (`fit-row`, `fill`, `scroll`, `stage`, `sticky-head`) for new panels. Smaller windows fall back to a scrolling page.
- Every camera image is zoomable (`ZoomBox`: wheel zoom, drag to pan, −/%/+).
- Colours and fonts are in `src/styles.css` `:root` (IBM Plex Sans / Mono). Every numeric control uses `Stepper` (− [value] +).

## Open questions (from the brief)
- Which alerts notify versus badge only; sound for criticals; escalation if a critical sits unacknowledged.
- Thresholds (latency, TSS offset, spin fit error, dropped-frame definition) are placeholders in `game.json`.
- Whether acknowledgements sync between Main and Backup BMCC. (If they do, the ledger is the piece to move server-side.)
- Whether BMCC repeats a status message with a new start time while a problem persists. Message alerts are keyed on start time, so a repeat would raise a new alert each time.
- Control permissions: should Reset to reference and ball tuning be limited to technical operators, or locked during a LIVE game?
- Nudge units: the UI shows steps; BMCA nudges pitch/yaw.
- Transport to BMCA for control writes (for example its property-tree HTTP server).

## Good next steps
1. Feed a real dataset (see DATA.md), then add engine rules for any new message types that show up as developer messages.
2. Calibration check grid: all live images with overlays at once, to spot drift before nudging.
3. A replay clock: step `game.now` through a recorded game so pitches and messages arrive over time.
4. Replace the Combined view's placeholder player positions with tracking output.
