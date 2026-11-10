import { describe, expect, it } from 'vitest';
import { CLOUD_QUEUED_MS, gameModeAt, gameStartOf, makeReplay, nextPitchAt, PLAY_DELAY_MS, replayClock, replayParams, retime, TAIL_MS, windowAt, windowKey } from './replay';
import { DEFAULT_THRESHOLDS, type Dataset, type Pitch } from './types';

const T0 = Date.parse('2026-11-03T01:30:00Z');
const MIN = 60_000;
const pitch = (num: number, atMs: number, extra: Partial<Pitch> = {}): Pitch => ({
  num, atMs, time: '', pp: { release: { status: 'success' }, spin: { status: 'success' }, trackpac: { status: 'valid' } }, ...extra,
});
const cloud = { trackpac: 'uploaded', bat: 'success', pitcherBiomech: 'failed', batterBiomech: 'success' } as const;

function dataset(over: Partial<Dataset> = {}): Dataset {
  return {
    name: 't', base: '', nowMs: T0 + 30 * MIN, cameras: [], thresholds: DEFAULT_THRESHOLDS,
    game: { venue: '', gamePk: null, sessionId: 's', gameMode: 'LIVE', session: 'in', now: '', redundancy: { role: 'MAIN', btcConnected: true, bdsConnected: true, peers: 1 }, timing: { latencyMs: 0, tssOffsetMs: 0 } },
    pitches: [
      pitch(1, T0 + 2 * MIN, { play: { call: 'BallCalled' }, cloud: { ...cloud } }),
      pitch(2, T0 + 3 * MIN, { cloud: { ...cloud } }),
      pitch(3, T0 + 4 * MIN),
    ],
    status: [
      { id: 'm0', at: '', atMs: T0 - 30 * MIN, level: 'Warning', source: 'BMCC', text: 'before' },
      { id: 'm1', at: '', atMs: T0 + 2.5 * MIN, clearedAtMs: T0 + 3.5 * MIN, level: 'ERROR', source: 'BMCC', text: 'during', appearsAfterSec: 8 },
    ],
    ...over,
  };
}

describe('replay options', () => {
  it('reads replay, lead and speed from the URL', () => {
    expect(replayParams('?data=demo')).toBeNull();
    expect(replayParams('?data=demo&replay=1')).toEqual({ leadMin: 10, speed: 1 });
    expect(replayParams('?replay=1&lead=4&speed=10')).toEqual({ leadMin: 4, speed: 10 });
    expect(replayParams('?replay=1&speed=7')?.speed).toBe(1);
  });
});

describe('game start', () => {
  it('prefers game.start, then the session start, then the first pitch', () => {
    const ds = dataset();
    expect(gameStartOf(ds)).toBe(T0 + 2 * MIN);
    expect(gameStartOf(ds, '2026-11-03T01:30:00Z')).toBe(T0);
    expect(gameStartOf(dataset({ game: { ...ds.game, start: '2026-11-03T01:31:00Z' } }), '2026-11-03T01:30:00Z')).toBe(T0 + MIN);
  });
  it('ignores a start after the first pitch or long before it (sample data from another day)', () => {
    expect(gameStartOf(dataset(), '2026-11-03T01:40:00Z')).toBe(T0 + 2 * MIN);
    expect(gameStartOf(dataset(), '2026-10-30T19:00:00Z')).toBe(T0 + 2 * MIN);
  });
});

describe('replay clock', () => {
  const r = makeReplay(dataset(), { leadMin: 10, speed: 1 }, 1000, '2026-11-03T01:30:00Z');
  it('starts the lead before game start and ends a little after the last event', () => {
    expect(r.startMs).toBe(T0 - 10 * MIN);
    expect(r.endMs).toBe(T0 + 4 * MIN + TAIL_MS);
    expect(replayClock(r, 1000)).toBe(r.startMs);
  });
  it('runs at its speed and stays continuous across speed changes and pauses', () => {
    const fast = retime(r, 2000, { speed: 10 });
    expect(replayClock(fast, 2000)).toBe(r.startMs + 1000);
    expect(replayClock(fast, 3000)).toBe(r.startMs + 11_000);
    const paused = retime(fast, 3000, { paused: true });
    expect(replayClock(paused, 99_000)).toBe(r.startMs + 11_000);
    expect(replayClock(retime(paused, 99_000, { paused: false }), 100_000)).toBe(r.startMs + 21_000);
  });
  it('stops at the end and clamps jumps to the range', () => {
    expect(replayClock(r, 1000 + 10 * 3600_000)).toBe(r.endMs);
    expect(replayClock(retime(r, 0, { to: r.startMs - 5 * MIN }), 0)).toBe(r.startMs);
  });
  it('jumps to just before the next pitch', () => {
    expect(nextPitchAt(dataset(), r.startMs)).toBe(T0 + 2 * MIN - 3000);
    expect(nextPitchAt(dataset(), T0 + 2 * MIN - 3000)).toBe(T0 + 3 * MIN - 3000);
    expect(nextPitchAt(dataset(), T0 + 4 * MIN)).toBeNull();
  });
});

describe('game mode', () => {
  const r = makeReplay(dataset(), { leadMin: 10, speed: 1 }, 0, '2026-11-03T01:30:00Z');
  it('is batting practice, then warmup for the last 2 minutes, then LIVE at game start', () => {
    expect(gameModeAt(r, 'LIVE', T0 - 10 * MIN)).toBe('BATTING PRACTICE');
    expect(gameModeAt(r, 'LIVE', T0 - 2 * MIN - 1)).toBe('BATTING PRACTICE');
    expect(gameModeAt(r, 'LIVE', T0 - 2 * MIN)).toBe('WARMUP');
    expect(gameModeAt(r, 'LIVE', T0 - 1)).toBe('WARMUP');
    expect(gameModeAt(r, 'LIVE', T0)).toBe('LIVE');
  });
  it('keeps a mode that was not recorded LIVE', () => {
    expect(gameModeAt(r, 'PRACTICE', T0 - 5 * MIN)).toBe('PRACTICE');
  });
});

describe('windowAt', () => {
  const ds = dataset();
  const r = makeReplay(ds, { leadMin: 10, speed: 1 }, 0, '2026-11-03T01:30:00Z');
  const at = (t: number) => windowAt(ds, r, t);

  it('holds only what has happened by now', () => {
    const w = at(T0);
    expect(w.pitches).toHaveLength(0);
    expect(w.status.map((m) => m.id)).toEqual(['m0']);
    expect(w.game.gameMode).toBe('LIVE');
    expect(at(T0 + 2 * MIN).pitches.map((p) => p.num)).toEqual([1]);
    expect(at(T0 + 4 * MIN).pitches).toHaveLength(3);
  });

  it('keeps a message live until its clear time, and drops the demo-only delay', () => {
    const live = at(T0 + 3 * MIN).status.find((m) => m.id === 'm1')!;
    expect(live.clearedAtMs).toBeUndefined();
    expect(live.appearsAfterSec).toBeUndefined();
    expect(at(T0 + 3.5 * MIN).status.find((m) => m.id === 'm1')!.clearedAtMs).toBe(T0 + 3.5 * MIN);
  });

  it('holds play data back for a few seconds after the pitch', () => {
    expect(at(T0 + 2 * MIN + PLAY_DELAY_MS - 1).pitches[0].play).toBeUndefined();
    expect(at(T0 + 2 * MIN + PLAY_DELAY_MS).pitches[0].play).toEqual({ call: 'BallCalled' });
  });

  it('steps cloud tasks queued → processing → recorded result', () => {
    const c = (age: number) => at(T0 + 2 * MIN + age).pitches[0].cloud!;
    expect(c(0)).toEqual({ trackpac: 'queued', bat: 'queued', pitcherBiomech: 'queued', batterBiomech: 'queued' });
    expect(c(CLOUD_QUEUED_MS).trackpac).toBe('processing');
    expect(c(8_000)).toEqual({ trackpac: 'uploaded', bat: 'processing', pitcherBiomech: 'processing', batterBiomech: 'processing' });
    expect(c(20_000)).toEqual(cloud);
  });

  it('reuses pitch objects that did not change', () => {
    expect(at(T0 + 10 * MIN).pitches[2]).toBe(ds.pitches[2]);
  });
});

describe('windowKey', () => {
  const ds = dataset();
  const r = makeReplay(ds, { leadMin: 10, speed: 1 }, 0, '2026-11-03T01:30:00Z');
  const key = (t: number) => windowKey(ds, r, t);
  it('changes on events, not on every tick', () => {
    expect(key(T0 - 9 * MIN)).toBe(key(T0 - 5 * MIN));
    expect(key(T0 - 5 * MIN)).not.toBe(key(T0 - MIN));                 // warmup
    expect(key(T0 - MIN)).not.toBe(key(T0));                           // LIVE
    expect(key(T0 + 2 * MIN - 1)).not.toBe(key(T0 + 2 * MIN));         // pitch
    expect(key(T0 + 2 * MIN + 1000)).not.toBe(key(T0 + 2 * MIN + PLAY_DELAY_MS)); // play + cloud step
    expect(key(T0 + 3.5 * MIN - 1)).not.toBe(key(T0 + 3.5 * MIN));     // clear
    expect(key(T0 + 5 * MIN)).toBe(key(T0 + 5 * MIN + 30_000));
  });
});
