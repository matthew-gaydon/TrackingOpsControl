import { useEffect, useMemo, useState } from 'react';
import { loadSessions } from '../../data/load';
import { fmtClock } from '../../data/time';
import type { SessionEntry } from '../../data/types';
import { openSession, signOut } from '../../state/launch';
import { Arrow } from '../../components/ui';

const Logo = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="11" fill="none" stroke="#5AB8FF" strokeWidth="2" /><circle cx="13" cy="13" r="4" fill="#5AB8FF" /></svg>
);

const field = { padding: '10px 12px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--ground)', color: 'var(--text)', fontSize: 14 } as const;

/** Operator sign-in. Prototype: any operator name signs in; the password is not checked or stored. */
export function LoginView({ onSignedIn }: { onSignedIn: (name: string) => void }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const ok = name.trim().length > 0;
  return (
    <div className="launch">
      <form className="panel col" aria-label="Operator sign-in" style={{ width: 380, maxWidth: '100%', padding: 28, gap: 18 }}
        onSubmit={(e) => { e.preventDefault(); if (ok) onSignedIn(name.trim()); }}>
        <div className="row" style={{ gap: 12 }}>
          <Logo size={34} />
          <div className="col" style={{ gap: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 18, letterSpacing: '.02em' }}>TrackingOpsControl</span>
            <span className="small muted">Operator sign-in</span>
          </div>
        </div>
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">Operator</span>
          <input autoFocus autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your operator name" style={field} />
        </label>
        <label className="col" style={{ gap: 6 }}>
          <span className="lbl">Password</span>
          <input type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} style={field} />
        </label>
        <button type="submit" className="btn primary" disabled={!ok} style={{ justifyContent: 'center', minHeight: 42, fontSize: 14 }}>Sign in</button>
        <span className="tiny muted" style={{ lineHeight: 1.5 }}>Prototype: any operator name signs in and the password isn’t checked or kept. Real sign-in is still an open question for the backend.</span>
      </form>
    </div>
  );
}

const STATUS: Record<string, { label: string; tone: 'ok' | 'info' | 'none'; order: number }> = {
  live: { label: 'LIVE', tone: 'ok', order: 0 }, scheduled: { label: 'SCHEDULED', tone: 'info', order: 1 }, final: { label: 'FINAL', tone: 'none', order: 2 },
};
const st = (s: string) => STATUS[s] ?? { label: s.toUpperCase(), tone: 'none' as const, order: 3 };
const GRID = '110px minmax(180px, 1.6fr) 110px minmax(150px, 1.2fr) minmax(170px, 1.3fr) 150px 90px';

/** The sessions available to the operator. Pick one, then open it. Double-click opens straight away. */
export function SessionsView({ operator }: { operator: string }) {
  const [sessions, setSessions] = useState<SessionEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'live' | 'scheduled' | 'final'>('all');
  useEffect(() => { loadSessions().then(setSessions).catch((e: Error) => setErr(e.message)); }, []);

  const rows = useMemo(() => (sessions ?? [])
    .filter((s) => filter === 'all' || s.status === filter)
    .sort((a, b) => st(a.status).order - st(b.status).order || Date.parse(b.start) - Date.parse(a.start)), [sessions, filter]);
  const picked = rows.find((s) => s.sessionId === sel) ?? null;
  const count = (k: string) => (sessions ?? []).filter((s) => s.status === k).length;

  return (
    <div className="app">
      <header className="row" style={{ flex: '0 0 auto', gap: 12, padding: '10px 20px', background: '#0F131A', borderBottom: '1px solid var(--border)' }}>
        <Logo />
        <span style={{ fontWeight: 700, letterSpacing: '.02em', fontSize: 14 }}>TrackingOpsControl</span>
        <span className="grow" />
        <span className="small muted">Signed in as</span><span style={{ fontWeight: 600 }}>{operator}</span>
        <button type="button" className="btn" onClick={signOut}>Sign out</button>
      </header>
      <div className="view">
        <main className="panel fill" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxWidth: 1400, width: '100%', alignSelf: 'center' }}>
          <div className="panel-head">
            <h1 style={{ fontSize: 16, fontWeight: 600 }}>Choose a session</h1>
            <div className="row" style={{ gap: 4 }}>
              {([['all', `All · ${(sessions ?? []).length}`], ['live', `Live · ${count('live')}`], ['scheduled', `Scheduled · ${count('scheduled')}`], ['final', `Final · ${count('final')}`]] as const).map(([k, l]) => (
                <button key={k} type="button" className="filter" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
              ))}
            </div>
            <span className="grow" />
            <button type="button" className="btn primary" disabled={!picked?.dataset} onClick={() => picked?.dataset && openSession(picked.dataset)}>
              {picked ? `Open ${picked.title}` : 'Open session'}<Arrow />
            </button>
          </div>
          <div className="fill scroll">
            <div style={{ minWidth: 960 }}>
              <div className="lbl sticky-head" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
                <span>Status</span><span>Game</span><span>Mode</span><span>Start (UTC)</span><span>Session ID</span><span>GamePK</span><span />
              </div>
              {err && <div className="small" style={{ padding: 16, color: 'var(--crit-ink)' }}>Couldn’t load public/data/sessions.json: {err}</div>}
              {!sessions && !err && <div className="small muted" style={{ padding: 16 }}>Loading sessions…</div>}
              {sessions && rows.length === 0 && <div className="small muted" style={{ padding: 16 }}>No sessions here.</div>}
              {rows.map((s) => {
                const t = st(s.status); const can = !!s.dataset;
                const d = new Date(Date.parse(s.start));
                return (
                  <button key={s.sessionId} type="button" aria-pressed={sel === s.sessionId} className="list-row"
                    onClick={() => setSel(s.sessionId)} onDoubleClick={() => can && openSession(s.dataset!)}
                    style={{ gridTemplateColumns: GRID, gap: 12, padding: '12px 16px', minHeight: 58, opacity: can ? 1 : 0.6 }}>
                    <span className={`pill ${t.tone === 'none' ? 'neutral' : t.tone}`} style={{ justifySelf: 'start' }}>
                      {t.tone === 'ok' && <span className="dot" style={{ width: 7, height: 7, background: 'var(--ok)', marginRight: 6, animation: 'blink 1.6s infinite' }} />}{t.label}
                    </span>
                    <span className="col" style={{ gap: 2 }}><span style={{ fontWeight: 600, fontSize: 14 }}>{s.title}</span><span className="mono tiny muted">{s.venue}</span></span>
                    <span className="mono small">{s.gameMode}</span>
                    <span className="mono small">{isNaN(d.getTime()) ? s.start : `${d.toISOString().slice(0, 10)} ${fmtClock(d.getTime()).slice(0, 5)}`}</span>
                    <span className="mono small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sessionId}</span>
                    <span className="mono small">{s.gamePk ?? '—'}</span>
                    <span className="tiny muted" style={{ textAlign: 'right' }}>{can ? '' : 'No data yet'}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="small muted" style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
            Select a session and choose Open, or double-click it. Sessions marked “No data yet” are listed but have no dataset in this prototype.
          </div>
        </main>
      </div>
    </div>
  );
}
