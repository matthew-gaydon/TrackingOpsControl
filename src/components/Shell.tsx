import { usePick, useUi, type View } from '../state/store';
import { useAlerts, useDs, useNow, useSession } from '../state/hooks';
import { fmtClock } from '../data/time';
import { getOperator, signOut, toSessions } from '../state/launch';
import { Arrow, Chevron, SevBadge } from './ui';
import { alertWhen, type Alert } from '../alerts/ledger';
import type { SessionMode } from '../data/types';

const VIEWS: [View, string][] = [['game', 'Game'], ['cameras', 'Cameras'], ['pp', 'Post-processing'], ['cloud', 'Cloud processing']];
const VIEW_NAME: Record<View, string> = { game: 'Game', cameras: 'Cameras', pp: 'Post-processing', cloud: 'Cloud processing' };

/** Header clock: the dataset clock in UTC, the same clock every pitch and alert time uses. */
function Clock() {
  const now = useNow();
  return <span className="mono" style={{ fontSize: 18, fontWeight: 500 }} title="Dataset clock (UTC)">{fmtClock(now)}<span className="tiny muted" style={{ marginLeft: 6, fontSize: 11 }}>UTC</span></span>;
}

/** Ticking "Active · 3m 12s" text. Only this re-renders each second, not the alert list around it. */
function AlertWhen({ a }: { a: Alert }) {
  const now = useNow();
  return <>{alertWhen(a, now)}</>;
}

/** Switches the session; going In also acknowledges the session alert and its developer detail. */
export function useGoInSession() {
  return () => {
    const s = useUi.getState();
    s.ackKeys((k) => k === 'session' || k.startsWith('disk:'));
    s.set({ session: 'in' });
  };
}

export function Header() {
  const ds = useDs();
  const st = usePick('drawer', 'idsOpen', 'set', 'view');
  const al = useAlerts();
  const session = useSession();
  const goIn = useGoInSession();
  const operator = getOperator();
  const realOpen = al.open.filter((a) => a.sev !== 'dev').length;
  const btnBg = realOpen === 0 ? { border: '1px solid #23503A', background: 'var(--ok-bg)', color: 'var(--ok-ink)' }
    : al.worst === 'crit' || al.worst === 'issue' ? { border: 0, background: 'var(--crit)', color: '#2A0B09', animation: al.liveCrit ? 'pulse 1.8s infinite' : undefined }
    : { border: 0, background: 'var(--warn)', color: '#241A05' };
  const ring = (on: boolean) => ({ display: 'flex', flexDirection: 'column' as const, gap: 2, padding: '4px 8px', margin: '-4px -8px', borderRadius: 8, ...(on ? { outline: '2px solid var(--warn)', outlineOffset: 2, background: 'rgba(245,184,65,.08)' } : {}) });
  const target = al.focus && !al.focus.acked ? al.focus.route.target : undefined;
  const g = ds.game;
  const gameId = g.gamePk ? String(g.gamePk) : g.sessionId;

  return (
    <header style={{ flex: '0 0 auto', background: '#0F131A', borderBottom: '1px solid var(--border)' }}>
      <div className="row wrap" style={{ gap: 14, padding: '10px 20px', borderBottom: '1px solid var(--line)' }}>
        <div className="row" style={{ gap: 10 }}>
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="11" fill="none" stroke="#5AB8FF" strokeWidth="2" /><circle cx="13" cy="13" r="4" fill="#5AB8FF" /></svg>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
            <span style={{ fontWeight: 700, letterSpacing: '.02em', fontSize: 14 }}>TrackingOpsControl</span>
            <span className="row mono tiny muted" style={{ gap: 6 }}>{g.venue}{ds.sample && <span className="pill neutral" style={{ fontSize: 9, padding: '1px 6px' }} title="This session has no data in the prototype yet, so it shows the demo dataset">SAMPLE DATA</span>}</span>
          </div>
        </div>
        <span className="grow" />
        <span className="row small" style={{ gap: 6 }}><span className="muted">Operator</span><span style={{ fontWeight: 600 }}>{operator ?? '—'}</span></span>
        <button type="button" className="btn" title={`Dataset: ${ds.name}`} onClick={toSessions}>Switch session</button>
        <button type="button" className="btn" onClick={signOut}>Sign out</button>
        <Clock />
        <button type="button" aria-expanded={st.drawer} onClick={() => st.set({ drawer: !st.drawer })}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, minHeight: 40, ...btnBg }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 20a2 2 0 004 0" /></svg>
          <span>{realOpen ? `${realOpen} need action` : 'All clear'}</span>
        </button>
      </div>
      <div className="row wrap" style={{ gap: 16, padding: '8px 20px' }}>
        <nav aria-label="Views" className="seg lg" style={{ background: 'var(--panel-2)' }}>
          {VIEWS.map(([k, l]) => {
            const c = al.countFor(k);
            return (
              <button key={k} type="button" aria-current={st.view === k ? 'page' : undefined} onClick={() => st.set({ view: k, focusAlertId: null, prevView: null, crumbPitch: null, pop: null })}>
                {l}
                {c.n > 0 && <span className="mono" style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: c.worst === 'crit' || c.worst === 'issue' ? 'var(--crit)' : 'var(--warn)', color: '#241A05' }}>{c.n}</span>}
              </button>
            );
          })}
        </nav>
        <span className="grow" />
        <div style={{ position: 'relative' }}>
          <button type="button" aria-expanded={st.idsOpen} onClick={() => st.set({ idsOpen: !st.idsOpen })} disabled={!g.gamePk}
            style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 8px', margin: '-4px -8px', borderRadius: 8, border: 0, background: st.idsOpen ? 'var(--panel-2)' : 'transparent', textAlign: 'left', opacity: 1 }}>
            <span className="lbl">Game ID · {g.gamePk ? 'GamePK' : 'Session'}</span>
            <span className="row" style={{ gap: 6 }}><span className="mono" style={{ fontSize: 13 }}>{gameId}</span>{g.gamePk && <Chevron dir="down" />}</span>
          </button>
          {st.idsOpen && g.gamePk && (
            <div role="dialog" aria-label="Game identifiers" className="card" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40, width: 290, padding: 12, boxShadow: '0 12px 32px rgba(0,0,0,.5)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="col" style={{ gap: 3, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                <span className="lbl">MLB GamePK · shown</span><span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{g.gamePk}</span><span className="tiny muted">From BDS (MLB StatsAPI)</span>
              </div>
              <div className="col" style={{ gap: 3 }}><span className="lbl">Hawk-Eye Session ID</span><span className="mono" style={{ fontSize: 14 }}>{g.sessionId}</span><span className="tiny muted">From GroundControl</span></div>
            </div>
          )}
        </div>
        <div className="col" style={{ gap: 2 }}><span className="lbl">Game mode · BDS</span>
          {(() => {
            // LIVE is the only mode where recording matters for the broadcast; anything else reads as "not a game"
            const live = g.gameMode === 'LIVE';
            return <span className="row" style={{ gap: 6, padding: '3px 8px', borderRadius: 5, background: live ? '#12301F' : 'var(--panel-2)', color: live ? 'var(--ok-ink)' : 'var(--text-2)', border: live ? undefined : '1px solid var(--border-2)', fontWeight: 700, fontSize: 12 }}>
              <span className={`dot${live ? '' : ' sq'}`} style={{ width: 7, height: 7, background: live ? 'var(--ok)' : 'var(--muted)' }} />{g.gameMode}</span>;
          })()}
        </div>
        <div style={ring(target === 'session')}>
          <span className="lbl">Session</span>
          <div role="radiogroup" aria-label="Session mode" className="seg" style={{ padding: 2 }}>
            {(['none', 'out', 'in'] as SessionMode[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={session === k} onClick={() => (k === 'in' ? goIn() : st.set({ session: k }))}
                style={session === k ? { background: k === 'in' ? '#1F7A4D' : k === 'out' ? '#B8402F' : '#3A4250', color: '#fff', fontWeight: 700 } : undefined}>{k[0].toUpperCase() + k.slice(1)}</button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

/** "Arrived from alert" banner. */
export function FocusBanner() {
  const al = useAlerts();
  const st = usePick('ack', 'checked', 'prevView', 'set');
  const goIn = useGoInSession();
  const a = al.focus;
  if (!a) return null;
  const acked = a.acked;
  const red = a.sev === 'crit' || a.sev === 'issue';
  return (
    <section aria-label="Alert you are working on" style={{ flex: '0 0 auto', margin: '12px 12px 0', padding: '12px 14px', borderRadius: 10, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', animation: 'rise .25s ease-out', background: acked ? 'var(--panel-2)' : red ? 'var(--crit-bg)' : 'var(--warn-bg)', border: `1px solid ${acked ? 'var(--border)' : red ? '#8A3330' : 'var(--warn-edge)'}` }}>
      <SevBadge sev={a.sev} />
      <div className="col" style={{ gap: 6, flex: '1 1 420px', minWidth: 0 }}>
        <div className="row wrap" style={{ alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontWeight: 600, fontSize: 14, color: '#F6F8FA' }}>{a.title}</span>
          <span className="mono tiny" style={{ color: '#A5B0BF' }}><AlertWhen a={a} /></span>
          {acked && <span className="pill solid-ok" style={{ fontSize: 10 }}>ACKNOWLEDGED</span>}
        </div>
        <span style={{ color: 'var(--text-2)', lineHeight: 1.45 }}>{a.summary}</span>
        {a.raw && <span className="mono tiny" style={{ color: '#A5B0BF' }}>{a.raw}</span>}
        {a.checks.length > 0 && (() => {
          const ck = (k: string) => `${a.id}|${k}`;
          const n = a.checks.filter((k) => st.checked[ck(k)]).length;
          const toggle = (k: string) => st.set((s) => { const c = { ...s.checked }; if (c[ck(k)]) delete c[ck(k)]; else c[ck(k)] = true; return { checked: c }; });
          return (
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="mono tiny" style={{ color: '#A5B0BF' }}>Checks {n}/{a.checks.length}</span>
              {a.checks.map((k) => <label key={k} className="row small" style={{ gap: 6, padding: '5px 9px', borderRadius: 6, background: 'rgba(11,14,19,.5)', border: '1px solid var(--border-2)' }}><input type="checkbox" checked={!!st.checked[ck(k)]} disabled={acked} onChange={() => toggle(k)} />{k}</label>)}
            </div>
          );
        })()}
      </div>
      <div className="row wrap">
        {a.fix && !acked && <button type="button" className="btn" style={{ border: 0, background: 'var(--warn)', color: '#241A05', fontWeight: 700 }} onClick={goIn}>{a.fix.label}</button>}
        {!acked && <button type="button" className="btn primary" onClick={() => st.ack(a.id)}>Acknowledge</button>}
        {st.prevView && <button type="button" className="btn" onClick={() => st.set({ view: st.prevView!, focusAlertId: null, prevView: null })}>Back to {VIEW_NAME[st.prevView]}</button>}
        <button type="button" className="icon-btn" aria-label="Close alert context" onClick={() => st.set({ focusAlertId: null })} style={{ background: 'transparent' }}>✕</button>
      </div>
    </section>
  );
}

/** "Back to Game · Pitch N" after following a link on the pitch card. */
export function Crumb() {
  const st = usePick('crumbPitch', 'set', 'view');
  if (st.crumbPitch === null || st.view === 'game') return null;
  return (
    <div className="row wrap small" style={{ flex: '0 0 auto', gap: 10, margin: '12px 12px 0', padding: '8px 12px', borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid var(--accent-edge)', color: '#CFE8FF' }}>
      <Chevron dir="left" /><span>Opened from the pitch card on Game.</span><span className="grow" />
      <button type="button" className="btn link" onClick={() => st.set({ view: 'game', gameSel: st.crumbPitch, crumbPitch: null, focusAlertId: null })}>Back to Game · Pitch {st.crumbPitch}</button>
    </div>
  );
}

function AlertCard({ a, open }: { a: Alert; open: boolean }) {
  const st = usePick('ack', 'goTo');
  const red = a.sev === 'crit' || a.sev === 'issue';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 8, ...(!open ? { background: 'var(--panel-2)', border: '1px solid var(--border)', opacity: .85 } : a.cleared ? { background: '#1A1F28', border: '1px dashed var(--crit-edge)' } : red ? { background: 'var(--crit-bg)', border: '1px solid #8A3330' } : a.sev === 'dev' ? { background: 'var(--panel-2)', border: '1px solid var(--border)' } : { background: 'var(--warn-bg)', border: '1px solid var(--warn-edge)' }) }}>
      <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
        <SevBadge sev={a.sev} />
        <span className="col grow" style={{ gap: 2 }}>
          <span style={{ fontWeight: 600, color: '#F6F8FA' }}>{a.title}</span>
          <span className="mono tiny" style={{ color: '#A5B0BF' }}>{a.cleared && !a.acked && !a.replaced ? 'CLEARED · NOT ACKNOWLEDGED · ' : ''}<AlertWhen a={a} /></span>
        </span>
      </div>
      <div className="row wrap">
        {a.sev !== 'dev' && <button type="button" className="btn link" onClick={() => st.goTo(a)}><span>{a.where}</span><Arrow /></button>}
        {a.sev === 'dev' && a.raw && <span className="mono tiny muted" style={{ lineHeight: 1.5 }}>{a.raw}</span>}
        <span className="grow" />
        {open && <button type="button" className="btn" onClick={() => st.ack(a.id)}>Acknowledge</button>}
      </div>
    </div>
  );
}

export function AlertDrawer() {
  const st = usePick('dev', 'drawer', 'drawerTab', 'set');
  const al = useAlerts();
  if (!st.drawer) return null;
  const items = st.drawerTab === 'open' ? al.open : al.done;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', justifyContent: 'flex-end', background: 'rgba(5,7,10,.45)' }}>
      <button type="button" aria-label="Close alerts" onClick={() => st.set({ drawer: false })} style={{ flex: '1 1 auto', background: 'transparent', border: 0, cursor: 'default' }} />
      <aside role="dialog" aria-label="Alerts" style={{ width: 420, maxWidth: '100%', height: '100%', overflowY: 'auto', background: 'var(--panel)', borderLeft: '1px solid var(--border-2)', boxShadow: '-16px 0 40px rgba(0,0,0,.5)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, animation: 'rise .2s ease-out' }}>
        <div className="row"><h2 className="grow" style={{ fontSize: 16, fontWeight: 600 }}>Alerts</h2><button type="button" className="icon-btn" aria-label="Close alerts" onClick={() => st.set({ drawer: false })}>✕</button></div>
        <div className="row wrap">
          <div role="tablist" aria-label="Alert list" className="seg">
            <button type="button" role="tab" aria-selected={st.drawerTab === 'open'} onClick={() => st.set({ drawerTab: 'open' })}>To acknowledge · {al.open.length}</button>
            <button type="button" role="tab" aria-selected={st.drawerTab === 'done'} onClick={() => st.set({ drawerTab: 'done' })}>Acknowledged · {al.done.length}</button>
          </div>
          <span className="grow" />
          <label className="row small" style={{ gap: 6, color: 'var(--text-3)' }}><input type="checkbox" checked={st.dev} onChange={() => st.set({ dev: !st.dev })} />Developer</label>
        </div>
        {items.length === 0 && <span className="small muted" style={{ padding: '20px 0' }}>Nothing here.</span>}
        {items.map((a) => <AlertCard key={a.id} a={a} open={st.drawerTab === 'open'} />)}
      </aside>
    </div>
  );
}

export function Toasts() {
  const st = usePick('dismissed', 'goTo', 'set');
  const al = useAlerts();
  const goIn = useGoInSession();
  const list = al.open.filter((a) => a.notify && !a.cleared && !st.dismissed[a.id]).slice(0, 3);
  return (
    <div aria-live="polite" style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 45, display: 'flex', flexDirection: 'column', gap: 10, width: 380, maxWidth: 'calc(100% - 40px)' }}>
      {list.map((a) => {
        const red = a.sev === 'crit' || a.sev === 'issue';
        return (
          <div key={a.id} role="alert" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 10, boxShadow: '0 12px 32px rgba(0,0,0,.55)', animation: 'rise .3s ease-out', background: red ? 'var(--crit-bg)' : 'var(--warn-bg)', border: `1px solid ${red ? '#8A3330' : 'var(--warn-edge)'}` }}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <SevBadge sev={a.sev} />
              <span className="col grow" style={{ gap: 2 }}><span style={{ fontWeight: 600, color: '#F6F8FA' }}>{a.title}</span><span className="small" style={{ color: 'var(--text-2)' }}>{a.line}</span></span>
              <button type="button" aria-label="Hide notification (does not acknowledge)" onClick={() => st.set((s) => ({ dismissed: { ...s.dismissed, [a.id]: true } }))} style={{ border: 0, background: 'transparent', color: 'var(--text-3)', fontSize: 14 }}>✕</button>
            </div>
            <div className="row wrap">
              <button type="button" className="btn primary" onClick={() => st.goTo(a)}>Take me there<Arrow /></button>
              {a.fix && <button type="button" className="btn" style={{ border: 0, background: 'var(--warn)', color: '#241A05', fontWeight: 700 }} onClick={goIn}>{a.fix.label}</button>}
              <span className="tiny muted">{a.where}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
