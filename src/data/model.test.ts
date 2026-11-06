import { describe, expect, it } from 'vitest';
import { DEFAULT_THRESHOLDS, type Dataset, type PitchFile } from './types';
import { pitchWorst, reviewable, strikeZone, szParts, taskState, taskStatus, taskValue, type PpOps } from './model';
import type { CameraFile } from './types';
import { deriveConditions } from '../alerts/engine';

const pitch = (num: number, spin: PitchFile['pp']['spin']): PitchFile => ({
  num, time: '05:00:00', confidence: 9, trackLength: 10, trackQuality: 6, acs: 'success', strikeZone: {},
  pp: { release: { status: 'success', mph: 95 }, spin, trackpac: { status: 'valid' } },
  cloud: { trackpac: 'uploaded', bat: 'success', pitcherBiomech: 'success', batterBiomech: 'success' },
});
const ops = (o: Partial<PpOps> = {}): PpOps => ({ reviewed: {}, queue: [], done: {}, spinReview: 0.25, ...o });

describe('spin review', () => {
  const over = pitch(25, { status: 'success', rpm: 2592, fitError: 0.27 });
  const overFailed = pitch(26, { status: 'failed', rpm: 2500, fitError: 0.3 });
  const noResult = pitch(27, { status: 'failed' });
  const fine = pitch(28, { status: 'success', rpm: 2400, fitError: 0.1 });

  it('flags a spin over the review line as needing review, even when reported a success', () => {
    expect(taskState(over, 1, ops())).toBe('warn');
    expect(taskStatus(over, 1, ops())).toBe('Needs review');
    expect(taskValue(over, 1, ops())).toBe('RPM 2592 · err 0.27');
    expect(pitchWorst(over, ops())).toBe('warn');            // so it shows under "Needs review"
  });

  it('treats a failed spin with a result over the line as reviewable', () => {
    expect(reviewable(overFailed, 1, ops())).toBe(true);
    expect(taskStatus(overFailed, 1, ops())).toBe('Needs review');
  });

  it('keeps a spin with no result as failed, reprocess only', () => {
    expect(reviewable(noResult, 1, ops())).toBe(false);
    expect(taskStatus(noResult, 1, ops())).toBe('Failed');
  });

  it('leaves a spin under the line alone', () => {
    expect(taskState(fine, 1, ops())).toBe('ok');
  });

  it('shows the result with "reviewed" once marked reviewed', () => {
    const o = ops({ reviewed: { '25:1': true } });
    expect(taskState(over, 1, o)).toBe('reviewed');
    expect(taskValue(over, 1, o)).toBe('RPM 2592 · err 0.27 · reviewed');
    expect(pitchWorst(over, o)).toBe('ok');
  });

  it('drops reviewed and reprocessed pitches from the spin alert', () => {
    const ds = {
      name: 't', base: '', nowMs: 0, cameras: [], status: [], thresholds: DEFAULT_THRESHOLDS,
      game: { gameMode: 'PRACTICE', session: 'in', redundancy: { bdsConnected: true }, timing: { latencyMs: 0, tssOffsetMs: 0 } },
      pitches: [over, overFailed].map((p) => ({ ...p, atMs: 0 })),
    } as unknown as Dataset;
    const spin = (pp: PpOps) => deriveConditions({ ds, session: 'in', elapsedSec: 0, pp, cloud: { retried: {}, done: {} } }).find((c) => c.key === 'spin');
    expect(spin(ops())?.members).toEqual(['25', '26']);
    expect(spin(ops({ reviewed: { '25:1': true } }))?.members).toEqual(['26']);
    expect(spin(ops({ reviewed: { '25:1': true }, done: { '26:1': true } }))).toBeUndefined();
  });
});

describe('strike zone', () => {
  it('splits X and Z and picks the axis furthest from zero', () => {
    expect(szParts({ x: 0.007, z: -0.002 })).toEqual({ x: 0.007, z: -0.002, worst: 0.007 });
    expect(szParts({ x: 0.001, z: -0.006 }).worst).toBe(-0.006);
  });
  it('reads an older single-number delta as the worse axis', () => {
    expect(szParts(0.004)).toEqual({ x: null, z: null, worst: 0.004 });
  });
  it('treats missing data as no data', () => {
    expect(szParts(null).worst).toBeNull();
    expect(szParts(undefined).worst).toBeNull();
  });
});

describe('strike zone contributions', () => {
  const cam = (id: string, group: CameraFile['group'], running = true): CameraFile => ({ id, group, number: 1, running, fps: 600 });
  const cameras = [cam('P1', 'pitchToPlate'), cam('P2', 'pitchToPlate'), cam('P3', 'pitchToPlate', false), cam('F1', 'fullField'), cam('F2', 'fullField')];
  const ds = {
    name: 't', base: '', nowMs: 0, cameras, status: [], thresholds: DEFAULT_THRESHOLDS,
    game: { gameMode: 'PRACTICE', session: 'in', redundancy: { bdsConnected: true }, timing: { latencyMs: 0, tssOffsetMs: 0 } },
    pitches: [
      { ...pitch(1, { status: 'success' }), atMs: 0, strikeZone: { P1: { x: 0, z: 0 }, P2: null, P3: null, F1: null, F2: { x: 0.001, z: 0 } } },
      { ...pitch(2, { status: 'success' }), atMs: 0, strikeZone: { P1: { x: 0, z: 0 }, P2: { x: 0, z: 0 }, P3: null, F1: null, F2: { x: 0.009, z: 0 } } },
    ],
  } as unknown as Dataset;
  const conds = () => deriveConditions({ ds, session: 'in', elapsedSec: 0, pp: ops(), cloud: { retried: {}, done: {} } });

  it('greys out a FullField camera with no value, but flags a PitchToPlate camera', () => {
    const z = Object.fromEntries(strikeZone(ds.pitches[0], ds).map((x) => [x.cam.id, x.state]));
    expect(z).toEqual({ P1: 'ok', P2: 'crit', P3: 'crit', F1: 'none', F2: 'ok' });
    expect(strikeZone(ds.pitches[1], ds).find((x) => x.cam.id === 'F2')?.state).toBe('warn');
  });

  it('raises one alert for running PitchToPlate cameras missing from the strike zone', () => {
    const a = conds().find((c) => c.key === 'sz-p2p');
    expect(a?.members).toEqual(['P2']);                 // P3 isn't running: it has its own alert
    expect(a?.summary).toContain('1 pitch (latest 1)');
  });
});
