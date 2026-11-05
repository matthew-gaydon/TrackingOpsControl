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
 *    A member that drops out and comes back counts as gained, so every repeat drop is raised.
 *  - `alertedAt` moves whenever an occurrence should grab attention again (raised, reopened, or an
 *    unacknowledged alert gains a member), so a hidden notification comes back.
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
  /** Last time this occurrence should have grabbed attention: raised, reopened, or gained a member. */
  alertedAt: number;
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
/** True if `now` has a member that `before` didn't. */
const grew = (now?: string[], before?: string[]) => !!now && now.some((m) => !(before ?? []).includes(m));

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
    const o: Occurrence = { id: `${c.key}#${n}`, key: c.key, c, raisedAt: now, alertedAt: now, startedAt: c.startedAt ?? (known ? now : null), clearedAt: c.clearedAt };
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
      // a member that wasn't there at acknowledgement, or that dropped out and came back
      const gained = live && (grew(c.members, o.ackedMembers) || grew(c.members, o.c.members));
      if (gained && o.ackedAt !== undefined) {
        const fresh = raise(c, true);
        next[i] = { ...o, clearedAt: now, replacedBy: fresh.id };
        continue;
      }
      const clearedAt = c.clearedAt ?? o.clearedAt;
      const alertedAt = gained && grew(c.members, o.c.members) ? now : o.alertedAt;
      if (!same(o.c, c) || clearedAt !== o.clearedAt || alertedAt !== o.alertedAt) { next[i] = { ...o, c, clearedAt, alertedAt }; changed = true; }
      continue;
    }
    // it had cleared and is back
    if (o.ackedAt === undefined) { next[i] = { ...o, c, clearedAt: undefined, alertedAt: now }; changed = true; }
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

/**
 * What the views read: the condition plus its lifecycle. Holds no clock-dependent text, so the
 * alert list only changes when the ledger does. Durations come from `alertWhen` (see <AlertWhen>).
 */
export interface Alert extends Omit<Condition, 'startedAt' | 'clearedAt'> {
  id: string;
  cleared: boolean;
  acked: boolean;
  replaced: boolean;
  raisedAt: number; alertedAt: number; startedAt: number | null; clearedAt?: number; ackedAt?: number;
}

export function toAlert(o: Occurrence): Alert {
  const { startedAt: _s, clearedAt: _c, ...c } = o.c;
  return {
    ...c, id: o.id, cleared: o.clearedAt !== undefined, acked: o.ackedAt !== undefined, replaced: !!o.replacedBy,
    raisedAt: o.raisedAt, alertedAt: o.alertedAt, startedAt: o.startedAt, clearedAt: o.clearedAt, ackedAt: o.ackedAt,
  };
}

/** "Active · 3m 12s", "Cleared · lasted 1m 50s at 04:49", … (UTC, dataset clock). */
export function alertWhen(a: Pick<Alert, 'replaced' | 'startedAt' | 'clearedAt'>, now: number): string {
  const hm = (ms: number) => fmtClock(ms).slice(0, 5);
  if (a.replaced) return `Replaced by a newer alert at ${hm(a.clearedAt!)}`;
  if (a.clearedAt !== undefined) {
    return a.startedAt !== null ? `Cleared · lasted ${fmtDuration((a.clearedAt - a.startedAt) / 1000)} at ${hm(a.clearedAt)}` : `Cleared at ${hm(a.clearedAt)}`;
  }
  return a.startedAt !== null ? `Active · ${fmtDuration((now - a.startedAt) / 1000)}` : 'Active';
}
