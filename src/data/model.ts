import type { AcsStatus, SzDelta, CameraFile, CameraGroup, Dataset, PitchFile, TrackpacCloud, CloudResult } from './types';

export type Health = 'ok' | 'warn' | 'crit';
export const GROUP: Record<CameraGroup, { name: string; tag: string; mark: string }> = {
  pitchToPlate: { name: 'PitchToPlate', tag: 'P2P', mark: 'P' },
  fullField: { name: 'FullField', tag: 'FF', mark: 'F' },
  biomechanics: { name: 'Biomechanics', tag: 'BIO', mark: 'B' },
};
export const label = (c: CameraFile) => `${GROUP[c.group].name} ${c.number}`;
export const mark = (c: CameraFile) => `${GROUP[c.group].mark}${c.number}`;
export const isTracking = (c: CameraFile) => c.group !== 'biomechanics';
export const targetFps = (c: CameraFile, ds: Dataset) => c.targetFps ?? ds.thresholds.targetFps;

export function health(c: CameraFile, ds: Dataset): Health {
  if (!c.running) return 'crit';
  if (c.fps < targetFps(c, ds)) return 'warn';
  if (c.tracking && (!c.tracking.multicamPresent || !c.tracking.playerTracking)) return 'warn';
  return 'ok';
}
export function healthNote(c: CameraFile, ds: Dataset): string {
  if (!c.running) return 'Not running';
  if (c.fps < targetFps(c, ds)) return `${c.fps}/${targetFps(c, ds)}`;
  if (c.tracking && !c.tracking.playerTracking) return 'Player tracking skipped';
  if (c.tracking && !c.tracking.multicamPresent) return 'Missing from multicam';
  return `${c.fps}/${targetFps(c, ds)}`;
}

export const COLOR = {
  ground: '#0B0E13', panel: '#12161D', border: '#252B36', text: '#E7ECF2', muted: '#95A1B2',
  ok: '#3DD68C', warn: '#F5B841', crit: '#FF5F57', issue: '#C2413B', accent: '#5AB8FF', dev: '#5E6B7D',
};

// ---------------- post-processing task state (data + operator actions) ----------------
export const TASKS = ['Release', 'Spin', 'Trackpac'] as const;
export type TaskState = 'ok' | 'warn' | 'crit' | 'reviewed' | 'queued' | 'processing';
export interface PpOps {
  reviewed: Record<string, true>; queue: string[]; done: Record<string, true>;
  /** thresholds.spinFitErrorReview: a spin fit error at or above this needs an operator's review. */
  spinReview: number;
}
export const tkey = (num: number, k: number) => `${num}:${k}`;

/** Spin has a result (rpm) but its fit error is at or over the review line. The operator can accept it (Mark reviewed) or reprocess. */
export const spinOverLine = (p: PitchFile, spinReview: number) => p.pp.spin.rpm !== undefined && (p.pp.spin.fitError ?? 0) >= spinReview;

/**
 * Raw state from data: Release/Spin failed -> warn (amber "Failed"), Trackpac validation failed -> warn, Trackpac failed -> crit.
 * A spin over the fit-error review line is warn ("Needs review") even if BMCC reported it a success.
 */
export function rawTaskState(p: PitchFile, k: number, spinReview = Infinity): 'ok' | 'warn' | 'crit' {
  if (k === 0) return p.pp.release.status === 'success' ? 'ok' : 'warn';
  if (k === 1) return p.pp.spin.status === 'success' && !spinOverLine(p, spinReview) ? 'ok' : 'warn';
  const t = p.pp.trackpac.status;
  return t === 'valid' ? 'ok' : t === 'failed' ? 'crit' : 'warn';
}
export function taskState(p: PitchFile, k: number, ops: PpOps): TaskState {
  const key = tkey(p.num, k);
  const qi = ops.queue.indexOf(key);
  if (qi === 0) return 'processing';
  if (qi > 0) return 'queued';
  if (ops.done[key]) return 'ok';
  if (ops.reviewed[key]) return 'reviewed';
  return rawTaskState(p, k, ops.spinReview);
}
/** A problem the operator can review and accept instead of reprocessing: Trackpac validation failed, or a spin over the review line. */
export function reviewable(p: PitchFile, k: number, ops: Pick<PpOps, 'spinReview'>): boolean {
  if (k === 2) return p.pp.trackpac.status === 'validation_failed';
  return k === 1 && spinOverLine(p, ops.spinReview);
}
export const isBad = (t: TaskState) => t === 'warn' || t === 'crit';
export function taskStatus(p: PitchFile, k: number, ops: PpOps): string {
  const t = taskState(p, k, ops);
  if (t === 'processing') return 'Processing…';
  if (t === 'queued') return `Queued · ${ops.queue.indexOf(tkey(p.num, k)) + 1}`;
  if (t === 'ok') return 'Success';
  if (t === 'reviewed') return 'Reviewed';
  return t === 'warn' && reviewable(p, k, ops) ? 'Needs review' : 'Failed';
}
export function taskValue(p: PitchFile, k: number, ops: PpOps): string {
  const t = taskState(p, k, ops);
  if (t === 'queued' || t === 'processing') return taskStatus(p, k, ops);
  if (k === 2) return t === 'ok' ? 'Valid' : t === 'crit' ? 'Failed' : t === 'reviewed' ? 'Validation failed · reviewed' : 'Validation failed';
  const spin = `RPM ${p.pp.spin.rpm ?? '—'} · err ${p.pp.spin.fitError ?? '—'}`;
  if (k === 1 && reviewable(p, k, ops) && (t === 'warn' || t === 'reviewed')) return t === 'reviewed' ? `${spin} · reviewed` : spin;
  if (t === 'reviewed') return 'Reviewed by operator';
  if (t !== 'ok') return 'Needs reprocess';
  return k === 0 ? `${p.pp.release.mph ?? '—'} mph` : spin;
}
export function pitchWorst(p: PitchFile, ops: PpOps): 'ok' | 'warn' | 'crit' {
  const s = [0, 1, 2].map((k) => taskState(p, k, ops));
  return s.includes('crit') ? 'crit' : s.includes('warn') ? 'warn' : 'ok';
}

// ---------------- cloud state (data + repushes) ----------------
export const CLOUD_TASKS = [['bat', 'Bat'], ['pitcherBiomech', 'Pitcher biomech'], ['batterBiomech', 'Batter biomech']] as const;
export type CloudKey = (typeof CLOUD_TASKS)[number][0];
export interface CloudOps { retried: Record<string, number>; done: Record<string, true> }

export function trackpacCloud(p: PitchFile, pp: PpOps): TrackpacCloud {
  const t = taskState(p, 2, pp);
  if (t === 'crit') return 'failed';
  if (t === 'warn') return 'needs_validation';
  if (t === 'reviewed' && p.cloud.trackpac === 'needs_validation') return 'successful';
  if (t === 'ok' && (p.cloud.trackpac === 'needs_validation' || p.cloud.trackpac === 'failed')) return 'successful';
  return p.cloud.trackpac;
}
export function cloudState(p: PitchFile, k: number, pp: PpOps, ops: CloudOps): CloudResult {
  if (trackpacCloud(p, pp) !== 'uploaded') return 'queued';
  const key = tkey(p.num, k);
  if (ops.retried[key]) return 'processing';
  if (ops.done[key]) return 'success';
  return p.cloud[CLOUD_TASKS[k][0]];
}

// ---------------- pitch card ----------------
export type Tone = 'ok' | 'warn' | 'crit';
/** Hit tracked %: green at or above hitTrackGoodPct, red below hitTrackPoorPct, amber between. */
export function hitTone(pct: number, ds: Dataset): Tone {
  return pct >= ds.thresholds.hitTrackGoodPct ? 'ok' : pct < ds.thresholds.hitTrackPoorPct ? 'crit' : 'warn';
}
export const ACS: Record<AcsStatus, { label: string; tone: Tone }> = {
  success: { label: 'SUCCESS', tone: 'ok' }, review: { label: 'REVIEW', tone: 'warn' }, fail: { label: 'FAIL', tone: 'crit' },
};

// ---------------- strike zone ----------------
/** One camera's strike-zone Δ split into X and Z. `worst` is the axis furthest from zero (signed). */
export function szParts(v: SzDelta | number | null | undefined): { x: number | null; z: number | null; worst: number | null } {
  if (v === null || v === undefined) return { x: null, z: null, worst: null };
  if (typeof v === 'number') return { x: null, z: null, worst: v };
  return { x: v.x, z: v.z, worst: Math.abs(v.x) >= Math.abs(v.z) ? v.x : v.z };
}
/** no data -> crit, outside tolerance -> warn. */
export const szTone = (d: number | null, ds: Dataset): Tone => (d === null ? 'crit' : Math.abs(d) > ds.thresholds.strikeZoneTolerance ? 'warn' : 'ok');

export function strikeZone(p: PitchFile, ds: Dataset) {
  return ds.cameras.filter(isTracking).map((c) => {
    const { x, z, worst } = szParts(p.strikeZone[c.id]);
    return { cam: c, d: worst, x, z, state: szTone(worst, ds) };
  });
}
