import { describe, expect, it } from 'vitest';
import { clockSec, fmtClock, resolveNow, resolveTime } from './time';

const at = (iso: string) => Date.parse(iso);

describe('resolveNow', () => {
  it('reads a full timestamp, taking a missing zone as UTC', () => {
    expect(resolveNow('2026-11-04T05:10:14Z')).toBe(at('2026-11-04T05:10:14Z'));
    expect(resolveNow('2026-11-04T05:10:14')).toBe(at('2026-11-04T05:10:14Z'));
    expect(resolveNow('2026-11-04 05:10:14+01:00')).toBe(at('2026-11-04T04:10:14Z'));
  });
  it('reads a clock time with game.date', () => {
    expect(resolveNow('05:10:14', '2026-11-04')).toBe(at('2026-11-04T05:10:14Z'));
  });
  it('fails loudly on nonsense', () => {
    expect(() => resolveNow('soon')).toThrow();
    expect(() => resolveNow('05:10:14', 'Nov 4')).toThrow();
  });
});

describe('resolveTime', () => {
  const now = at('2026-11-04T00:40:00Z'); // 7:40 pm ET game, 40 minutes past UTC midnight

  it('puts clock times before midnight on the previous day', () => {
    expect(resolveTime('23:58:10', now)).toBe(at('2026-11-03T23:58:10Z'));
    expect(resolveTime('23-58-10.250', now)).toBe(at('2026-11-03T23:58:10.250Z'));
  });
  it('puts clock times after midnight on the same day', () => {
    expect(resolveTime('00:12:00', now)).toBe(at('2026-11-04T00:12:00Z'));
  });
  it('keeps a time a few seconds after now on the same day', () => {
    expect(resolveTime('00:40:30', now)).toBe(at('2026-11-04T00:40:30Z'));
  });
  it('orders a game that crosses midnight correctly', () => {
    const times = ['23:50:00', '23:59:59', '00:00:01', '00:30:00'].map((t) => resolveTime(t, now));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
  it('passes full timestamps straight through', () => {
    expect(resolveTime('2026-11-03T23:58:10Z', now)).toBe(at('2026-11-03T23:58:10Z'));
  });
  it('gives NaN for unreadable times', () => {
    expect(resolveTime('later', now)).toBeNaN();
  });
});

describe('clock helpers', () => {
  it('parses BMCC and plain clocks', () => {
    expect(clockSec('05-09-23.565')).toBeCloseTo(5 * 3600 + 9 * 60 + 23.565);
    expect(clockSec('05:09:23')).toBe(5 * 3600 + 9 * 60 + 23);
  });
  it('formats in UTC', () => {
    expect(fmtClock(at('2026-11-03T23:58:10.250Z'), true)).toBe('23:58:10.250');
  });
});
