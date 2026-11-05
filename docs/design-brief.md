# TrackingOpsControl — design brief (v8.1: alert-led, linked detail, camera control)

Mockup canvas: "BMCC Mission Control" (app name: TrackingOpsControl). One interactive prototype with four views (Game, Cameras, Post-processing, Cloud processing) sharing a single alert system. The Cameras view has two sub-tabs: Monitoring and Control.

## The key principle
**The system finds the problem and takes the operator to it.**

Today's UI is crowded because nothing is proactive. If there's an issue you must *see* it to act on it, so every indicator has to be on screen at once.

In the new UI:
1. A problem appears and the system raises an alert.
2. The alert reaches the operator wherever they are.
3. Clicking the alert opens the exact place where it's fixed, with that spot highlighted and the steps to fix it.

That frees each view to show only what it's for. The new UI is a layer on top of BMCC that reads its information, so it doesn't have to mirror how BMCC is split up internally. From v8 it also writes back to BMCA for the most-used camera controls, so operators no longer have to open each camera's BMCA instance.

## Cameras: named by tracking group, one health model
Operators think in tracking groups, not BMCA hosts or camera numbers 1–30. Every view uses:
- **PitchToPlate 1–6** (P2P, field marker "P1"–"P6")
- **FullField 1–8** (FF, markers "F1"–"F8")
- **Biomechanics 1–16** (BIO): the cameras BMCC calls "monitored cameras"

**Camera mapping (confirmed):**
- BMCC tracking cameras 1–6 → PitchToPlate 1–6
- BMCC tracking cameras 7–14 → FullField 1–8
- Monitored cameras → Biomechanics 1–16, in BMCC's list order (BMCA15 Camera 15 = Biomechanics 1 … BMCA28 = Biomechanics 16)

So "Cameras:: 6 Missing…" = PitchToPlate 6, player tracking "not done on 5" = PitchToPlate 5, BMCA27 = Biomechanics 15. The original BMCC message is still shown word for word inside each alert. The BMCA host appears only as a "Capture host" detail on the camera and in the Open in BMCA link.

**Health model, same for every camera:** is it running, and is it at full frame rate (600/600)?
- States: running at full rate (ok) / below full rate (warn) / not running (crit).
- Same alerts for all cameras: "[Group N] not running" (CRIT) and "cameras below full frame rate" (WARN).
- PitchToPlate and FullField cameras add tracking metrics: multicam frames, player tracking, strike zone Δ. Biomechanics cameras do no live tracking, so they show none.

**Cameras view:** one list of all 30 cameras with a P2P / FF / BIO tag, problems sorted to the top. Filters: All / Problems / PitchToPlate / FullField / Biomechanics. The list and the selected camera are shared by both sub-tabs (Monitoring and Control).

## How alerts reach the operator (on every view)
- **Alert button** (header, top right): "N need action", coloured by the worst open severity. It pulses while an uncleared critical is open, and turns green "All clear" when nothing is open. Opens the alert drawer.
- **Ambient strip**: a thin red line across the top while any uncleared critical is open.
- **Tab badges**: Game / Cameras / Post-processing each show a count of open alerts fixed in that view.
- **Notifications** (bottom right): pop up with **Take me there**, plus a direct fix when there is one (e.g. **Go in session**). Hiding one never acknowledges the alert.
- **Health tiles** on Game, each a link to its problem: Cameras (all 30), Live tracking, Post-processing, Data & timing.

## What "Take me there" does
- Switches to the view where the alert is fixed and selects the right thing:
  - Cameras: the camera, the sub-tab (Monitoring, or Control plus the control tab), its feed, and the Problems filter for multi-camera alerts.
  - Post-processing: the right filter and pitch.
  - Header: the session or redundancy control.
- Highlights the target and shows an **"arrived from alert" banner** with summary, checks, **Acknowledge**, any fix, and **Back to [where you were]**.

## Everything is linked (pitch card → detail)
Every problem on the Game pitch card is clickable. Clicking opens a small **"Take me there"** popout first, so a stray click never changes view. Confirming jumps to the exact place:
- Post-processing task not OK (e.g. pitch 16 Trackpac "Needs review") → Post-processing, with that pitch selected and that task outlined. There the operator can **Mark reviewed** or reprocess, and **View pitch in Game** goes back.
- Strike-zone problem camera (no data or out of tolerance) → Cameras › Monitoring, with that camera selected on its ball mosaic.
- Pitch confidence FAIL → stays on Game and switches the field panel to PitchToPlate ball mosaics for that pitch.
- Poor hit track → stays on Game and switches to FullField hit images.
- After a jump to another view, a **"Back to Game · Pitch N"** bar returns to the same pitch.

Post-processing now reads the **same pitch list** as the Game timeline (newest first, "Pitch N · time"). A task marked reviewed shows as "Reviewed" in both places.

## Alert lifecycle
Active → cleared (still listed as "CLEARED · NOT ACKNOWLEDGED", with duration and affected pitches) → acknowledged. Nothing disappears on its own. Taking the fix action from the alert counts as acknowledging it. Developer messages are hidden unless turned on and never notify.

## Alert → destination map (prototype)
| Alert (prototype example) | Applies to | Severity | Notification | Takes you to |
|---|---|---|---|---|
| Camera not running (PitchToPlate 6, Biomechanics 15) | any camera | CRIT | yes | Cameras › Monitoring › that camera |
| Cameras below full frame rate (Biomechanics 1, 2, 6, 12) | any camera | WARN | no | Cameras › Monitoring › Problems filter |
| Player tracking skipped (PitchToPlate 5) | P2P / FF | WARN | no | Cameras › Monitoring › that camera, genlock checks |
| Antiwobble falling back (PitchToPlate 1) | any camera | WARN | no | Cameras › Control › that camera › Calibration, Antiwobble highlighted |
| Session OUT/NONE while game mode LIVE | system | WARN | yes, with Go in session | Header › Session |
| BDS not connected | system | WARN | no | Header › Redundancy |
| Cleared critical with affected pitches (FullField 5) | any | CRIT (cleared) | no | Post-processing › affected pitches |
| Spin fit error over the review line | pitches | WARN | yes | Post-processing › Needs review + spin trend |
| Cloud tasks failed | pitches | WARN | no | Cloud processing › Needs attention |
| Writing to disk disabled, etc. | system | DEV | never | Merged into the session alert |

The rule for the dev team: **every alert type must declare a destination** (view + selection + highlight target) and, where possible, a one-click fix. A BMCA message that has a control in Cameras › Control routes there.

## Views
1. **Game (home)**
   - Health tiles.
   - **Field panel switcher**:
     - Combined: bird's-eye view, P/F camera markers coloured by health, last-hit overlay.
     - PitchToPlate 1–6 and FullField 1–8: Ball mosaic / Hit image toggle.
     - Biomechanics 1–16: ball mosaics only.
     - All camera grids carry the same health badges as the Cameras view. They step through pitches in sync with the timeline; click a camera to enlarge it and step camera by camera.
   - Pitch card: confidence (pass > 7) with track length/quality, ACS delivery, strike zone agreement per tracking camera (P1–P6, F1–F8), PP results.
   - Pitch timeline. Timing appears only when out of range.
2. **Cameras**: the single camera list, plus two sub-tabs for the selected camera:
   - **Monitoring**: feeds, facts and alerts.
   - **Control**: live image with overlays, and the Image / Ball tuning / Calibration controls (see below).
3. **Post-processing**: summary, per-task bars, spin trend, queue grouped by pitch, pitch detail, explicit Reprocess / Move to front.
   - **Trackpac result** (Post-processing detail and list, and the Game pitch card): **Valid** (green, Success) / **Validation failed** (amber, Needs review; can be marked reviewed → "Validation failed · reviewed") / **Failed** (red: no result was generated; reprocess only). A failed Trackpac never uploads, so Cloud processing shows its Trackpac as Failed and its cloud tasks as "Blocked · Trackpac failed", under Needs attention. Sample: pitch 8 (only with All healthy off).
   - **Multi-select by pitch** (no checkboxes): click a row to select it, Ctrl/Cmd-click to add or remove a row, and Shift-click to select a range. Selected rows are highlighted. A bar above the list shows "N pitches selected", a hint, **Reprocess…** (the keyboard-friendly way to open the menu) and **Clear selection** (shown whenever anything is selected, as in Cloud processing). Clearing leaves nothing selected: the pitch panel shows a "No pitches selected" prompt and Reprocess… is disabled until a pitch is clicked.
   - **Right-click to reprocess**: right-clicking a selected pitch, or a task cell in it, opens a menu: Reprocess Release / Spin / Trackpac (the task you right-clicked is listed first and highlighted), Reprocess all tasks, and Reprocess failed tasks only, each with a count. Right-clicking an unselected row selects just that row first.
   - **Pitch panel with several pitches selected**: one line per pitch with a light for each task (green circle = Success, amber square = Needs review, red square = Failed, blue = Queued/processing), a "Problems" count per task, and a summary verdict. Clicking a line opens that pitch's full detail. With one pitch selected, the panel shows the full detail as before.
   - Reprocessed tasks join the queue: the first shows "Processing…" and the rest "Queued · n". The summary shows the queue count and ETA. Reprocess failed and the pitch-detail reprocess buttons use the same queue. In the mock, one task finishes every 2 s.

4. **Cloud processing**
   - Same pitches as the Game timeline, newest first. No pitch detail panel.
   - **Trackpac (local)** column, the local Trackpac task that powers cloud processing: **Queued → Processing → Successful | Needs validation → Uploaded** (final). It mirrors the Post-processing Trackpac: Success there = Successful here until it uploads, and Needs review there = Needs validation here. Selecting a pitch whose Trackpac needs validation offers a button to open that task in Post-processing.
   - **Bat, Pitcher biomech, Batter biomech (cloud)** columns: **Queued → Processing → Success | Failed**, as reported by the cloud. They show "Queued · waiting on Trackpac" until that pitch's Trackpac is Uploaded. Failed tasks are repushed from the right-click menu (below).
   - Summary header: Trackpac uploaded / needs validation, and cloud success / processing / queued / failed. One stacked bar for Trackpac (local) and one per cloud task, each with its own legend.
   - Filters: All / Needs attention (cloud failed or Trackpac needs validation) / Not complete.
   - Cloud failures raise an alert ("N cloud tasks failed") that badges the tab and routes to Needs attention.
   - **Multi-select and repush** (the same selection model as Post-processing): click a row to select it (click again to deselect), Ctrl/Cmd-click to add or remove rows, and Shift-click to select a range. Unlike Post-processing, nothing is selected by default, since there's no detail panel. The bar above the list shows "N pitches selected", **Repush…** and **Clear selection**. Changing the filter clears the selection.
   - **Right-click to repush**: the menu offers Repush bat data / pitcher biomech / batter biomech (a task you right-clicked is listed first), Repush all, and Repush failed only, each with a count. Only pitches whose Trackpac has uploaded can be pushed; the menu notes how many selected pitches are still waiting on Trackpac. Repushed tasks show Processing, then Success (after about 4 s in the mock).
   - This replaces the old click-Failed → "Reprocess in cloud" popout. Trackpac "Needs validation" is reached by selecting that pitch: the bar then shows **Validate Trackpac in Post-processing**.

Header on every view: views + badges, Game ID (GamePK first, Session ID fallback, popout with both), game mode from BDS, Session None/Out/In, Redundancy, clock, alert button.

## Cameras › Control: bringing BMCA's core controls into Tracking Ops Control
Today an operator has to switch to BMCA, one instance per camera, to change anything. With 30 cameras that's a lot of window-hopping. Control brings in the controls used most often. Anything deeper stays in BMCA, and **Open in BMCA** takes a technical operator to that camera's instance.

**Layout:** camera list (left, shared with Monitoring). Next to it, the live image runs the full width, with the control panel **underneath** it so the image gets as much space as possible. The panel has three tabs (**Image · Ball tuning · Calibration**). Each tab's boxes sit side by side across the full width: Image = Exposure | Gain | Lens; Ball tuning = Ball detector | Ball tuning (wider); Calibration = Nudging | Refinement | Antiwobble. On Calibration, the Reference calibration box wraps to a second row.

**Live image**
- Overlay toggles replace BMCA's Display options: **Calibration** (magenta lines) and **Ball detections** (green box = accepted, red = rejected by the current limits).
- While a nudge is unsaved, the **saved position** shows as dashed lines, so the operator can see how far they've moved it.
- One row of readouts under the image: frame rate, exposure, analog gain, digital gain, iris, focus. Changed values show in blue. (No calibration-state readout; the Nudging section shows that.)

**Image tab** (BMCA Camera tab → Exposure and Gain, Lens Control)
- Exposure: Auto exposure on/off, auto exposure target, current exposure (read-only while auto is on), max exposure.
- Gain: Auto analog gain on/off and analog gain; Auto digital gain on/off and digital gain. When an auto option is on, its +/− stepper is replaced by a read-only value ("set by auto …").
- Lens: connect to lens, iris, focus (stepper replaces BMCA's +/− buttons), restart lens controller (Birger).
- Not carried over: tracking-pipeline frame rates, focus peaking and monitoring, display options.

**Ball tuning tab** (BMCA Installation tab → Ball Tuning). PitchToPlate and FullField only; Biomechanics cameras say there is nothing to tune.
- **Ball detector**: use LMR, size, threshold, ball scaling (BMCA's LMR and Circle Ball Centre Finding combined).
- **Ball tuning**: strength min, perimeter min/max, area min/max. A **Last ball** column (BMCA's "Selected") shows the latest candidate's values against the limits, plus a verdict ("the last ball would be rejected with these limits"), so the operator sees the effect before the next pitch.

**Calibration tab** (BMCA Operations tab)
- **Nudging**: Off/On (off by default so a stray click can't move the calibration). Shows "No nudges set" / "Saved nudge" / "Unsaved nudge". Two ways to nudge, usable together:
  - **Click to move points** (a toggle above the arrows): key points on the calibration appear as dots on the image (prototype: home plate, upper/lower foul line, mound line). Click a dot to select it, then click where it belongs in the image; the calibration moves to match. Click the dot again to cancel. Zoom in for precision. In the mock this moves the whole calibration; the real app would re-solve the camera pose from the moved point(s).
  - **Arrows**: the arrow pad, with a step size (Fine / Normal / Coarse) that replaces BMCA's Shift/Ctrl keys.
- **Refinement**: BMCA's 2D nudge, renamed. Horizontal/vertical with Clear.
- **Antiwobble**: Lines and Templates on/off with how many matched, plus the templates score threshold.
- **Reset to reference calibration**: a danger button with a confirm step. It saves straight away.

**One change model for every tab**
- Changes reach the camera straight away, the same as in BMCA. A LIVE-game warning says so at the top of the panel.
- The footer shows "N unsaved changes in [tab]" with **Revert** and **Save**. Saving the Calibration tab also switches nudging off.
- Unsaved changes are kept per camera when you switch cameras. The list shows an **UNSAVED** tag on those cameras, and the sub-tab bar shows "N cameras with unsaved changes".
- No copying settings between cameras: each camera is tuned on its own.
- If a camera isn't running, Control shows no image and no controls, and links back to Monitoring.
- Open alerts on the selected camera are listed at the top of the control panel with Acknowledge.

## Zooming camera images (every view)
Every camera image (Game field-panel tiles and enlarged camera, Cameras › Monitoring feeds, Cameras › Control live image) zooms with the **scroll wheel** around the cursor, 100–800%. Drag pans once you're zoomed in. Each image remembers its own zoom (per view, camera and image type). The larger images also have − / % (reset) / + buttons for keyboard and trackpad users. Grid tiles show the zoom level, and dragging a tile doesn't open it. In Control, overlays and key-point dots zoom with the image, so click-to-move can be used at high zoom. The wheel is bound natively (non-passive) so it doesn't also scroll the page.

## Current panel → new home
| Current BMCC / BMCA | New home |
|---|---|
| Header redundancy / Game ID / Location / Game mode / Session | Header (Location under the logo) |
| In/Out session dropdown | Header Session control; fix button on the session alert |
| Status box | Alert system: drawer + notifications + badges + banner |
| Monitored Cameras status + tracking camera status | One camera list by tracking group + Cameras health tile |
| Combined tab | Game › Combined |
| Ball mosaics (BM1–14) | Game field switcher and Cameras › Monitoring feed |
| Tracking windows / Monitored images / Camera Switcher | Cameras › Monitoring feed tabs per selected camera |
| Last hit image | Combined overlay; Hit image toggle on PitchToPlate / FullField |
| PostProcess images, PP queue and controls | Post-processing view |
| Confidence, track length/quality, strike zone, ACS | Game pitch card |
| Pitch latency, TSS offset | Data & timing tile; alert when out of range |
| Time since last pitch, Play Events, hit %/distance panel | Removed |
| Useful buttons (debug) | Settings / developer menu (not mocked) |
| BMCA camera window (live feed + tracking graphics) | Cameras › Control live image with overlay toggles |
| BMCA Camera tab: Exposure and Gain, Lens Control | Cameras › Control › Image |
| BMCA Installation tab: Ball Tuning (LMR size/threshold, strength/perimeter/area limits, ball scaling) | Cameras › Control › Ball tuning |
| BMCA Operations tab: Nudging, 2D nudge, Antiwobble, Reset to reference | Cameras › Control › Calibration (2D nudge renamed Refinement) |
| BMCA Camera tab: Display options | Overlay toggles on the live image |
| BMCA Property tree, other Installation settings, focus peaking/monitoring, pipeline frame rates | Stay in BMCA (Open in BMCA) |
| BMCA Operations tab: Writing to disk | Not in Control: header Session control |

## Confirmed
- Single venue per UI.
- Every notable alert must be acknowledged; clearing doesn't remove it.
- Alerts must proactively route the operator to where the fix is.
- Monitored cameras = biomechanics cameras. All cameras share one health model; only PitchToPlate and FullField show tracking metrics.
- Cameras are referred to by tracking group (PitchToPlate / FullField / Biomechanics) everywhere.
- Mapping: BMCC tracking cameras 1–6 = PitchToPlate 1–6, 7–14 = FullField 1–8; monitored cameras = Biomechanics 1–16 in BMCC list order.
- Control assumptions confirmed: BMCA changes apply straight away and Save makes them permanent; Antiwobble belongs under Calibration; Writing to disk stays out of Control (header Session); BMCA host = tracking camera number (BMCA1 = PitchToPlate 1); nudges shown as steps.
- Cameras view has Monitoring and Control sub-tabs. Control brings in Camera quality (exposure, gain, lens), Ball tuning and Nudging/Calibration from BMCA; everything else stays in BMCA. 2D nudge is called Refinement.

## Still open
- Which alerts notify versus badge only; sound for criticals; escalation if a critical sits unacknowledged.
- Thresholds: latency, TSS offset, spin fit error (0.25 placeholder), how many dropped frames count as "below full rate".
- Whether acknowledgements sync between the Main and Backup BMCC.
- Source for camera positions on the field map.
- Control permissions: should Reset to reference and ball tuning be limited to technical operators?
- Should Ball tuning be locked during a LIVE game, or only show a warning?
- Do changes made in BMCA directly need to show up here as "changed outside Tracking Ops Control"?

## Prototype build notes (Claude Code)
- **All healthy** Tweak (Data states, on by default during development) hides every sample error: no alerts or notifications, all 30 cameras at 600/600, session In, BDS connected, no timing warning, every pitch passes with no PP or cloud failures, and no antiwobble fallback. Turn it off to bring back the full error scenario that the alert flows are demonstrated with.
- App shell: one fixed-size window (web or desktop). The root is the full window height. Header, alert banner and back bar never scroll. Each view (Game, Cameras, Post-processing) fills the remaining space and scrolls on its own, so every tab is the same size. Notifications and the alert drawer float above the window.
- Stack: React + TypeScript + Vite. A mock data layer replays a JSON game: pitches with PP results, camera fps/status ticks, status messages with start/clear times, session and game-mode changes, GamePK and Session ID. Include at least one alert that arrives mid-session.
- Camera model: `{id, group: 'pitchToPlate'|'fullField'|'biomechanics', number, label, host?, running, fps, targetFps: 600, tracking?: {multicamPresent, playerTracking, strikeZoneDelta}}`. Health = `!running ? crit : fps < targetFps ? warn : (tracking issue ? warn : ok)`.
- A small adapter maps BMCC identifiers (tracking camera number, monitored-camera host/name) to `{group, number}`, so the UI never shows BMCA hosts or 1–30 numbering except in raw messages and the Open in BMCA link.
- Alert model: `{id, severity: crit|issue|warn|dev, title, summary, line, checks[], raw, cameraId?, startedAt, clearedAt?, affectedPitches[], acknowledgedAt?, acknowledgedBy?, notify, route: {view, select?, target?, sub?: 'monitor'|'control', ctrl?: 'image'|'ball'|'calib'}, fix?: {label, action}}`.
- Routing: `goTo(alert)` sets view and selection, sets `focusAlertId` (banner + highlight), and remembers the previous view for "Back to …". Badges = open non-dev alerts grouped by `route.view`.
- Camera control model: per camera, `saved` settings and `live` overrides. Dirty = keys where they differ. Sections: `image` (autoExp, expTarget, exposure, maxExp, autoGain [analog], aGain, autoDGain, dGain, lens, iris, focus), `ball` (lmr, size, thresh, strMin, perMin, perMax, areaMin, areaMax, scale), `calib` (nx, ny, rx, ry, awLines, awTpl, awScore). Save copies a section's live values to saved; Revert drops the overrides. Defaults are taken from the BMCA screenshots (auto exposure target 80, exposure 252.37, max 1400, analog gain 30, iris 3.0, focus 14028, LMR size 18 / threshold 14, strength min 4, perimeter 25–500, area 25–1500, ball scaling 1.00, antiwobble score 0.50). In the real app these read from and write to each camera's BMCA (transport to be decided, e.g. its property tree HTTP server).
- Zoom: `zoom[key] = {s, x, y}` (scale, translate px), transform-origin 0 0, clamped so the image always covers the viewport. Key = view + camera + image type.
- Click-to-move: on the 2nd click, delta = clicked point − the key point's current position, added to the nudge (nx, ny). In the real app, send the point correspondence to BMCA instead.
- Live image: in the mock, a crop of a BMCA PitchToPlate 1 frame with the baked-in overlays removed. Calibration lines and ball boxes are SVG on top, so nudges move them. The image filter roughly follows exposure, gain, iris and focus (mock only). In the real app the overlays come from BMCA's tracking output.
- Colours: ground #0B0E13, panel #12161D, border #252B36, text #E7ECF2, muted #95A1B2, ok #3DD68C, warn #F5B841, crit #FF5F57, issue #C2413B, accent #5AB8FF, calibration overlay #FF3DDC, unsaved #9CD3FF. Fonts: IBM Plex Sans / IBM Plex Mono. Status is never colour-only (circle = ok, square = problem, plus text). Every numeric stepper uses one style: − button · value centred in a fixed-width (74px) dark field (#0B0E13, border #252B36) · + button; changed values show in #9CD3FF.
- Placeholders: strike-zone tolerance 0.005, GamePK 823476, earlier pitches, FullField 5 cleared alert, spin alert, affected pitch 04-52-31, one sample mosaic repeated across cameras, hit image, one live frame repeated across cameras, last-ball values (strength 7, perimeter 62.4, area 288), antiwobble match counts.
