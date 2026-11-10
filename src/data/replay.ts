/**
 * Replay: play a recorded dataset back as if it were happening live.
 *
 * The full dataset stays aside; `windowAt` gives the views a copy holding only what has happened by
 * the replay clock: pitches and status messages up to now, clears that haven't happened yet removed,
 * play data a few seconds after each pitch, and cloud tasks stepping queued → processing → result.
 * The views, the alert engine and the ledger don't know it's a replay: they just see the data grow.
 *
 * Timeline (only for a dataset whose game mode is LIVE):
 *   start = game start − lead   BATTING PRACTICE
 *   game start − 2 min          WARMUP
 *   game start                  LIVE
 * Game start is `game.start`, else the session's start time, else the first pitch.
 *
 * Pure functions only. The store holds the replay state and calls these (see replayTick).
 */
import type { CloudResult, Dataset, Pitch, PitchFile, TrackpacCloud } from './types';

export const SPEEDS = [1, 2, 5, 10, 30] as const;
/** The last part of the lead-in is WARMUP; before that it's BATTING PRACTICE. */
export const WARMUP_MS = 2 * 60_000;
/** Play metadata (StatsAPI in production) arrives this long after the pitch. */
export const PLAY_DELAY_MS = 5_000;
/** Cloud tasks: queued for this long after the pitch, then processing until their own step ends. */
export const CLOUD_QUEUED_MS = 3_000;
const cloudDoneMs = (k: number) => 8_000 + k * 2_000;
export const CLOUD_DONE_MS = cloudDoneMs(3);
/** The replay runs on this long after the last pitch or message, then stops. */
export const TAIL_MS = 60_000;
/** A session start this far (or more) before the first pitch isn't this game's start (sample data from another day). */
const START_WINDOW_MS = 60 * 60_000;

export interface ReplayOptions { leadMin: number; speed: number }

export interface Replay {
  /** Replay clock range (UTC ms). */
  startMs: number; endMs: number;
  /** When the game goes LIVE. */
  gameStartMs: number;
  speed: number; paused: boolean;
  /** The clock read `anchorClock` at wall time `anchorWall`; it runs at `speed` from there. */
  anchorWall: number; anchorClock: number;
}

/** Replay options from the URL: ?replay=1&lead=<minutes>&speed=<×>. null = not a replay. */
export function replayParams(search: string): ReplayOptions | null {
  const q = new URLSearchParams(search);
  if (!q.has('replay') || q.get('replay') === '0') return null;
  const lead = Number(q.get('lead') ?? 10), speed = Number(q.get('speed') ?? 1);
  return { leadMin: isFinite(lead) && lead >= 0 ? lead : 10, speed: (SPEEDS as readonly number[]).includes(speed) ? speed : 1 };
}

const firstPitchMs = (ds: Dataset) => ds.pitches.reduce((m, p) => (isFinite(p.atMs) ? Math.min(m, p.atMs) : m), Infinity);

/** When the game goes LIVE: game.start, else the session start, else the first pitch. A start after the first pitch, or long before it, is ignored. */
export function gameStartOf(ds: Dataset, sessionStart?: string): number {
  const first = firstPitchMs(ds);
  const plausible = (ms: number) => isFinite(ms) && (!isFinite(first) || (ms <= first && first - ms < START_WINDOW_MS));
  for (const s of [ds.game.start, sessionStart]) {
    const ms = s ? Date.parse(s) : NaN;
    if (plausible(ms)) return ms;
  }
  return isFinite(first) ? first : ds.nowMs;
}

export function makeReplay(ds: Dataset, opts: ReplayOptions, wall: number, sessionStart?: string): Replay {
  const gameStartMs = gameStartOf(ds, sessionStart);
  const startMs = gameStartMs - opts.leadMin * 60_000;
  const times = [gameStartMs, ...ds.pitches.map((p) => p.atMs), ...ds.status.flatMap((m) => [m.atMs, m.clearedAtMs ?? -Infinity])].filter(isFinite);
  const endMs = Math.max(...times) + TAIL_MS;
  return { startMs, endMs, gameStartMs, speed: opts.speed, paused: false, anchorWall: wall, anchorClock: startMs };
}

/** The replay clock (UTC ms) at a wall-clock time. */
export function replayClock(r: Replay, wall: number): number {
  if (r.paused) return r.anchorClock;
  return Math.min(r.endMs, r.anchorClock + (wall - r.anchorWall) * r.speed);
}

/** Change speed, pause, or jump (`to`), keeping the clock continuous: re-anchor at the current reading. */
export function retime(r: Replay, wall: number, ch: { speed?: number; paused?: boolean; to?: number }): Replay {
  const now = Math.max(r.startMs, Math.min(r.endMs, ch.to ?? replayClock(r, wall)));
  return { ...r, speed: ch.speed ?? r.speed, paused: ch.paused ?? r.paused, anchorWall: wall, anchorClock: now };
}

export const finished = (r: Replay, t: number) => t >= r.endMs;

/** Where "Next pitch" jumps: a few seconds before the next pitch after `t`. null = no more pitches. */
export function nextPitchAt(ds: Dataset, t: number, leadMs = 3_000): number | null {
  const next = ds.pitches.filter((p) => p.atMs - leadMs > t + 250).reduce((m, p) => Math.min(m, p.atMs), Infinity);
  return isFinite(next) ? next - leadMs : null;
}

/** BATTING PRACTICE → WARMUP → LIVE, for a dataset recorded LIVE. Any other recorded mode is kept as it is. */
export function gameModeAt(r: Replay, recorded: string, t: number): string {
  if (recorded !== 'LIVE') return recorded;
  return t >= r.gameStartMs ? 'LIVE' : t >= r.gameStartMs - WARMUP_MS ? 'WARMUP' : 'BATTING PRACTICE';
}

type CloudKey = keyof NonNullable<PitchFile['cloud']>;
const CLOUD_KEYS: CloudKey[] = ['trackpac', 'bat', 'pitcherBiomech', 'batterBiomech'];
/** A cloud task's stage `age` ms after its pitch, or null once it shows its recorded result. */
function cloudStage(age: number, k: number): 'queued' | 'processing' | null {
  return age < CLOUD_QUEUED_MS ? 'queued' : age < cloudDoneMs(k) ? 'processing' : null;
}
const staged = (v: string) => v !== 'queued' && v !== 'processing' && v !== 'unknown';

function stagedCloud(c: NonNullable<PitchFile['cloud']>, age: number): NonNullable<PitchFile['cloud']> {
  const out = { ...c };
  CLOUD_KEYS.forEach((key, k) => {
    const s = cloudStage(age, k);
    if (s && staged(c[key])) (out as Record<CloudKey, TrackpacCloud | CloudResult>)[key] = s;
  });
  return out;
}

/** The dataset as it stands at replay time `t`. Pitch objects that don't change are reused. */
export function windowAt(full: Dataset, r: Replay, t: number): Dataset {
  const pitches: Pitch[] = [];
  for (const p of full.pitches) {
    if (!(p.atMs <= t)) continue;
    const age = t - p.atMs;
    let q = p;
    if (q.play && age < PLAY_DELAY_MS) q = { ...q, play: undefined };
    if (q.cloud && age < CLOUD_DONE_MS) q = { ...q, cloud: stagedCloud(q.cloud, age) };
    pitches.push(q);
  }
  const status = full.status.filter((m) => m.atMs <= t).map((m) => {
    // real times drive replay, so the demo-only appearsAfterSec delay doesn't apply
    const future = m.clearedAtMs !== undefined && m.clearedAtMs > t;
    return future || m.appearsAfterSec ? { ...m, appearsAfterSec: undefined, ...(future ? { clearedAt: undefined, clearedAtMs: undefined } : {}) } : m;
  });
  return { ...full, game: { ...full.game, gameMode: gameModeAt(r, full.game.gameMode, t) }, pitches, status };
}

/**
 * A summary of what `windowAt` would show at `t`. The store only republishes the dataset when this
 * changes, so the views and the engine re-run on events (a pitch, a message, a clear, a cloud step),
 * not on every tick.
 */
export function windowKey(full: Dataset, r: Replay, t: number): string {
  let n = 0, play = 0, cloud = '';
  for (const p of full.pitches) {
    if (!(p.atMs <= t)) continue;
    n++;
    const age = t - p.atMs;
    if (p.play && age >= PLAY_DELAY_MS) play++;
    if (p.cloud && age < CLOUD_DONE_MS) cloud += `${p.num}:${CLOUD_KEYS.map((_, k) => cloudStage(age, k)?.[0] ?? '-').join('')},`;
  }
  let msgs = 0, clears = 0;
  for (const m of full.status) {
    if (m.atMs <= t) msgs++;
    if (m.clearedAtMs !== undefined && m.clearedAtMs <= t) clears++;
  }
  return `${gameModeAt(r, full.game.gameMode, t)}|${n}|${play}|${msgs}|${clears}|${cloud}`;
}
