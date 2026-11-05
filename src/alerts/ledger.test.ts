import { describe, expect, it } from 'vitest';
import type { Condition } from './engine';
import { acknowledge, alertWhen, reconcile, toAlert, type Occurrence } from './ledger';

const when = (o: Occurrence, now: number) => alertWhen(toAlert(o), now);

const T0 = Date.parse('2026-11-04T05:00:00Z');
const sec = (n: number) => T0 + n * 1000;

const cond = (key: string, extra: Partial<Condition> = {}): Condition => ({
  key, sev: 'warn', title: key, summary: '', checks: [], where: '', route: { view: 'game' }, line: '', notify: false, ...extra,
});
const fps = (...cams: string[]) => cond('fps', { title: `${cams.length} below full rate`, members: cams });
const open = (l: Occurrence[]) => l.filter((o) => o.ackedAt === undefined);
const ackKey = (l: Occurrence[], key: string, t: number) => acknowledge(l, l.filter((o) => o.key === key).at(-1)!.id, t);

describe('reconcile', () => {
  it('raises a new occurrence for a new condition', () => {
    const l = reconcile([], [cond('bds')], sec(0));
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ id: 'bds#1', key: 'bds', startedAt: sec(0) });
    expect(l[0].clearedAt).toBeUndefined();
  });

  it('marks conditions present at start as having an unknown start time', () => {
    const l = reconcile([], [cond('bds')], sec(0), true);
    expect(l[0].startedAt).toBeNull();
    expect(when(l[0], sec(30))).toBe('Active');
  });

  it('returns the same array when nothing changed', () => {
    const l = reconcile([], [cond('bds')], sec(0));
    expect(reconcile(l, [cond('bds')], sec(5))).toBe(l);
  });

  it('keeps a condition that went away, as cleared and still open', () => {
    let l = reconcile([], [cond('bds')], sec(0));
    l = reconcile(l, [], sec(40));
    expect(l).toHaveLength(1);
    expect(l[0].clearedAt).toBe(sec(40));
    expect(open(l)).toHaveLength(1);
    expect(when(l[0], sec(60))).toBe('Cleared · lasted 40 s at 05:00');
  });

  it('reopens a cleared, unacknowledged occurrence instead of duplicating it', () => {
    let l = reconcile([], [cond('bds')], sec(0));
    l = reconcile(l, [], sec(10));
    l = reconcile(l, [cond('bds')], sec(20));
    expect(l).toHaveLength(1);
    expect(l[0].clearedAt).toBeUndefined();
  });

  it('raises a new occurrence when an acknowledged problem comes back', () => {
    let l = reconcile([], [cond('bds')], sec(0));
    l = ackKey(l, 'bds', sec(5));
    l = reconcile(l, [], sec(10));
    l = reconcile(l, [cond('bds')], sec(20));
    expect(l.map((o) => o.id)).toEqual(['bds#1', 'bds#2']);
    expect(open(l).map((o) => o.id)).toEqual(['bds#2']);
    expect(l[1].startedAt).toBe(sec(20));
  });

  it('does not re-raise an acknowledged alert that is merely still there', () => {
    let l = reconcile([], [fps('B1', 'B2')], sec(0));
    l = ackKey(l, 'fps', sec(5));
    l = reconcile(l, [fps('B1', 'B2')], sec(10));
    expect(open(l)).toHaveLength(0);
  });

  it('does not re-raise when an acknowledged alert shrinks', () => {
    let l = reconcile([], [fps('B1', 'B2')], sec(0));
    l = ackKey(l, 'fps', sec(5));
    l = reconcile(l, [fps('B1')], sec(10));
    expect(l).toHaveLength(1);
    expect(open(l)).toHaveLength(0);
    expect(l[0].c.members).toEqual(['B1']);
  });

  it('raises again when an acknowledged alert gains a member (another camera drops)', () => {
    let l = reconcile([], [fps('B1', 'B2')], sec(0));
    l = ackKey(l, 'fps', sec(5));
    l = reconcile(l, [fps('B1', 'B2', 'B6')], sec(10));
    expect(l.map((o) => o.id)).toEqual(['fps#1', 'fps#2']);
    expect(l[0]).toMatchObject({ clearedAt: sec(10), replacedBy: 'fps#2' });
    expect(open(l).map((o) => o.id)).toEqual(['fps#2']);
    expect(when(l[0], sec(20))).toBe('Replaced by a newer alert at 05:00');
  });

  it('acknowledging one occurrence leaves later ones open', () => {
    let l = reconcile([], [fps('B1')], sec(0));
    l = ackKey(l, 'fps', sec(5));
    l = reconcile(l, [fps('B1', 'B2')], sec(10));
    l = reconcile(l, [fps('B1', 'B2')], sec(15));
    expect(open(l).map((o) => o.id)).toEqual(['fps#2']);
  });

  it('uses the source start and clear times for status messages', () => {
    const msg = cond('missing:F5@1', { startedAt: sec(-120), clearedAt: sec(-10) });
    let l = reconcile([], [msg], sec(0), true);
    expect(l[0]).toMatchObject({ startedAt: sec(-120), clearedAt: sec(-10) });
    l = reconcile(l, [msg], sec(5));
    expect(l).toHaveLength(1);
    expect(when(l[0], sec(5))).toBe('Cleared · lasted 1m 50s at 04:59');
  });

  it('records a message clearing later on the same occurrence', () => {
    let l = reconcile([], [cond('missing:P6@1', { startedAt: sec(-40) })], sec(0));
    l = reconcile(l, [cond('missing:P6@1', { startedAt: sec(-40), clearedAt: sec(30) })], sec(31));
    expect(l).toHaveLength(1);
    expect(l[0].clearedAt).toBe(sec(30));
  });
});

describe('repeat drops', () => {
  it('raises again when an acknowledged member recovers and drops again', () => {
    let l = reconcile([], [fps('B1', 'B2')], sec(0));
    l = ackKey(l, 'fps', sec(5));
    l = reconcile(l, [fps('B1')], sec(10));            // B2 recovers, B1 keeps the alert live
    expect(open(l)).toHaveLength(0);
    l = reconcile(l, [fps('B1', 'B2')], sec(20));      // B2 drops again
    expect(l.map((o) => o.id)).toEqual(['fps#1', 'fps#2']);
    expect(l[0]).toMatchObject({ replacedBy: 'fps#2', clearedAt: sec(20) });
    expect(open(l).map((o) => o.id)).toEqual(['fps#2']);
  });

  it('re-alerts an unacknowledged alert when a member drops again', () => {
    let l = reconcile([], [fps('B1', 'B2')], sec(0));
    expect(l[0].alertedAt).toBe(sec(0));
    l = reconcile(l, [fps('B1')], sec(10));
    expect(l[0].alertedAt).toBe(sec(0));               // recovering is not an alert
    l = reconcile(l, [fps('B1', 'B2')], sec(20));
    expect(l).toHaveLength(1);
    expect(l[0].alertedAt).toBe(sec(20));
  });

  it('re-alerts a cleared, unacknowledged alert that comes back', () => {
    let l = reconcile([], [cond('down:P6')], sec(0));
    l = reconcile(l, [], sec(10));
    l = reconcile(l, [cond('down:P6')], sec(20));
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ alertedAt: sec(20), clearedAt: undefined });
  });

  it('does not re-alert an alert that is merely still there', () => {
    let l = reconcile([], [fps('B1', 'B2')], sec(0));
    l = reconcile(l, [fps('B1', 'B2')], sec(10));
    expect(l[0].alertedAt).toBe(sec(0));
  });
});

describe('acknowledge', () => {
  it('records when and which members were acknowledged, once', () => {
    let l = reconcile([], [fps('B1', 'B2')], sec(0));
    l = acknowledge(l, 'fps#1', sec(5));
    l = acknowledge(l, 'fps#1', sec(9));
    expect(l[0]).toMatchObject({ ackedAt: sec(5), ackedMembers: ['B1', 'B2'] });
  });
});
