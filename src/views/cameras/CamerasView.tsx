import { usePick } from '../../state/store';
import { useAlerts, useDs } from '../../state/hooks';
import { img } from '../../data/load';
import { GROUP, health, healthNote, isTracking, label, szParts, szState } from '../../data/model';
import { HealthDot, Seg, SevBadge } from '../../components/ui';
import { ZoomBox } from '../../components/ZoomBox';
import { ControlPanel, useAnyDirty } from './Control';

function CameraList() {
  const ds = useDs(); const st = usePick('cam', 'camFilter', 'set'); const anyDirty = useAnyDirty();
  const order = { crit: 0, warn: 1, ok: 2 };
  const rows = ds.cameras.map((c) => ({ c, h: health(c, ds) }))
    .filter(({ c, h }) => st.camFilter === 'all' || (st.camFilter === 'problems' ? h !== 'ok' : c.group === st.camFilter))
    .sort((a, b) => order[a.h] - order[b.h]);
  const healthy = ds.cameras.filter((c) => health(c, ds) === 'ok').length;
  const filters: [typeof st.camFilter, string][] = [['all', 'All'], ['problems', 'Problems'], ['pitchToPlate', 'PitchToPlate'], ['fullField', 'FullField'], ['biomechanics', 'Biomechanics']];
  return (
    <aside className="panel panel-pad col" style={{ flex: '0 0 290px', minWidth: 0, minHeight: 0, gap: 12 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ fontSize: 14, fontWeight: 600 }}>Cameras</h2><span className="mono small muted">{healthy}/{ds.cameras.length} healthy</span></div>
      <span className="tiny muted" style={{ lineHeight: 1.4 }}>Every camera is checked the same way: is it running, and at full frame rate. Problems sort to the top.</span>
      <div className="row wrap" style={{ gap: 4 }}>{filters.map(([k, l]) => <button key={k} type="button" className="filter" aria-pressed={st.camFilter === k} onClick={() => st.set({ camFilter: k })}>{l}</button>)}</div>
      <ul className="fill scroll" style={{ listStyle: 'none', margin: '0 -6px 0 0', padding: '0 6px 0 0', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {rows.map(({ c, h }) => {
          const on = st.cam === c.id;
          return (
            <li key={c.id}>
              <button type="button" aria-pressed={on} onClick={() => st.set({ cam: c.id, camTab: 'mosaic', resetOpen: false, bmcaNote: false, pickPt: null })}
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
  const ds = useDs(); const st = usePick('ack', 'cam', 'camTab', 'set'); const al = useAlerts();
  const c = ds.cameras.find((x) => x.id === st.cam) ?? ds.cameras[0];
  const h = health(c, ds);
  const tabs: [typeof st.camTab, string][] = isTracking(c) ? [['mosaic', 'Ball mosaic'], ['hit', 'Hit image'], ['tracking', 'Tracking window']] : [['mosaic', 'Ball mosaic'], ['still', 'Monitored image']];
  const tab = tabs.some(([k]) => k === st.camTab) ? st.camTab : tabs[0][0];
  const latest = ds.pitches.at(-1);
  const lastHit = [...ds.pitches].reverse().find((p) => p.hit);
  // which pitch the image belongs to (mosaic: the latest pitch; hit: the latest pitch with a hit)
  const shown = tab === 'mosaic' ? latest : tab === 'hit' ? lastHit : undefined;
  const src = tab === 'tracking' ? img(ds, c.images?.tracking ?? ds.game.defaultImages?.tracking)
    : tab === 'still' ? img(ds, c.images?.still ?? ds.game.defaultImages?.still)
    : tab === 'hit' ? (lastHit ? img(ds, lastHit.images?.[c.id]?.hit ?? ds.game.defaultImages?.hit) : undefined)
    : img(ds, latest?.images?.[c.id]?.mosaic ?? c.images?.mosaic ?? ds.game.defaultImages?.mosaic);
  const empty = !c.running ? 'No feed: this camera isn’t running' : tab === 'hit' ? (lastHit ? `No hit image for pitch ${lastHit.num} in this dataset` : 'No hits yet this game') : 'No image in this dataset';
  // its own alerts, plus grouped alerts it belongs to (e.g. cameras below full frame rate)
  const alerts = al.all.filter((a) => a.sev !== 'dev' && !a.replaced && (a.cameraId === c.id || a.members?.includes(c.id)));
  const focused = al.focus?.cameraId === c.id && !al.focus.acked;
  // multicam and player tracking show up as alerts when they go wrong, so they aren't repeated here
  const sz = latest?.strikeZone && isTracking(c) && c.id in latest.strikeZone ? szParts(latest.strikeZone[c.id]) : null;
  const szFact = (axis: 'X' | 'Z', v: number | null): [string, string, string] => {
    const t = szState(v, c, ds);
    return [`Strike zone ${axis} Δ · pitch ${latest!.num}`, v === null ? (t === 'none' ? '– (not contributing)' : 'no data') : (v >= 0 ? '+' : '') + v.toFixed(3), t === 'ok' || t === 'none' ? '' : t];
  };
  const facts: [string, string, string?][] = [
    ['Connection', c.running ? 'Connected' : 'Not connected', c.running ? '' : 'crit'],
    ['Frame rate', c.running ? `${c.fps}/${c.targetFps ?? ds.thresholds.targetFps}` : '—', !c.running ? 'crit' : c.fps < (c.targetFps ?? ds.thresholds.targetFps) ? 'warn' : ''],
    ...(sz ? [szFact('X', sz.x ?? sz.worst), szFact('Z', sz.z ?? sz.worst)] : []),
    ['Capture host', c.host ?? '—'],
  ];
  return (
    <div className="col fill" style={{ gap: 12 }}>
      <section className="panel fill" style={{ display: 'flex', flexDirection: 'column', border: focused ? '2px solid var(--warn)' : undefined }}>
        <div className="panel-head">
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{label(c)}</h2>
          <span className="mono small muted">{GROUP[c.group].name}</span>
          <span className={`pill ${h}`}>{h === 'ok' ? 'Healthy' : healthNote(c, ds)}</span>
          <span className="grow" />
          <Seg role="tablist" label="Camera feed" value={tab} onChange={(v) => st.set({ camTab: v })} options={tabs} />
        </div>
        <div className="stage fill" style={{ background: 'var(--deep)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {c.running && src ? (
            <ZoomBox zoomKey={`m:${c.id}:${tab}`} style={{ position: 'absolute', inset: 12, borderRadius: 6 }}>
              <img src={src} alt={`${label(c)} ${tab === 'tracking' ? 'tracking window' : tab === 'still' ? 'monitored image' : tab === 'hit' ? 'hit image' : 'ball mosaic'}`} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
            </ZoomBox>
          ) : <span className="muted">{empty}</span>}
          {c.running && src && shown && <span className="tag-over" style={{ left: 18, top: 18 }}>Pitch {shown.num}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 1, background: 'var(--border)', borderTop: '1px solid var(--border)', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
          {facts.map(([k, v, s]) => <div key={k} className="col" style={{ background: 'var(--panel)', padding: '10px 14px', gap: 2 }}><span className="lbl">{k}</span><span className="mono" style={{ fontSize: 16, fontWeight: 600, color: s === 'crit' ? 'var(--crit-ink)' : s === 'warn' ? 'var(--warn-ink)' : 'var(--text-hi)' }}>{v}</span></div>)}
        </div>
        {!isTracking(c) && <div className="small muted" style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>Biomechanics camera: no live tracking, so there are no tracking metrics to show.</div>}
      </section>
      <section className="panel scroll" style={{ flex: '0 1 auto', maxHeight: 200, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600 }}>Alerts on {label(c)}</h2>
        {alerts.length === 0 && <span className="small muted">{h === 'ok' ? 'None. This camera is healthy.' : `No alert of its own: ${healthNote(c, ds)}.`}</span>}
        {alerts.map((a) => (
          <div key={a.id} className="row card" style={{ alignItems: 'flex-start', gap: 10, padding: 10 }}>
            <SevBadge sev={a.sev} />
            <span className="col grow" style={{ gap: 2 }}><span style={{ fontWeight: 600 }}>{a.title}</span>{a.raw && <span className="mono tiny" style={{ color: '#A5B0BF', lineHeight: 1.5 }}>{a.raw}</span>}</span>
            {a.acked ? <span className="tiny" style={{ fontWeight: 700, color: 'var(--ok-ink)' }}>Acknowledged</span> : <button type="button" className="btn primary" onClick={() => st.ack(a.id)}>Acknowledge</button>}
          </div>
        ))}
      </section>
    </div>
  );
}

export function CamerasView() {
  const st = usePick('camSub', 'set'); const ds = useDs(); const anyDirty = useAnyDirty();
  const dirty = ds.cameras.filter((c) => anyDirty(c.id)).length;
  return (
    <div className="view fit-row">
      <CameraList />
      <main className="col" style={{ flex: '999 1 560px', minWidth: 0, minHeight: 0, gap: 12 }}>
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
