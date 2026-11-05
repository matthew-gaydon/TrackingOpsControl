/**
 * Alert ledger: gives the engine's conditions a lifecycle.
 *
 * The engine says what is wrong *now*. The ledger remembers every *occurrence* of a problem:
 *   raised → (cleared) → acknowledged
 *
 * Rules (from the brief: "nothing disappears on its own", "every notable alert must be acknowledged"):
 *  - A condition with no live occurrence raises a new one.
 *  - A condition that stops being reported is marked cleared. It stays in the open list until acknowledged.
 *  - A cleared, unacknowledged occurrence whose condition comes back is reopened (no duplicate).
 *  - A cleared, acknowledged occurrence whose condition comes back raises a NEW occurrence.
 *  - An acknowledged, still-live alert that gains a member (another camera below full rate,
 *    another cloud task failed, …) raises a NEW occurrence; the old one is marked replaced.
 *  - Acknowledging is per occurrence, so it never hides a later problem.
 *
 * Pure functions only: the store holds the ledger and calls these. When the real backend arrives,
 * this is the piece that should move server-side, so Main and Backup BMCC see the same acknowledgements.
 */
import type { Condition } from './engine';
import { fmtClock, fmtDuration } from '../data/time';

export interface Occurrence {
  /** Unique per occurrence: `<key>#<n>`. Acknowledgements, notifications and "Take me there" use this. */
  id: string;
  key: string;
  /** Latest snapshot of the condition (text, members, route). */
  c: Condition;
  /** When the ledger first saw it (dataset clock, ms). */
  raisedAt: number;
  /** When the problem started, if known. null = it was already happening when the ledger started. */
  startedAt: number | null;
  clearedAt?: number;
  /** Set when this occurrence was replaced by a newer one (it grew after being acknowledged). */
  replacedBy?: string;
  ackedAt?: number;
  /** Members at the time of acknowledgement, to spot new ones. */
  ackedMembers?: string[];
}

const same = (a: Condition, b: Condition) => JSON.stringify(a) === JSON.stringify(b);
const grew = (now?: string[], acked?: string[]) => !!now && now.some((m) => !(acked ?? []).includes(m));

/**
 * Merge the engine's current conditions into the ledger.
 * Returns `prev` unchanged (same reference) when nothing changed, so the store doesn't re-render.
 * `firstRun`: conditions already present when the app starts have an unknown start time.
 */
export function reconcile(prev: Occurrence[], conds: Condition[], now: number, firstRun = false): Occurrence[] {
  const next = prev.slice();
  let changed = false;
  const latest = new Map<string, number>();
  next.forEach((o, i) => latest.set(o.key, i));
  const count = new Map<string, number>();
  next.forEach((o) => count.set(o.key, (count.get(o.key) ?? 0) + 1));

  const raise = (c: Condition, known: boolean) => {
    const n = (count.get(c.key) ?? 0) + 1;
    count.set(c.key, n);
    const o: Occurrence = { id: `${c.key}#${n}`, key: c.key, c, raisedAt: now, startedAt: c.startedAt ?? (known ? now : null), clearedAt: c.clearedAt };
    next.push(o);
    latest.set(c.key, next.length - 1);
    changed = true;
    return o;
  };

  const seen = new Set<string>();
  for (const c of conds) {
    seen.add(c.key);
    const i = latest.get(c.key);
    if (i === undefined) { raise(c, !firstRun); continue; }
    const o = next[i];
    const live = o.clearedAt === undefined;

    if (live || c.clearedAt !== undefined) {
      // the same occurrence: either still live, or a source-cleared message we already hold
      if (live && o.ackedAt !== undefined && grew(c.members, o.ackedMembers)) {
        const fresh = raise(c, true);
        next[i] = { ...o, clearedAt: now, replacedBy: fresh.id };
        continue;
      }
      const clearedAt = c.clearedAt ?? o.clearedAt;
      if (!same(o.c, c) || clearedAt !== o.clearedAt) { next[i] = { ...o, c, clearedAt }; changed = true; }
      continue;
    }
    // it had cleared and is back
    if (o.ackedAt === undefined) { next[i] = { ...o, c, clearedAt: undefined }; changed = true; }
    else raise(c, true);
  }

  next.forEach((o, i) => {
    if (o.clearedAt === undefined && !seen.has(o.key)) { next[i] = { ...o, clearedAt: now }; changed = true; }
  });
  return changed ? next : prev;
}

/** Acknowledge one occurrence. */
export function acknowledge(prev: Occurrence[], id: string, now: number): Occurrence[] {
  return prev.map((o) => (o.id === id && o.ackedAt === undefined ? { ...o, ackedAt: now, ackedMembers: o.c.members } : o));
}

/** What the views read: the condition plus its lifecycle. */
export interface Alert extends Omit<Condition, 'startedAt' | 'clearedAt'> {
  id: string;
  cleared: boolean;
  acked: boolean;
  replaced: boolean;
  /** "Active · 3m 12s", "Cleared · lasted 1m 50s at 04:49", … */
  when: string;
  raisedAt: number; startedAt: number | null; clearedAt?: number; ackedAt?: number;
}

export function toAlert(o: Occurrence, now: number): Alert {
  const { startedAt: _s, clearedAt: _c, ...c } = o.c;
  const when = o.replacedBy ? `Replaced by a newer alert at ${fmtClock(o.clearedAt!).slice(0, 5)}`
    : o.clearedAt !== undefined ? (o.startedAt !== null ? `Cleared · lasted ${fmtDuration((o.clearedAt - o.startedAt) / 1000)} at ${fmtClock(o.clearedAt).slice(0, 5)}` : `Cleared at ${fmtClock(o.clearedAt).slice(0, 5)}`)
    : o.startedAt !== null ? `Active · ${fmtDuration((now - o.startedAt) / 1000)}` : 'Active';
  return {
    ...c, id: o.id, cleared: o.clearedAt !== undefined, acked: o.ackedAt !== undefined, replaced: !!o.replacedBy, when,
    raisedAt: o.raisedAt, startedAt: o.startedAt, clearedAt: o.clearedAt, ackedAt: o.ackedAt,
  };
}
