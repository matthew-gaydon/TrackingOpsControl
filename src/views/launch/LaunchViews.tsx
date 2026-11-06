import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadSessions } from '../../data/load';
import { fmtClock } from '../../data/time';
import type { SessionEntry } from '../../data/types';
import { loadCreated, openSession, saveCreated, signOut } from '../../state/launch';
import { Arrow, Chevron, HealthDot } from '../../components/ui';

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

const startMs = (s: SessionEntry) => Date.parse(s.start) || 0;
const SESSION_TYPES = ['GAME', 'SIMULATION', 'HITTING', 'PITCHING'] as const;
const pad2 = (n: number) => String(n).padStart(2, '0');
/** The operator's calendar day ("YYYY-MM-DD") for a moment: an evening game in Arizona starts after 00:00 UTC. */
const localDay = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const addDays = (day: string, n: number) => { const [y, m, d] = day.split('-').map(Number); return localDay(new Date(y, m - 1, d + n).getTime()); };
const longDay = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
const utcTime = (ms: number) => fmtClock(ms).slice(0, 5);
const localTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

const newId = () => Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');

const input = { padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--ground)', color: 'var(--text)', fontSize: 13, colorScheme: 'dark' } as const;
const subline = (s: SessionEntry) => [s.league, s.gameType, s.venue].filter(Boolean).join(' · ');
const opensWith = (s: SessionEntry) => (!s.dataset ? 'No data yet' : s.sample ? 'Opens with sample data' : 'Has its own data');

type Mode = 'date' | 'all' | 'create';

/**
 * The launch page. The operator is steered to a date (today by default) and that day's sessions,
 * with the most likely one already picked. View all sessions lists everything, newest first.
 * Create session adds one (prototype: stored in this browser).
 */
export function SessionsView({ operator }: { operator: string }) {
  const [loaded, setLoaded] = useState<SessionEntry[] | null>(null);
  const [created, setCreated] = useState<SessionEntry[]>(loadCreated);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('date');
  const [back, setBack] = useState<Mode>('date');
  const [day, setDay] = useState(() => localDay(Date.now()));
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { loadSessions().then(setLoaded).catch((e: Error) => setErr(e.message)); }, []);

  const sessions = useMemo(() => [...created, ...(loaded ?? [])], [created, loaded]);
  const onDay = useMemo(() => sessions.filter((s) => localDay(startMs(s)) === day).sort((a, b) => startMs(a) - startMs(b)), [sessions, day]);
  // steer: on a day with sessions, pick the one starting closest to now
  useEffect(() => {
    if (mode !== 'date') return;
    const now = Date.now();
    const best = [...onDay].sort((a, b) => Math.abs(startMs(a) - now) - Math.abs(startMs(b) - now))[0];
    setSel(best?.sessionId ?? null);
  }, [onDay, mode]);
  const days = useMemo(() => [...new Set(sessions.map((s) => localDay(startMs(s))))].sort(), [sessions]);
  const nextDay = days.find((d) => d > day), prevDay = [...days].reverse().find((d) => d < day);
  const all = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return sessions
      .filter((s) => { const hay = [s.title, s.sessionId, s.gamePk, s.league, s.gameType, s.gameMode, s.venue, s.start.slice(0, 10), localDay(startMs(s))].join(' ').toLowerCase(); return words.every((w) => hay.includes(w)); })
      .sort((a, b) => startMs(b) - startMs(a));
  }, [sessions, q]);
  const picked = sessions.find((s) => s.sessionId === sel) ?? null;
  const open = (s: SessionEntry) => s.dataset && openSession(s.dataset, s.sessionId);
  const go = (m: Mode) => { if (m === 'create') setBack(mode === 'create' ? back : mode); setMode(m); };

  const openBtn = (
    <button type="button" className="btn primary" disabled={!picked?.dataset} onClick={() => picked && open(picked)} style={{ minHeight: 38 }}>
      {picked ? `Open ${picked.title}` : 'Open session'}<Arrow />
    </button>
  );

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
        <main className="panel fill" style={{ display: 'flex', flexDirection: 'column', minHeight: 0, maxWidth: 1200, width: '100%', alignSelf: 'center' }}>
          {err && <div className="small" style={{ padding: 16, color: 'var(--crit-ink)' }}>Couldn’t load sessions: {err}</div>}

          {/* ---------- by date (default) ---------- */}
          {mode === 'date' && <>
            <div className="panel-head">
              <h1 style={{ fontSize: 16, fontWeight: 600 }}>Sessions on</h1>
              <div className="row" style={{ gap: 4 }}>
                <button type="button" className="icon-btn" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))}><Chevron dir="left" /></button>
                <input type="date" aria-label="Session date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} style={input} />
                <button type="button" className="icon-btn" aria-label="Next day" onClick={() => setDay(addDays(day, 1))}><Chevron /></button>
              </div>
              {day !== localDay(Date.now()) && <button type="button" className="btn" onClick={() => setDay(localDay(Date.now()))}>Today</button>}
              <span className="small muted">{longDay(day)}</span>
              <span className="grow" />
              <button type="button" className="btn" onClick={() => go('all')}>View all sessions</button>
              <button type="button" className="btn" onClick={() => go('create')}>Create session</button>
            </div>
            <div className="fill scroll" style={{ padding: 16 }}>
              {!loaded && !err && <span className="small muted">Loading sessions…</span>}
              {loaded && onDay.length === 0 && (
                <div className="col" style={{ gap: 12, maxWidth: 640, margin: '24px auto', padding: 20, borderRadius: 10, background: 'var(--warn-bg)', border: '1px solid var(--warn-edge)' }}>
                  <span className="row" style={{ gap: 10 }}><HealthDot h="warn" size={10} /><span style={{ fontWeight: 700, fontSize: 15, color: 'var(--warn-ink)' }}>No sessions on {longDay(day)}</span></span>
                  <span className="small" style={{ color: 'var(--text-2)', lineHeight: 1.5 }}>Check the date, look through all sessions, or create one for today’s work.</span>
                  <div className="row wrap">
                    <button type="button" className="btn primary" onClick={() => go('create')}>Create session</button>
                    <button type="button" className="btn" onClick={() => go('all')}>View all sessions</button>
                    {prevDay && <button type="button" className="btn link" onClick={() => setDay(prevDay)}><Chevron dir="left" />{longDay(prevDay)}</button>}
                    {nextDay && <button type="button" className="btn link" onClick={() => setDay(nextDay)}>{longDay(nextDay)}<Chevron /></button>}
                  </div>
                </div>
              )}
              {onDay.length > 0 && (
                <div className="col" style={{ gap: 10, maxWidth: 820, margin: '0 auto' }}>
                  <span className="small muted">{onDay.length === 1 ? 'One session on this date. It’s selected.' : `${onDay.length} sessions on this date. The one starting nearest to now is selected.`}</span>
                  {onDay.map((s) => {
                    const ms = startMs(s); const on = sel === s.sessionId;
                    return (
                      <button key={s.sessionId} type="button" aria-pressed={on} onClick={() => setSel(s.sessionId)} onDoubleClick={() => open(s)}
                        className="row" style={{ gap: 16, padding: '14px 16px', borderRadius: 10, textAlign: 'left', background: on ? 'var(--sel)' : 'var(--panel-2)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, boxShadow: on ? 'inset 3px 0 0 var(--accent)' : undefined, opacity: s.dataset ? 1 : 0.6 }}>
                        <span className="col" style={{ gap: 0, minWidth: 74 }}>
                          <span className="mono" style={{ fontSize: 18, fontWeight: 600 }}>{utcTime(ms)}</span>
                          <span className="mono tiny muted">UTC · {localTime(ms)} local</span>
                        </span>
                        <span className="col grow" style={{ gap: 3, minWidth: 0 }}>
                          <span className="row" style={{ gap: 8 }}><span style={{ fontWeight: 700, fontSize: 15 }}>{s.title}</span><span className="pill neutral mono">{s.gameMode}</span>{s.created && <span className="pill info">CREATED HERE</span>}</span>
                          <span className="tiny muted">{subline(s)}</span>
                        </span>
                        <span className="col" style={{ gap: 2, alignItems: 'flex-end' }}>
                          <span className="mono small">{s.sessionId}</span>
                          <span className="mono tiny muted">{s.gamePk ? `GamePK ${s.gamePk}` : 'No GamePK'}</span>
                          <span className="tiny muted">{opensWith(s)}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="row" style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
              <span className="small muted grow">Dates are your local calendar day; start times show UTC first, as in the rest of the app.</span>
              {openBtn}
            </div>
          </>}

          {/* ---------- all sessions, newest first ---------- */}
          {mode === 'all' && <>
            <div className="panel-head">
              <button type="button" className="btn" onClick={() => setMode('date')}><Chevron dir="left" />By date</button>
              <h1 style={{ fontSize: 16, fontWeight: 600 }}>All sessions <span className="muted mono small">{sessions.length}</span></h1>
              <input type="search" aria-label="Search sessions" placeholder="Search team, league, date, session ID, GamePK" value={q} onChange={(e) => setQ(e.target.value)} style={{ ...input, flex: '1 1 220px', maxWidth: 340 }} />
              <span className="grow" />
              <button type="button" className="btn" onClick={() => go('create')}>Create session</button>
              {openBtn}
            </div>
            <div className="fill scroll">
              <div style={{ minWidth: 900 }}>
                <div className="lbl sticky-head" style={{ display: 'grid', gridTemplateColumns: ALL_GRID, gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
                  <span>Start (UTC)</span><span>Session</span><span>Type</span><span>Session ID</span><span>GamePK</span><span />
                </div>
                {loaded && all.length === 0 && <div className="small muted" style={{ padding: 16 }}>No sessions match.</div>}
                {all.map((s) => {
                  const ms = startMs(s);
                  return (
                    <button key={s.sessionId} type="button" aria-pressed={sel === s.sessionId} className="list-row"
                      onClick={() => setSel(s.sessionId)} onDoubleClick={() => open(s)}
                      style={{ gridTemplateColumns: ALL_GRID, gap: 12, padding: '10px 16px', minHeight: 52, opacity: s.dataset ? 1 : 0.6 }}>
                      <span className="mono small">{ms ? `${new Date(ms).toISOString().slice(0, 10)} ${utcTime(ms)}` : s.start}</span>
                      <span className="col" style={{ gap: 2, minWidth: 0 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}{s.created && <span className="pill info" style={{ marginLeft: 8 }}>CREATED HERE</span>}</span>
                        <span className="tiny muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subline(s)}</span>
                      </span>
                      <span className="mono small">{s.gameMode}</span>
                      <span className="mono small" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.sessionId}</span>
                      <span className="mono small">{s.gamePk ?? '—'}</span>
                      <span className="tiny muted" style={{ textAlign: 'right' }}>{opensWith(s)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="small muted" style={{ padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
              Newest first. Select a session and choose Open, or double-click it.
            </div>
          </>}

          {/* ---------- create a session ---------- */}
          {mode === 'create' && (
            <CreateSession venue={mostCommon(sessions.map((s) => s.venue)) ?? ''} defaultDay={day}
              onCancel={() => setMode(back)}
              onCreate={(s) => { const list = [s, ...created]; setCreated(list); saveCreated(list); setDay(localDay(startMs(s))); setMode('date'); setTimeout(() => setSel(s.sessionId), 0); }} />
          )}
        </main>
      </div>
    </div>
  );
}

const ALL_GRID = '150px minmax(240px, 2fr) 110px minmax(110px, .8fr) 90px 160px';
const mostCommon = (xs: string[]) => { const m = new Map<string, number>(); xs.filter(Boolean).forEach((x) => m.set(x, (m.get(x) ?? 0) + 1)); return [...m].sort((a, b) => b[1] - a[1])[0]?.[0]; };

const Label = ({ t, children }: { t: string; children: ReactNode }) => <label className="col" style={{ gap: 6 }}><span className="lbl">{t}</span>{children}</label>;

/** New session: start date and time (UTC), home and away teams, and type. Prototype: kept in this browser. */
function CreateSession({ venue, defaultDay, onCreate, onCancel }: { venue: string; defaultDay: string; onCreate: (s: SessionEntry) => void; onCancel: () => void }) {
  const [date, setDate] = useState(defaultDay);
  const [time, setTime] = useState('19:00');
  const [home, setHome] = useState('');
  const [away, setAway] = useState('');
  const [type, setType] = useState<(typeof SESSION_TYPES)[number]>('GAME');
  const needsAway = type === 'GAME' || type === 'SIMULATION';
  const start = Date.parse(`${date}T${time}:00Z`);
  const ok = !!home.trim() && (!needsAway || !!away.trim()) && !isNaN(start);
  return (
    <form className="col" style={{ gap: 16, padding: 24, maxWidth: 560, width: '100%', alignSelf: 'center' }}
      onSubmit={(e) => {
        e.preventDefault(); if (!ok) return;
        const h = home.trim(), a = away.trim();
        onCreate({ sessionId: newId(), gamePk: null, title: a ? `${a} @ ${h}` : h, venue, start: new Date(start).toISOString(), gameMode: type, status: 'scheduled', dataset: 'demo', sample: true, created: true });
      }}>
      <h1 style={{ fontSize: 18, fontWeight: 600 }}>Create session</h1>
      <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
        <Label t="Start date"><input type="date" required value={date} onChange={(e) => setDate(e.target.value)} style={input} /></Label>
        <Label t="Start time (UTC)"><input type="time" required value={time} onChange={(e) => setTime(e.target.value)} style={input} /></Label>
        {!isNaN(start) && <span className="tiny muted" style={{ paddingBottom: 10 }}>{localTime(start)} your time</span>}
      </div>
      <Label t="Session type">
        <div role="radiogroup" aria-label="Session type" className="seg" style={{ alignSelf: 'flex-start' }}>
          {SESSION_TYPES.map((k) => <button key={k} type="button" role="radio" aria-checked={type === k} onClick={() => setType(k)}>{k[0] + k.slice(1).toLowerCase()}</button>)}
        </div>
      </Label>
      <div className="row" style={{ gap: 12 }}>
        <span className="grow"><Label t="Away team"><input value={away} onChange={(e) => setAway(e.target.value)} placeholder={needsAway ? 'e.g. Surprise Saguaros' : 'Optional'} style={{ ...input, width: '100%' }} /></Label></span>
        <span className="grow"><Label t="Home team"><input value={home} onChange={(e) => setHome(e.target.value)} placeholder="e.g. Mesa Solar Sox" style={{ ...input, width: '100%' }} /></Label></span>
      </div>
      {venue && <span className="small muted">Venue: {venue}</span>}
      <div className="row">
        <button type="submit" className="btn primary" disabled={!ok}>Create session</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
      <span className="tiny muted" style={{ lineHeight: 1.5 }}>Prototype: the session is kept in this browser only and opens with the demo data. Creating it in GroundControl is a backend step for later.</span>
    </form>
  );
}
