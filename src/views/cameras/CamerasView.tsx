import { useUi } from '../../state/store';
import { useAlerts, useDs } from '../../state/hooks';
import { img } from '../../data/load';
import { GROUP, health, healthNote, isTracking, label } from '../../data/model';
import { HealthDot, Seg, SevBadge } from '../../components/ui';
import { ZoomBox } from '../../components/ZoomBox';
import { ControlPanel, useAnyDirty } from './Control';

function CameraList() {
  const ds = useDs(); const st = useUi(); const anyDirty = useAnyDirty();
  const order = { crit: 0, warn: 1, ok: 2 };
  const rows = ds.cameras.map((c) => ({ c, h: health(c, ds) }))
    .filter(({ c, h }) => st.camFilter === 'all' || (st.camFilter === 'problems' ? h !== 'ok' : c.group === st.camFilter))
    .sort((a, b) => order[a.h] - order[b.h]);
  const healthy = ds.cameras.filter((c) => health(c, ds) === 'ok').length;
  const filters: [typeof st.camFilter, string][] = [['all', 'All'], ['problems', 'Problems'], ['pitchToPlate', 'PitchToPlate'], ['fullField', 'FullField'], ['biomechanics', 'Biomechanics']];
  return (
    <aside className="panel panel-pad col" style={{ flex: '1 1 270px', maxWidth: 300, minWidth: 0, gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ fontSize: 14, fontWeight: 600 }}>Cameras</h2><span className="mono small muted">{healthy}/{ds.cameras.length} healthy</span></div>
      <span className="tiny muted" style={{ lineHeight: 1.4 }}>Every camera is checked the same way: is it running, and at full frame rate. Problems sort to the top.</span>
      <div className="row wrap" style={{ gap: 4 }}>{filters.map(([k, l]) => <button key={k} type="button" className="filter" aria-pressed={st.camFilter === k} onClick={() => st.set({ camFilter: k })}>{l}</button>)}</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map(({ c, h }) => {
          const on = st.cam === c.id;
          return (
            <li key={c.id}>
              <button type="button" aria-pressed={on} onClick={() => st.set({ cam: c.id, camTab: isTracking(c) ? 'tracking' : 'mosaic', resetOpen: false, bmcaNote: false, pickPt: null })}
                className="row" style={{ width: '100%', gap: 8, padding: '8px 10px', borderRadius: 7, textAlign: 'left', minHeight: 38, background: on ? 'var(--sel)' : 'transparent', border: `1px solid ${on ? 'var(--accent-edge)' : 'transparent'}` }}>
                <HealthDot h={h} />
                <span className="col grow" style={{ gap: 1 }}>
                  <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{label(c)}</span>
                  {h !== 'ok' && <span className="mono tiny" style={{ color: h === 'warn' ? 'var(--warn-ink)' : 'var(--crit-ink)' }}>{healthNote(c, ds)}</span>}
                  {anyDirty(c.id) && <span style={{ alignSelf: 'flex-start', fontSize: 9, fontWeight: 700, letterSpacing: '.06em', padding: '1px 5px', borderRadius: 3, background: '#16314A', color: 'var(--unsaved)' }}>UNSAVED</span>}
                </span>
                {h === 'ok' && <span className="mono tiny" style={{ color: '#9FD9BA' }}>{healthNote(c, ds)}</span>}
                <span className="mono" style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: '#1E242E', color: 'var(--text-3)' }}>{GROUP[c.group].tag}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function Monitoring() {
  const ds = useDs(); const st = useUi(); const al = useAlerts();
  const c = ds.cameras.find((x) => x.id === st.cam) ?? ds.cameras[0];
  const h = health(c, ds);
  const tabs: [typeof st.camTab, string][] = isTracking(c) ? [['tracking', 'Tracking window'], ['mosaic', 'Ball mosaic']] : [['mosaic', 'Ball mosaic'], ['still', 'Monitored image']];
  const tab = tabs.some(([k]) => k === st.camTab) ? st.camTab : tabs[0][0];
  const latest = ds.pitches.at(-1);
  const src = tab === 'tracking' ? img(ds, c.images?.tracking ?? ds.game.defaultImages?.tracking)
    : tab === 'still' ? img(ds, c.images?.still ?? ds.game.defaultImages?.still)
    : img(ds, latest?.images?.[c.id]?.mosaic ?? c.images?.mosaic ?? ds.game.defaultImages?.mosaic);
  const alerts = al.all.filter((a) => a.cameraId === c.id && a.sev !== 'dev');
  const focused = al.focus?.cameraId === c.id && !al.focus.acked;
  const facts: [string, string, string?][] = [
    ['Frame rate', c.running ? `${c.fps}/${c.targetFps ?? ds.thresholds.targetFps}` : '—', !c.running ? 'crit' : c.fps < ds.thresholds.targetFps ? 'warn' : ''],
    ['Running', c.running ? 'Yes' : 'No', c.running ? '' : 'crit'],
    ...(c.tracking ? [['Multicam frames', c.tracking.multicamPresent ? 'Present' : 'Missing', c.tracking.multicamPresent ? '' : 'crit'], ['Player tracking', c.tracking.playerTracking ? 'Running' : 'Skipped', c.tracking.playerTracking ? '' : 'warn']] as [string, string, string][] : []),
    ...(latest && isTracking(c) ? [['Strike zone Δ (last)', latest.strikeZone[c.id] == null ? 'no data' : latest.strikeZone[c.id]!.toFixed(3), latest.strikeZone[c.id] == null ? 'crit' : '']] as [string, string, string][] : []),
    ['Capture host', c.host ?? '—'],
  ];
  return (
    <>
      <section className="panel" style={{ border: focused ? '2px solid var(--warn)' : undefined }}>
        <div className="panel-head">
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{label(c)}</h2>
          <span className="mono small muted">{GROUP[c.group].name}</span>
          <span className={`pill ${h}`}>{h === 'ok' ? 'Healthy' : healthNote(c, ds)}</span>
          <span className="grow" />
          <Seg role="tablist" label="Camera feed" value={tab} onChange={(v) => st.set({ camTab: v })} options={tabs} />
        </div>
        <div style={{ padding: 12, background: 'var(--deep)', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 360 }}>
          {c.running && src ? (
            <ZoomBox zoomKey={`m:${c.id}:${tab}`} style={{ width: '100%', borderRadius: 6, border: '1px solid var(--line)' }}>
              <img src={src} alt={`${label(c)} ${tab === 'tracking' ? 'tracking window' : tab === 'still' ? 'monitored image' : 'ball mosaic'}`} draggable={false} style={{ width: '100%', display: 'block' }} />
            </ZoomBox>
          ) : <span className="muted" style={{ padding: '60px 0' }}>{c.running ? 'No image in this dataset' : 'No feed: this camera isn’t running'}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: 'var(--border)', borderTop: '1px solid var(--border)', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
          {facts.map(([k, v, s]) => <div key={k} className="col" style={{ background: 'var(--panel)', padding: '10px 14px', gap: 2 }}><span className="lbl">{k}</span><span className="mono" style={{ fontSize: 16, fontWeight: 600, color: s === 'crit' ? 'var(--crit-ink)' : s === 'warn' ? 'var(--warn-ink)' : 'var(--text-hi)' }}>{v}</span></div>)}
        </div>
        {!isTracking(c) && <div className="small muted" style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>Biomechanics camera: no live tracking, so there are no tracking metrics to show.</div>}
      </section>
      <section className="panel" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>Alerts on {label(c)}</h2>
        {alerts.length === 0 && <span className="small muted">None. This camera is healthy.</span>}
        {alerts.map((a) => (
          <div key={a.id} className="row card" style={{ alignItems: 'flex-start', gap: 10, padding: 10 }}>
            <SevBadge sev={a.sev} />
            <span className="col grow" style={{ gap: 2 }}><span style={{ fontWeight: 600 }}>{a.title}</span>{a.raw && <span className="mono tiny" style={{ color: '#A5B0BF', lineHeight: 1.5 }}>{a.raw}</span>}</span>
            {a.acked ? <span className="tiny" style={{ fontWeight: 700, color: 'var(--ok-ink)' }}>Acknowledged</span> : <button type="button" className="btn primary" onClick={() => st.ack(a.id)}>Acknowledge</button>}
          </div>
        ))}
      </section>
    </>
  );
}

export function CamerasView() {
  const st = useUi(); const ds = useDs(); const anyDirty = useAnyDirty();
  const dirty = ds.cameras.filter((c) => anyDirty(c.id)).length;
  return (
    <div className="view" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', alignContent: 'flex-start' }}>
      <CameraList />
      <main className="col" style={{ flex: '999 1 560px', minWidth: 0, gap: 12 }}>
        <div className="row wrap" style={{ gap: 12 }}>
          <Seg role="tablist" large label="Camera mode" value={st.camSub} onChange={(v) => st.set({ camSub: v, resetOpen: false })} options={[['monitor', 'Monitoring'], ['control', 'Control']]} />
          <span className="small muted" style={{ flex: '1 1 240px' }}>{st.camSub === 'monitor' ? 'Health and feeds for each camera.' : 'Image, ball tuning and calibration for the selected camera. Everything else stays in BMCA.'}</span>
          {dirty > 0 && <span className="small" style={{ fontWeight: 600, padding: '4px 10px', borderRadius: 6, background: '#16314A', color: 'var(--unsaved)' }}>{dirty} camera{dirty > 1 ? 's' : ''} with unsaved changes</span>}
        </div>
        {st.camSub === 'monitor' ? <Monitoring /> : <ControlPanel />}
      </main>
    </div>
  );
}
