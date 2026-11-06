import { useEffect, useState } from 'react';
import { useUi } from './state/store';
import { useAlerts, useAlertSync } from './state/hooks';
import { loadDataset, loadSessions, datasetName, sessionParam } from './data/load';
import { getOperator, loadCreated, signIn, toSessions } from './state/launch';
import { LoginView, SessionsView } from './views/launch/LaunchViews';
import { AlertDrawer, Crumb, FocusBanner, Header, Toasts } from './components/Shell';
import { GameView } from './views/game/GameView';
import { CamerasView } from './views/cameras/CamerasView';
import { PitchesView } from './views/pitches/PitchesView';
import { PostProcessingView } from './views/pp/PostProcessingView';
import { CloudView } from './views/cloud/CloudView';

/** Mock processing: one reprocess task finishes every 2 s; a repushed cloud task succeeds after 4 s. */
function useMockProcessing() {
  useEffect(() => {
    const t = setInterval(() => {
      const s = useUi.getState();
      const ch: Partial<typeof s> = { elapsedSec: Math.floor((Date.now() - s.loadedAt) / 1000) };
      const r = s.cloudRetried; const due = Object.keys(r).filter((k) => Date.now() - r[k] > 4000);
      if (due.length) { const v = { ...r }, d = { ...s.cloudDone }; due.forEach((k) => { delete v[k]; d[k] = true; }); ch.cloudRetried = v; ch.cloudDone = d; }
      s.set(ch);
    }, 1000);
    const q = setInterval(() => {
      const s = useUi.getState();
      if (!s.ppQueue.length) return;
      s.set({ ppQueue: s.ppQueue.slice(1), ppDone: { ...s.ppDone, [s.ppQueue[0]]: true } });
    }, 2000);
    return () => { clearInterval(t); clearInterval(q); };
  }, []);
}

function Main() {
  const view = useUi((s) => s.view);
  useAlertSync();
  const al = useAlerts();
  return (
    <div className="app">
      {al.liveCrit && <div className="ambient" aria-hidden="true" />}
      <Header />
      <FocusBanner />
      <Crumb />
      {view === 'game' && <GameView />}
      {view === 'cameras' && <CamerasView />}
      {view === 'pitches' && <PitchesView />}
      {view === 'pp' && <PostProcessingView />}
      {view === 'cloud' && <CloudView />}
      <AlertDrawer />
      <Toasts />
    </div>
  );
}

/** The main view for one session (dataset). */
function SessionApp({ name }: { name: string }) {
  const ds = useUi((s) => s.ds), err = useUi((s) => s.loadError);
  useMockProcessing();
  useEffect(() => {
    const sid = sessionParam();
    loadDataset(name)
      .then(async (d) => {
        // a session picked on the launch page: show its identity (a stand-in dataset keeps its own cameras and pitches)
        const s = sid ? [...loadCreated(), ...(await loadSessions().catch(() => []))].find((x) => x.sessionId === sid) : undefined;
        return s ? { ...d, sample: s.sample, game: { ...d.game, sessionId: s.sessionId, gamePk: s.gamePk, venue: s.venue || d.game.venue } } : d;
      })
      .then((d) => useUi.getState().set({ ds: d, cam: d.cameras[0]?.id ?? '', loadedAt: Date.now() }))
      .catch((e: Error) => useUi.getState().set({ loadError: e.message }));
  }, [name]);
  if (err) return (
    <div style={{ padding: 40 }} className="col">
      <h1 style={{ fontSize: 18 }}>Couldn’t load dataset “{name}”</h1>
      <p className="muted">{err}</p>
      <p className="muted">Check public/data/{name}/ has game.json, cameras.json and pitches.json (see DATA.md).</p>
      <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={toSessions}>Back to sessions</button>
    </div>
  );
  if (!ds) return <div style={{ padding: 40 }} className="muted">Loading {name}…</div>;
  return <Main />;
}

/** Launch flow: sign in, then pick a session, then the main view (see src/state/launch.ts). */
export default function App() {
  const [operator, setOperator] = useState(getOperator);
  const name = datasetName();
  if (!operator) return <LoginView onSignedIn={(n) => { signIn(n); setOperator(n); }} />;
  if (!name) return <SessionsView operator={operator} />;
  return <SessionApp name={name} />;
}
