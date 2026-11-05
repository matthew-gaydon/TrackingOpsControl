/**
 * Alert engine: turns raw data into routed alert *conditions*.
 *
 *  1. Status messages (status.json) are matched against RULES. Each rule knows which camera
 *     the message is about and where in the UI it is fixed.
 *  2. Derived checks look at cameras / game / pitches directly (frame rate, session, BDS,
 *     timing, cloud failures, spin fit error).
 *  3. Anything unmatched becomes a developer message (hidden unless Developer is on).
 *
 * The engine is stateless: it says what is wrong *right now*. The ledger (./ledger.ts) turns that
 * into alerts with a lifecycle (raised → cleared → acknowledged), so a problem that goes away is
 * still listed until someone acknowledges it, and a problem that comes back is raised again.
 *
 * Every condition MUST declare a route (view + selection + highlight target) and a stable `key`
 * (same problem → same key). Add rules here as you meet new BMCC/BMCA messages in real data.
 */
import type { CameraFile, Dataset, Status } from '../data/types';
import { CLOUD_TASKS, cloudState, label, isTracking, targetFps, tkey, type CloudOps, type PpOps } from '../data/model';

export type Severity = 'crit' | 'issue' | 'warn' | 'dev';
export interface Route {
  view: 'game' | 'cameras' | 'pp' | 'cloud';
  cam?: string; camTab?: 'tracking' | 'mosaic' | 'still'; camFilter?: 'all' | 'problems'; camSub?: 'monitor' | 'control'; ctrl?: 'image' | 'ball' | 'calib';
  ppFilter?: 'all' | 'flag' | 'affected'; ppSel?: number; affected?: number[];
  cloudFilter?: 'all' | 'failed' | 'open';
  target?: 'session' | 'red' | 'timing';
}

/** One thing that is wrong right now, as the engine sees it. */
export interface Condition {
  /** Identity of the problem. The same problem must give the same key on every run. */
  key: string;
  sev: Severity; title: string; summary: string; checks: string[]; raw?: string;
  where: string; route: Route; line: string;
  cameraId?: string; notify: boolean; fix?: { label: string; action: 'goInSession' };
  /**
   * For alerts that cover several things (cameras, tasks, pitches). If one appears that wasn't
   * there when the alert was acknowledged, the ledger raises it again.
   */
  members?: string[];
  /** When the problem started, if the source says (status messages). Otherwise the ledger uses first sight. */
  startedAt?: number;
  /** Set when the source itself reports the problem cleared (status messages with clearedAt). */
  clearedAt?: number;
}

export interface EngineInput { ds: Dataset; session: string; elapsedSec: number; pp: PpOps; cloud: CloudOps }

const byTracking = (ds: Dataset, n: number) => ds.cameras.find((c) => c.bmccTrackingNumber === n);
const byHost = (ds: Dataset, host: string) => ds.cameras.filter((c) => c.host === host);
const camRoute = (c: CameraFile): Route => ({ view: 'cameras', cam: c.id, camTab: isTracking(c) ? 'tracking' : 'still', camSub: 'monitor' });
const raw = (m: Status) => `${m.at} - ${m.level}: ${m.source === 'BMCC' ? '' : m.source + ' · '}${m.text}`;
/** Message-based conditions are one occurrence per message: key on what it's about plus when it started. */
const msgKey = (kind: string, m: Status, about = '') => `${kind}:${about}@${m.atMs}`;
const times = (m: Status) => ({ startedAt: m.atMs, clearedAt: m.clearedAtMs });

type Rule = (m: Status, ds: Dataset) => Condition[] | null;

const RULES: Rule[] = [
  // Cameras:: "6 Missing from multicam frames, ensure software is launched and running at full frame rate."
  (m, ds) => {
    const r = m.text.match(/Cameras::\s*"?(\d+)\s+Missing from multicam frames/i);
    if (!r) return null;
    const c = byTracking(ds, +r[1]);
    if (!c) return null;
    const L = label(c);
    if (m.clearedAtMs !== undefined) {
      const affected = ds.pitches.filter((p) => p.atMs >= m.atMs && p.atMs <= m.clearedAtMs!).map((p) => p.num);
      return [{
        key: msgKey('missing', m, c.id), sev: 'crit', title: `${L} not running`,
        where: `Post-processing › ${affected.length} affected pitch${affected.length === 1 ? '' : 'es'}`,
        summary: `This has cleared, but ${affected.length} pitch${affected.length === 1 ? ' was' : 'es were'} tracked while ${L} was missing. Review ${affected.length === 1 ? 'it' : 'them'}, then acknowledge.`,
        checks: affected.map((n) => `Review pitch ${n}`), raw: raw(m), cameraId: c.id, notify: false,
        route: { view: 'pp', ppFilter: 'affected', affected, ppSel: affected[0] }, line: `${affected.length} pitches affected.`, ...times(m),
      }];
    }
    return [{
      key: msgKey('missing', m, c.id), sev: 'crit', title: `${L} not running`, where: `Cameras › ${L}`,
      summary: `${L} is missing from multicam frames, so pitches are being tracked without it. Check its capture software is launched and running at full frame rate.`,
      checks: [`Capture software running for ${L}`, `${L} at full frame rate`], raw: raw(m), cameraId: c.id, notify: true,
      route: camRoute(c), line: 'Pitches are being tracked without it.', ...times(m),
    }];
  },
  // Monitored Cameras: BMCA27 — status red (not connected)
  (m, ds) => {
    const r = m.text.match(/Monitored Cameras:\s*(BMCA\d+)(?:\s+(Camera \d+))?.*red/i);
    if (!r) return null;
    const cams = byHost(ds, r[1]);
    const c = (r[2] && cams.find((x) => x.bmccName === r[2])) || cams[0];
    if (!c) return null;
    const L = label(c);
    return [{
      key: msgKey('monitored', m, c.id), sev: 'crit', title: `${L} not running`, where: `Cameras › ${L}`,
      summary: `${L} isn’t sending frames. Check its capture software is launched and running at full frame rate.`,
      checks: ['Camera powered and on the network', `Capture software running for ${L}`], raw: raw(m), cameraId: c.id, notify: true,
      route: camRoute(c), line: 'No frames from this camera.', ...times(m),
    }];
  },
  // Player tracking frame selection: "... Not done on: 5 "
  (m, ds) => {
    const r = m.text.match(/Not done on:\s*([\d\s]+)/i);
    if (!r) return null;
    return r[1].trim().split(/\s+/).map(Number).map((n) => byTracking(ds, n)).filter((c): c is CameraFile => !!c).map((c) => ({
      key: msgKey('pt', m, c.id), sev: 'warn' as const, title: `Player tracking skipped on ${label(c)}`, where: `Cameras › ${label(c)}`,
      summary: `Player tracking ran on the other tracking cameras but not on ${label(c)}. If this persists it may be a genlocking failure.`,
      checks: ['Player tracking fps the same on all analysis instances', 'BaseCaptureFps correct', 'UseGenlockingTargetTimesToSelectFramesForProcessing set'],
      raw: raw(m), cameraId: c.id, notify: false, route: { ...camRoute(c), camTab: 'tracking' as const }, line: 'Possible genlock failure.', ...times(m),
    }));
  },
  // Antiwobble Consensus: "Not enough successful patches to do requested pose type, doing Pose 2 (Pitch, Yaw) instead"
  (m, ds) => {
    if (!/Antiwobble Consensus:.*Not enough successful patches/i.test(m.text)) return null;
    const c = byHost(ds, m.source).find(isTracking);
    if (!c) return null;
    return [{
      key: msgKey('wobble', m, c.id), sev: 'warn', title: `Antiwobble falling back on ${label(c)}`, where: `Cameras › Control › ${label(c)}`,
      summary: 'Too few template patches matched, so antiwobble is only correcting pitch and yaw. Check the calibration lines still sit on the field markings, and nudge them back if they have drifted.',
      checks: ['Calibration lines sit on the foul lines', 'Templates antiwobble switched on'], raw: raw(m), cameraId: c.id, notify: false,
      route: { view: 'cameras', cam: c.id, camSub: 'control', ctrl: 'calib' }, line: 'Calibration may drift.', ...times(m),
    }];
  },
  // Writing to disk disabled: true  -> developer detail, covered by the session alert
  (m) => /Writing to disk disabled/i.test(m.text)
    ? [{ key: msgKey('disk', m), sev: 'dev', title: m.text, where: 'Header › Session', summary: 'Low-level status covered by the session alert.', checks: [], raw: raw(m), notify: false, route: { view: 'game', target: 'session' }, line: '', ...times(m) }]
    : null,
];

export function deriveConditions({ ds, session, elapsedSec, pp, cloud }: EngineInput): Condition[] {
  const out: Condition[] = [];
  for (const m of ds.status) {
    if (m.appearsAfterSec && elapsedSec < m.appearsAfterSec) continue;
    let hit: Condition[] | null = null;
    for (const rule of RULES) { hit = rule(m, ds); if (hit) break; }
    if (hit) out.push(...hit);
    else out.push({ key: `dev:${m.id}`, sev: 'dev', title: m.text.length > 90 ? m.text.slice(0, 87) + '…' : m.text, where: m.source, summary: 'Unrecognised status message. Add a rule in src/alerts/engine.ts if operators should see it.', checks: [], raw: raw(m), notify: false, route: { view: 'game' }, line: '', ...times(m) });
  }

  // camera not running with no active message about it
  for (const c of ds.cameras) {
    if (!c.running && !out.some((a) => a.cameraId === c.id && a.clearedAt === undefined && a.sev === 'crit')) {
      out.push({ key: `down:${c.id}`, sev: 'crit', title: `${label(c)} not running`, where: `Cameras › ${label(c)}`, summary: `${label(c)} isn’t sending frames. Check its capture software is launched and running at full frame rate.`, checks: [`Capture software running for ${label(c)}`], cameraId: c.id, notify: true, route: camRoute(c), line: 'No frames from this camera.' });
    }
  }
  // below full frame rate (one alert for all cameras; a newly slow camera raises it again)
  const slow = ds.cameras.filter((c) => c.running && c.fps < targetFps(c, ds));
  if (slow.length) {
    out.push({ key: 'fps', sev: 'warn', title: `${slow.length} camera${slow.length > 1 ? 's' : ''} below full frame rate`, where: 'Cameras › Problems',
      summary: slow.map((c) => `${label(c)} ${c.fps}/${targetFps(c, ds)}`).join(' · ') + '. The same check applies to every camera.',
      checks: ['Frame drops steady, not getting worse', 'Host CPU and disk load normal'], raw: slow.map((c) => `${c.host ?? ''} ${c.bmccName ?? label(c)} [${c.fps}/${targetFps(c, ds)}]`).join(' · '),
      notify: false, members: slow.map((c) => c.id),
      route: { view: 'cameras', cam: slow[0].id, camTab: isTracking(slow[0]) ? 'tracking' : 'mosaic', camFilter: 'problems', camSub: 'monitor' }, line: slow.map(label).join(', ') + '.' });
  }
  // session
  if (ds.game.gameMode === 'LIVE' && session !== 'in') {
    out.push({ key: 'session', sev: 'warn', title: `Session ${session.toUpperCase()} while game is LIVE`, where: 'Header › Session', summary: 'Cameras are not recording to disk and PP tasks are not processed. Switch the session to In.', checks: [], notify: true, route: { view: 'game', target: 'session' }, fix: { label: 'Go in session', action: 'goInSession' }, line: 'No recordings or PP for pitches right now.' });
  }
  if (!ds.game.redundancy.bdsConnected) {
    out.push({ key: 'bds', sev: 'warn', title: 'BDS not connected', where: 'Header › Redundancy', summary: 'Game mode and GamePK both come from BDS, so they may be stale until it reconnects.', checks: ['BaseballDataServer launched', 'Network path to BDS'], notify: false, route: { view: 'game', target: 'red' }, line: 'Game mode and GamePK may be stale.' });
  }
  const { tssOffsetMs, latencyMs } = ds.game.timing;
  if (tssOffsetMs > ds.thresholds.tssOffsetMaxMs || latencyMs > ds.thresholds.latencyMaxMs) {
    out.push({ key: 'timing', sev: 'warn', title: 'Timing out of range', where: 'Game › Data & timing', summary: `TSS offset ${tssOffsetMs} ms (max ${ds.thresholds.tssOffsetMaxMs}) · latency ${latencyMs} ms (max ${ds.thresholds.latencyMaxMs}).`, checks: ['Time sync server reachable', 'Capture hosts synced'], notify: false, route: { view: 'game', target: 'timing' }, line: `TSS ${tssOffsetMs} ms.` });
  }
  // cloud failures (a newly failed task raises it again)
  const failed: { key: string; text: string }[] = [];
  ds.pitches.forEach((p) => CLOUD_TASKS.forEach(([, n], k) => { if (cloudState(p, k, pp, cloud) === 'failed') failed.push({ key: tkey(p.num, k), text: `${n} on pitch ${p.num}` }); }));
  if (failed.length) {
    out.push({ key: 'cloud', sev: 'warn', title: `${failed.length} cloud task${failed.length > 1 ? 's' : ''} failed`, where: 'Cloud processing › Needs attention', summary: `${failed.map((f) => f.text).join(', ')} failed in the cloud. Repush them from Cloud processing.`, checks: [], notify: false, members: failed.map((f) => f.key), route: { view: 'cloud', cloudFilter: 'failed' }, line: 'Repush them in the cloud.' });
  }
  // spin fit error over the review line, until each pitch is reprocessed or marked reviewed (a newly flagged pitch raises it again)
  const spinBad = ds.pitches.filter((p) => (p.pp.spin.fitError ?? 0) >= ds.thresholds.spinFitErrorReview && !pp.done[tkey(p.num, 1)] && !pp.reviewed[tkey(p.num, 1)]);
  if (spinBad.length) {
    const last = spinBad[spinBad.length - 1];
    out.push({ key: 'spin', sev: 'warn', title: `Spin fit error above ${ds.thresholds.spinFitErrorReview}`, where: 'Post-processing › Spin', summary: `Spin fit error crossed the review line on pitch${spinBad.length > 1 ? 'es' : ''} ${spinBad.map((p) => p.num).join(', ')}. The spin model may be drifting.`, checks: ['Compare spin strips on the flagged pitches', 'Mark each reviewed if the fit looks right, or reprocess it'], notify: true, members: spinBad.map((p) => String(p.num)), route: { view: 'pp', ppFilter: 'flag', ppSel: last.num }, line: 'Spin model may be drifting.' });
  }
  return out;
}

export const RANK: Record<Severity, number> = { crit: 3, issue: 2, warn: 1, dev: 0 };
export const SHORT: Record<Severity, string> = { crit: 'CRIT', issue: 'ISSUE', warn: 'WARN', dev: 'DEV' };
