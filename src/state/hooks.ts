import { useEffect, useMemo } from 'react';
import { useUi } from './store';
import { deriveConditions, RANK, type Severity } from '../alerts/engine';
import { toAlert, type Alert } from '../alerts/ledger';
import type { CloudOps, PpOps } from '../data/model';
import type { Dataset } from '../data/types';

export function useDs(): Dataset {
  const ds = useUi((s) => s.ds);
  if (!ds) throw new Error('Dataset not loaded');
  return ds;
}
export function usePpOps(): PpOps {
  const reviewed = useUi((s) => s.reviewed), queue = useUi((s) => s.ppQueue), done = useUi((s) => s.ppDone);
  return useMemo(() => ({ reviewed, queue, done }), [reviewed, queue, done]);
}
export function useCloudOps(): CloudOps {
  const retried = useUi((s) => s.cloudRetried), done = useUi((s) => s.cloudDone);
  return useMemo(() => ({ retried, done }), [retried, done]);
}
export function useSession() {
  const ds = useDs();
  const o = useUi((s) => s.session);
  return o ?? ds.game.session;
}

/**
 * Runs the alert engine and feeds the ledger. Mount once (App). The engine runs only when its
 * inputs change, not once per component that shows alerts.
 */
export function useAlertSync() {
  const ds = useDs();
  const session = useSession();
  const pp = usePpOps(), cloud = useCloudOps();
  const elapsed = useUi((s) => s.elapsedSec);
  // only re-derive when an appearsAfterSec threshold could have been crossed
  const gate = ds.status.filter((m) => m.appearsAfterSec && elapsed >= m.appearsAfterSec).length;
  useEffect(() => {
    useUi.getState().syncAlerts(deriveConditions({ ds, session, elapsedSec: useUi.getState().elapsedSec, pp, cloud }));
  }, [ds, session, gate, pp, cloud]);
}

export interface AlertState {
  /** Every occurrence, newest last. */
  all: Alert[];
  /** Not yet acknowledged: live first, then cleared; worst severity first. */
  open: Alert[];
  /** Acknowledged, most recent first. */
  done: Alert[];
  byId: Record<string, Alert>;
  /** Latest occurrence for a condition key ("bds", "spin", "fps", …). */
  byKey: Record<string, Alert>;
  worst: Severity | null; liveCrit: boolean; focus: Alert | null;
  countFor: (view: string) => { n: number; worst: Severity | null };
}

export function useAlerts(): AlertState {
  const ds = useDs();
  const ledger = useUi((s) => s.ledger);
  const elapsed = useUi((s) => s.elapsedSec);
  const dev = useUi((s) => s.dev), focusId = useUi((s) => s.focusAlertId);
  return useMemo(() => {
    const now = ds.nowMs + elapsed * 1000;
    const all = ledger.map((o) => toAlert(o, now));
    const present = all.filter((a) => a.sev !== 'dev' || dev);
    const open = present.filter((a) => !a.acked).sort((x, y) => Number(x.cleared) - Number(y.cleared) || RANK[y.sev] - RANK[x.sev]);
    const done = present.filter((a) => a.acked).sort((x, y) => (y.ackedAt ?? 0) - (x.ackedAt ?? 0));
    const byId: Record<string, Alert> = {}, byKey: Record<string, Alert> = {};
    all.forEach((a, i) => { byId[a.id] = a; byKey[ledger[i].key] = a; });
    const real = open.filter((a) => a.sev !== 'dev');
    const worstOf = (xs: Alert[]) => xs.reduce<Severity | null>((w, a) => (!w || RANK[a.sev] > RANK[w] ? a.sev : w), null);
    return {
      all, open, done, byId, byKey, worst: worstOf(real), liveCrit: real.some((a) => a.sev === 'crit' && !a.cleared),
      focus: focusId ? byId[focusId] ?? null : null,
      countFor: (view) => { const xs = real.filter((a) => a.route.view === view); return { n: xs.length, worst: worstOf(xs) }; },
    };
  }, [ds, ledger, elapsed, dev, focusId]);
}
