import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { CameraSettings, Dataset, SessionMode } from '../data/types';
import type { Condition, Route } from '../alerts/engine';
import { acknowledge, reconcile, type Alert, type Occurrence } from '../alerts/ledger';

export type View = 'game' | 'cameras' | 'pitches' | 'pp' | 'cloud';
export type FlowStage = 'idle' | 'setup' | 'live' | 'ended';
export interface Zoom { s: number; x: number; y: number }
export interface MenuPos { x: number; y: number; task: number | null }

export interface UiState {
  ds: Dataset | null;
  loadError: string | null;
  /** Wall-clock time the dataset loaded. The dataset clock runs from game.now at this moment. */
  loadedAt: number;
  /** Whole seconds since load; ticks once a second. Use it to re-render, but read time from clockMs / useNow. */
  elapsedSec: number;

  // shell + alerts
  view: View;
  prevView: View | null;
  focusAlertId: string | null;
  crumbPitch: number | null;          // "Back to Game · Pitch N" after a pitch-card jump
  crumbView: 'game' | 'pitches';      // which view that pitch card was on
  drawer: boolean;
  drawerTab: 'open' | 'done';
  dev: boolean;
  /** Every alert occurrence seen this session, with its lifecycle. See src/alerts/ledger.ts. */
  ledger: Occurrence[];
  ledgerReady: boolean;
  dismissed: Record<string, true>;    // toasts hidden (does not acknowledge), by occurrence id
  /** Alert checklist ticks, by `<occurrence id>|<check>`. Guidance only: acknowledging doesn't require them. */
  checked: Record<string, true>;
  session: SessionMode | null;        // operator override of game.session
  /**
   * Game flow: Start Setup → Pre-Game Setup → Live Tracking → Tracking Ended.
   * `at` holds when each stage began (dataset clock). Starting Live Tracking goes In session;
   * ending it goes Out. The other stages will drive system actions later.
   */
  flow: { stage: FlowStage; at: Partial<Record<FlowStage, number>> };
  flowConfirmEnd: boolean;
  idsOpen: boolean;

  // game
  gameSel: number | null;             // pitch number; null = live (latest)
  // Pitches tab (its own selection and camera panel, so browsing there doesn't move the Game view)
  pitchSel: number | null;            // null = latest
  pitFilter: 'all' | 'flagged' | 'red';
  pitView: 'pitchToPlate' | 'fullField' | 'biomechanics';
  pitImg: 'mosaic' | 'hit';
  pitBig: string | null;
  fieldView: 'combined' | 'pitchToPlate' | 'fullField' | 'biomechanics';
  imgMode: 'mosaic' | 'hit';
  bigCam: string | null;
  lastHitOverlay: boolean;
  szAll: boolean;
  pop: string | null;

  // cameras
  cam: string;
  camTab: 'mosaic' | 'hit' | 'tracking' | 'still';
  camFilter: 'all' | 'problems' | 'pitchToPlate' | 'fullField' | 'biomechanics';
  camSub: 'monitor' | 'control';
  ctrlTab: 'image' | 'ball' | 'calib';
  ctlSaved: Record<string, Partial<CameraSettings>>;
  ctlLive: Record<string, Partial<CameraSettings>>;
  nudgeOn: Record<string, boolean>;
  nudgeStep: 'fine' | 'normal' | 'coarse';
  overlays: { cal: boolean; ball: boolean };
  clickPts: boolean;
  pickPt: string | null;
  moveMsg: { cam: string; text: string } | null;
  resetOpen: boolean;
  bmcaNote: boolean;
  lensRestart: string | null;

  // post-processing
  ppFilter: 'all' | 'flag' | 'affected';
  ppAffected: number[];
  ppSel: number | null;
  ppPicks: Record<number, true>;
  ppTask: number | null;
  ppMenu: MenuPos | null;
  reviewed: Record<string, true>;
  ppQueue: string[];
  ppDone: Record<string, true>;

  // cloud
  cloudFilter: 'all' | 'failed' | 'open';
  cloudPicks: Record<number, true>;
  cloudAnchor: number | null;
  clMenu: MenuPos | null;
  cloudRetried: Record<string, number>;
  cloudDone: Record<string, true>;

  zoom: Record<string, Zoom>;

  set: (p: Partial<UiState> | ((s: UiState) => Partial<UiState>)) => void;
  goTo: (a: Alert) => void;
  /** Acknowledge one alert occurrence. */
  ack: (id: string) => void;
  /** Acknowledge every open occurrence whose condition key matches (used by one-click fixes). */
  ackKeys: (match: (key: string) => boolean) => void;
  /** Feed the engine's current conditions into the ledger. */
  syncAlerts: (conds: Condition[]) => void;
}

/**
 * THE dataset clock (UTC ms): game.now plus the time since the dataset loaded. Every "now" in the
 * app (header clock, alert durations, ledger timestamps) comes from here, so a replay clock only
 * has to change this function.
 */
export function clockMs(s: Pick<UiState, 'ds' | 'loadedAt'>): number {
  return s.ds ? s.ds.nowMs + (Date.now() - s.loadedAt) : Date.now();
}

export const useUi = create<UiState>((set, get) => ({
  ds: null, loadError: null, loadedAt: Date.now(), elapsedSec: 0,
  view: 'game', prevView: null, focusAlertId: null, crumbPitch: null, crumbView: 'game', drawer: false, drawerTab: 'open', dev: false,
  ledger: [], ledgerReady: false, dismissed: {}, checked: {}, session: null, idsOpen: false, flow: { stage: 'idle', at: {} }, flowConfirmEnd: false,
  gameSel: null, pitchSel: null, pitFilter: 'all', pitView: 'pitchToPlate', pitImg: 'mosaic', pitBig: null, fieldView: 'combined', imgMode: 'mosaic', bigCam: null, lastHitOverlay: false, szAll: false, pop: null,
  cam: 'P1', camTab: 'mosaic', camFilter: 'all', camSub: 'monitor', ctrlTab: 'image',
  ctlSaved: {}, ctlLive: {}, nudgeOn: {}, nudgeStep: 'normal', overlays: { cal: true, ball: true }, clickPts: false, pickPt: null, moveMsg: null,
  resetOpen: false, bmcaNote: false, lensRestart: null,
  ppFilter: 'all', ppAffected: [], ppSel: null, ppPicks: {}, ppTask: null, ppMenu: null, reviewed: {}, ppQueue: [], ppDone: {},
  cloudFilter: 'all', cloudPicks: {}, cloudAnchor: null, clMenu: null, cloudRetried: {}, cloudDone: {},
  zoom: {},

  set: (p) => set(typeof p === 'function' ? p(get()) : p),

  /** "Take me there": switch view, select the target, remember where we came from. */
  goTo: (a) => {
    const s = get();
    const r: Route = a.route;
    const ch: Partial<UiState> = { view: r.view, focusAlertId: a.id, drawer: false, prevView: r.view === s.view ? s.prevView : s.view, crumbPitch: null, dismissed: { ...s.dismissed, [a.id]: true } };
    if (r.cam) Object.assign(ch, { cam: r.cam, camTab: r.camTab ?? 'mosaic', camFilter: r.camFilter ?? 'all', camSub: r.camSub ?? 'monitor', resetOpen: false, pickPt: null });
    if (r.ctrl) ch.ctrlTab = r.ctrl;
    if (r.ppFilter) Object.assign(ch, { ppFilter: r.ppFilter, ppAffected: r.affected ?? [], ppSel: r.ppSel ?? null, ppPicks: {}, ppMenu: null, ppTask: r.ppFilter === 'flag' ? 1 : null });
    if (r.cloudFilter) Object.assign(ch, { cloudFilter: r.cloudFilter, cloudPicks: {}, clMenu: null });
    set(ch);
  },
  ack: (id) => set((s) => ({ ledger: acknowledge(s.ledger, id, clockMs(s)), dismissed: { ...s.dismissed, [id]: true } })),
  ackKeys: (match) => set((s) => {
    const ids = s.ledger.filter((o) => o.ackedAt === undefined && match(o.key)).map((o) => o.id);
    let ledger = s.ledger; const dismissed = { ...s.dismissed };
    ids.forEach((id) => { ledger = acknowledge(ledger, id, clockMs(s)); dismissed[id] = true; });
    return { ledger, dismissed };
  }),
  syncAlerts: (conds) => {
    const s = get();
    const ledger = reconcile(s.ledger, conds, clockMs(s), !s.ledgerReady);
    if (ledger === s.ledger && s.ledgerReady) return;
    // an occurrence that grabs attention again (reopened, or another camera dropped) un-hides its notification
    const before = new Map(s.ledger.map((o) => [o.id, o.alertedAt]));
    let dismissed = s.dismissed;
    for (const o of ledger) {
      if (dismissed[o.id] && before.has(o.id) && before.get(o.id) !== o.alertedAt) {
        if (dismissed === s.dismissed) dismissed = { ...dismissed };
        delete dismissed[o.id];
      }
    }
    set({ ledger, ledgerReady: true, dismissed });
  },
}));

/**
 * Subscribe to just the store fields a component uses (shallow-compared), so it re-renders only
 * when one of them changes, not on every clock tick or zoom drag. Actions (set, goTo, ack…) are stable.
 */
export function usePick<K extends keyof UiState>(...keys: K[]): Pick<UiState, K> {
  return useUi(useShallow((s: UiState) => {
    const o = {} as Pick<UiState, K>;
    for (const k of keys) o[k] = s[k];
    return o;
  }));
}
