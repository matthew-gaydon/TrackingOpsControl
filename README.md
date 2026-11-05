# TrackingOpsControl: web prototype

A working React + TypeScript prototype of the TrackingOpsControl UI: an alert-led layer over BMCC that brings in BMCA's everyday camera controls. It's ported from the "BMCC Mission Control" design canvas, and runs on sample data you can swap for real data.

## Run it (Windows, macOS or Linux)

You need **Node.js 18 or newer** (https://nodejs.org).

```bash
cd tracking-ops-control
npm install        # first time only
npm run dev        # opens http://localhost:5173
```

- Switch dataset with the **Data** menu in the header, or with `?data=healthy` in the URL.
- `npm run build` makes a static build in `dist/`, which can be served from any web server.
- `npm run typecheck` checks types without building.

## What's here

| View | What it does |
|---|---|
| **Game** | Health tiles, field panel (Combined / PitchToPlate / FullField / Biomechanics grids), pitch card, pitch timeline, live/review |
| **Cameras › Monitoring** | One list of all 30 cameras by tracking group, feeds, facts, alerts per camera |
| **Cameras › Control** | Live image with calibration and ball overlays; Image / Ball tuning / Calibration (nudge arrows, click-to-move points, refinement, antiwobble, reset); Save / Revert per camera |
| **Post-processing** | Summary, spin trend, pitch list with click / Ctrl / Shift selection, right-click reprocess, multi-pitch traffic lights |
| **Cloud processing** | Trackpac → cloud tasks, the same selection, right-click repush |
| **Everywhere** | Alert button, drawer, notifications, "Take me there" routing with banner and Back, tab badges, scroll-wheel zoom on every camera image |

## Real data

See **DATA.md**. In short, copy `public/data/demo`, replace the JSON and images, and open `?data=<name>`. Alerts are derived from raw status messages by `src/alerts/engine.ts`, not written by hand.

## Continue in Claude Code

Open this folder in Claude Code. **CLAUDE.md** gives it the architecture, the design rules and the open questions. `docs/design-brief.md` is the full design brief.
