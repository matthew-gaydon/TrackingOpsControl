import { usePick, useUi } from '../../state/store';
import { useAlerts, useDs, usePpOps } from '../../state/hooks';
import { img } from '../../data/load';
import { GROUP, health, healthNote, isBad, label, mark, rawTaskState, reviewable, strikeZone, taskState, TASKS, type Health } from '../../data/model';
import type { CameraFile, PitchFile } from '../../data/types';
import { Chevron, GoPopout, HealthDot, Seg } from '../../components/ui';
import { ZoomBox, wasDrag } from '../../components/ZoomBox';

type FV = 'combined' | 'pitchToPlate' | 'fullField' | 'biomechanics';

function HealthTiles() {
  const ds = useDs(); const st = usePick('goTo', 'set'); const al = useAlerts(); const ops = usePpOps();
  const hs = ds.cameras.map((c) => ({ c, h: health(c, ds) }));
  const problems = hs.filter((x) => x.h !== 'ok');
  const down = hs.filter((x) => x.h === 'crit').length;
  const slow = ds.cameras.filter((c) => c.running && c.fps < (c.targetFps ?? ds.thresholds.targetFps)).length;
  const pt = ds.cameras.filter((c) => c.tracking && !c.tracking.playerTracking).length;
  let okT = 0, badT = 0;
  ds.pitches.forEach((p) => [0, 1, 2].forEach((k) => (isBad(taskState(p, k, ops)) ? badT++ : okT++)));
  const ppAlerts = al.countFor('pp').n;
  const t = ds.game.timing; const timingBad = t.tssOffsetMs > ds.thresholds.tssOffsetMaxMs || t.latencyMs > ds.thresholds.latencyMaxMs;
  const dataBad = timingBad || !ds.game.redundancy.bdsConnected;
  const tiles: { label: string; value: string; note: string; h: Health; go: () => void }[] = [
    { label: 'Cameras', value: `${ds.cameras.length - problems.length} / ${ds.cameras.length} healthy`, h: down ? 'crit' : problems.length ? 'warn' : 'ok',
      note: [down && `${down} not running`, slow && `${slow} below full rate`, pt && `${pt} skipping player tracking`].filter(Boolean).join(' · ') || 'All running at full rate',
      go: () => st.set({ view: 'cameras', camSub: 'monitor', camFilter: problems.length ? 'problems' : 'all', cam: (problems.sort((a, b) => (a.h === 'crit' ? -1 : 1) - (b.h === 'crit' ? -1 : 1))[0]?.c ?? ds.cameras[0]).id, focusAlertId: null, prevView: 'game' }) },
    { label: 'Post-processing', value: `${okT.toLocaleString()} ok · ${badT} need attention`, h: badT ? 'warn' : 'ok', note: ppAlerts ? `${ppAlerts} alert${ppAlerts > 1 ? 's' : ''} to review` : 'Nothing to review',
      go: () => st.set({ view: 'pp', focusAlertId: null, prevView: 'game' }) },
    { label: 'Data & timing', value: `${ds.game.redundancy.bdsConnected ? 'BDS connected' : 'BDS down'} · TSS ${timingBad ? t.tssOffsetMs + ' ms' : 'ok'}`, h: dataBad ? 'warn' : 'ok', note: `Latency ${t.latencyMs} ms ${t.latencyMs > ds.thresholds.latencyMaxMs ? 'high' : 'normal'}`,
      go: () => { const a = [al.byKey.bds, al.byKey.timing].find((x) => x && !x.cleared); if (a) st.goTo(a); } },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
      {tiles.map((x) => (
        <button key={x.label} type="button" onClick={x.go} className="row" style={{ gap: 12, padding: '12px 14px', borderRadius: 10, textAlign: 'left', minHeight: 64, background: 'var(--panel)', border: `1px solid ${x.h === 'ok' ? 'var(--border)' : x.h === 'warn' ? 'var(--warn-edge)' : 'var(--crit-edge)'}` }}>
          <HealthDot h={x.h} size={12} />
          <span className="col grow" style={{ gap: 2, alignItems: 'flex-start' }}>
            <span className="small" style={{ color: 'var(--text-3)' }}>{x.label}</span>
            <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-hi)' }}>{x.value}</span>
            <span className="tiny" style={{ color: x.h === 'ok' ? 'var(--muted)' : x.h === 'warn' ? 'var(--warn-ink)' : 'var(--crit-ink)' }}>{x.note}</span>
          </span>
          <Chevron />
        </button>
      ))}
    </div>
  );
}

function Combined({ hit }: { hit?: { trackPct: number; distanceFt: number } | null }) {
  const show = useUi((s) => s.lastHitOverlay);
  return (
    <div className="stage fill" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, background: '#0D1012', borderRadius: '0 0 10px 10px' }}>
      <svg viewBox="0 0 600 450" role="img" aria-label="Combined bird's-eye view with tracked players and the last pitch path" style={{ width: '100%', height: '100%', maxWidth: 1000 }}>
        <path d="M300 445 L40 185 Q60 30 300 18 Q540 30 560 185 Z" fill="#17301F" stroke="#2E4A37" strokeWidth="2" />
        <path d="M300 410 L70 180 Q300 -30 530 180 Z" fill="#1C3A26" />
        <circle cx="300" cy="335" r="92" fill="#3D3122" />
        <path d="M300 405 L368 337 L300 269 L232 337 Z" fill="#1C3A26" stroke="#D9D2C3" strokeWidth="1.5" />
        <path d="M300 405 L40 145 M300 405 L560 145" stroke="#D9D2C3" strokeWidth="1.5" opacity=".8" />
        <circle cx="300" cy="337" r="11" fill="#4A3B29" />
        {[[294, 400, 12, 9], [364, 333, 8, 8], [296, 265, 8, 8], [228, 333, 8, 8]].map(([x, y, w, h]) => <rect key={x + ':' + y} x={x} y={y} width={w} height={h} fill="#F3EEE3" />)}
        <path d="M300 337 Q301 372 300 401" stroke="#5AB8FF" strokeWidth="3" fill="none" strokeDasharray="1 6" strokeLinecap="round" />
        <circle cx="300" cy="401" r="4" fill="#5AB8FF" />
        {show && hit && (
          <g>
            <path d="M300 401 Q360 250 452 128" stroke="#C6A4FF" strokeWidth="2.5" fill="none" strokeDasharray="6 5" />
            <circle cx="452" cy="128" r="6" fill="none" stroke="#C6A4FF" strokeWidth="2" />
            <text x="440" y="112" textAnchor="end" fill="#DCC8FF" fontSize="12" fontFamily="IBM Plex Mono, monospace">{hit.distanceFt} ft · track {hit.trackPct}%</text>
          </g>
        )}
        <g fill="#F06BD4">{[[300, 333], [306, 414], [290, 418], [352, 318], [330, 268], [262, 282], [240, 326], [170, 190], [300, 120], [430, 190], [388, 352]].map(([x, y]) => <circle key={x + ':' + y} cx={x} cy={y} r="4" />)}</g>
      </svg>
      <span className="row tiny" style={{ position: 'absolute', left: 16, bottom: 14, gap: 12, color: 'var(--text-3)', background: 'rgba(11,14,19,.88)', padding: '4px 8px', borderRadius: 5 }}>
        <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: '#F06BD4' }} />Players</span>
        <span className="row" style={{ gap: 5 }}><span className="dot" style={{ background: '#5AB8FF' }} />Last pitch</span>
        <span className="muted">Placeholder positions: wire to tracking output</span>
      </span>
    </div>
  );
}

function CamImage({ c, p, mode, big }: { c: CameraFile; p: PitchFile; mode: 'mosaic' | 'hit'; big?: boolean }) {
  const ds = useDs();
  if (mode === 'hit') {
    if (!p.hit) return <span className="tiny" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7F8B9C' }}>No hit on this pitch</span>;
    const src = img(ds, p.images?.[c.id]?.hit ?? ds.game.defaultImages?.hit);
    if (src) return <img src={src} alt={`${label(c)} hit image`} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />;
    return (
      <span className="col" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>
        <svg width="60%" height="55%" viewBox="0 0 120 50" aria-hidden="true"><path d="M8 44 Q50 -6 112 18" fill="none" stroke="#C6A4FF" strokeWidth="2" strokeDasharray="5 4" /><circle cx="8" cy="44" r="3" fill="#C6A4FF" /></svg>
        {big && <span>Hit image placeholder (add pitches[].images.{c.id}.hit)</span>}
      </span>
    );
  }
  const src = img(ds, p.images?.[c.id]?.mosaic ?? c.images?.mosaic ?? ds.game.defaultImages?.mosaic);
  return src ? <img src={src} alt={big ? `${label(c)} ball mosaic` : ''} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : null;
}

function FieldPanel({ p, reviewing }: { p: PitchFile; reviewing: boolean }) {
  const ds = useDs(); const st = usePick('bigCam', 'fieldView', 'imgMode', 'lastHitOverlay', 'set');
  const fv = st.fieldView as FV;
  const cams = fv === 'combined' ? [] : ds.cameras.filter((c) => c.group === fv);
  const mode = fv === 'biomechanics' ? 'mosaic' : st.imgMode;
  const big = st.bigCam ? cams.find((c) => c.id === st.bigCam) : undefined;
  const step = (d: number) => { const i = cams.findIndex((c) => c.id === st.bigCam); st.set({ bigCam: cams[(i + d + cams.length) % cams.length].id }); };
  const latest = ds.pitches.at(-1)!;
  const badge = (c: CameraFile) => { const h = health(c, ds); return h === 'ok' ? null : <span className="tag-over" style={{ right: 6, top: 6, color: h === 'crit' ? 'var(--crit-ink)' : 'var(--warn-ink)', fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 10 }}>{healthNote(c, ds)}</span>; };
  return (
    <section className="panel" style={{ flex: '999 1 600px', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="row wrap" style={{ gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <Seg role="tablist" label="Field view" value={fv} onChange={(v) => st.set({ fieldView: v, bigCam: null })}
          options={[['combined', 'Combined'], ['pitchToPlate', 'PitchToPlate'], ['fullField', 'FullField'], ['biomechanics', 'Biomechanics']]} />
        <span className="small muted">{fv === 'combined' ? 'Live bird’s-eye view' : `${cams.length} cameras · ${mode === 'hit' ? 'hit images' : 'ball mosaics'}`}</span>
        <span className="grow" />
        {fv === 'combined' && <label className="row small" style={{ gap: 6, color: 'var(--text-3)' }}><input type="checkbox" checked={st.lastHitOverlay} onChange={() => st.set({ lastHitOverlay: !st.lastHitOverlay })} />Last hit overlay</label>}
        {(fv === 'pitchToPlate' || fv === 'fullField') && <Seg label="Image type" value={st.imgMode} onChange={(v) => st.set({ imgMode: v })} options={[['mosaic', 'Ball mosaic'], ['hit', 'Hit image']]} />}
      </div>
      {fv === 'combined' ? <Combined hit={[...ds.pitches].reverse().find((x) => x.hit)?.hit ?? latest.hit} /> : (
        <div className="col fill" style={{ gap: 10, padding: 12, background: '#0D1012', borderRadius: '0 0 10px 10px' }}>
          <div className="row wrap">
            <span className="mono" style={{ fontSize: 13 }}>Pitch {p.num} · {p.time}</span>
            {reviewing && <span className="pill info">REVIEW</span>}
            <span className="grow" />
            {big && <button type="button" className="btn" onClick={() => st.set({ bigCam: null })}>All {cams.length} cameras</button>}
          </div>
          {!big ? (
            <div className="fill scroll" style={{ display: 'grid', alignContent: 'start', gap: 8, gridTemplateColumns: `repeat(${fv === 'biomechanics' ? 4 : fv === 'fullField' ? 4 : 3}, minmax(0, 1fr))` }}>
              {cams.map((c) => (
                <button key={c.id} type="button" aria-label={`${label(c)}, enlarge`} onClick={() => { if (!wasDrag()) st.set({ bigCam: c.id }); }}
                  style={{ position: 'relative', aspectRatio: '2.4 / 1', padding: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--deep)' }}>
                  <ZoomBox as="span" zoomKey={`g:${fv}:${c.id}:${mode}:${p.num}`} controls={false} style={{ position: 'absolute', inset: 0, display: 'block' }}>
                    <CamImage c={c} p={p} mode={mode} />
                  </ZoomBox>
                  <span className="tag-over" style={{ left: 6, top: 6 }}>{mark(c)}</span>
                  {badge(c)}
                </button>
              ))}
            </div>
          ) : (
            <div className="row stage fill" style={{ gap: 10 }}>
              <button type="button" className="icon-btn" aria-label="Previous camera" onClick={() => step(-1)} style={{ width: 40, height: 40 }}><Chevron dir="left" /></button>
              <div style={{ flex: '1 1 auto', alignSelf: 'stretch', minWidth: 0, containerType: 'size', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <ZoomBox zoomKey={`gb:${fv}:${big.id}:${mode}:${p.num}`} style={{ width: 'min(100cqw, calc(100cqh * 2.4))', aspectRatio: '2.4 / 1', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--deep)' }}>
                  <CamImage c={big} p={p} mode={mode} big />
                </ZoomBox>
              </div>
              <button type="button" className="icon-btn" aria-label="Next camera" onClick={() => step(1)} style={{ width: 40, height: 40 }}><Chevron /></button>
            </div>
          )}
          {big && <span className="mono small">{label(big)} · {GROUP[big.group].tag}</span>}
          <span className="tiny muted">Click a camera to enlarge it, then step through cameras. Scroll on any image to zoom, drag to pan.</span>
        </div>
      )}
    </section>
  );
}

function PitchCard({ p, reviewing, latestNum }: { p: PitchFile; reviewing: boolean; latestNum: number }) {
  const ds = useDs(); const st = usePick('pop', 'set', 'szAll'); const ops = usePpOps();
  const pass = p.confidence > ds.thresholds.confidencePass;
  const sz = strikeZone(p, ds);
  const bad = sz.filter((z) => z.state !== 'ok');
  const tol = ds.thresholds.strikeZoneTolerance;
  const fromGame = (ch: Parameters<typeof st.set>[0]) => st.set({ ...(ch as object), crumbPitch: p.num, focusAlertId: null, pop: null } as never);
  const pop = (k: string) => st.set({ pop: st.pop === k ? null : k });
  const quick = [
    { k: 'conf', label: 'Confidence', value: `${p.confidence.toFixed(2)} ${pass ? 'PASS' : 'FAIL'}`, bad: !pass, sub: `track ${p.trackLength} · quality ${p.trackQuality}`,
      text: `Pitch ${p.num} failed confidence. Show its PitchToPlate ball mosaics in the field panel?`, go: () => st.set({ pop: null, fieldView: 'pitchToPlate', imgMode: 'mosaic', bigCam: null }) },
    { k: 'acs', label: 'ACS delivery', value: p.acsDelivered ? 'Delivered' : 'Not delivered', bad: !p.acsDelivered, sub: '' },
    { k: 'hit', label: 'Hit', value: p.hit ? `${p.hit.distanceFt} ft · ${p.hit.trackPct}%` : 'No hit', bad: !!p.hit && p.hit.trackPct < ds.thresholds.hitTrackGoodPct, sub: p.hit ? (p.hit.trackPct >= ds.thresholds.hitTrackGoodPct ? 'Good hit track' : 'Poor hit track') : '',
      text: `Pitch ${p.num} has a poor hit track. Show its FullField hit images?`, go: () => st.set({ pop: null, fieldView: 'fullField', imgMode: 'hit', bigCam: null }) },
  ];
  const navBtn = { width: 32, height: 32 };
  return (
    <aside className="panel panel-pad col scroll" style={{ flex: '1 1 380px', maxWidth: 460, minWidth: 0, gap: 10 }}>
      <div className="row">
        <button type="button" className="icon-btn" style={navBtn} aria-label="Previous pitch" disabled={p.num <= 1} onClick={() => st.set({ gameSel: p.num - 1, pop: null })}><Chevron dir="left" /></button>
        <div className="col grow" style={{ gap: 0 }}><h2 style={{ fontSize: 16, fontWeight: 600 }}>Pitch {p.num}</h2><span className="mono small muted">{p.time}</span></div>
        {reviewing && <span className="pill info">REVIEW</span>}
        <button type="button" className="icon-btn" style={navBtn} aria-label="Next pitch" disabled={!reviewing} onClick={() => st.set({ gameSel: p.num + 1 >= latestNum ? null : p.num + 1, pop: null })}><Chevron /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {quick.map((q) => {
          const box = { display: 'flex', flexDirection: 'column' as const, gap: 4, padding: 10, borderRadius: 8, textAlign: 'left' as const, background: q.bad ? 'var(--warn-bg)' : 'var(--panel-2)', border: `1px solid ${q.bad ? (st.pop === q.k ? 'var(--warn-ink)' : 'var(--warn-edge)') : 'var(--border)'}` };
          const inner = (<><span className="tiny" style={{ color: 'var(--text-2)' }}>{q.label}</span><span className="mono" style={{ fontSize: 14, fontWeight: 600, color: q.bad ? 'var(--warn-ink)' : 'var(--text-hi)' }}>{q.value}</span>{q.sub && <span className="tiny muted">{q.sub}</span>}</>);
          return q.bad && q.go ? <button key={q.k} type="button" style={box} onClick={() => pop(q.k)} aria-label={`${q.label} problem, show details`}>{inner}</button> : <div key={q.k} style={box}>{inner}</div>;
        })}
      </div>
      {quick.filter((q) => q.bad && q.go && st.pop === q.k).map((q) => <GoPopout key={q.k} text={q.text!} onGo={q.go!} onCancel={() => st.set({ pop: null })} />)}

      <div className="col" style={{ gap: 10, padding: 12, borderRadius: 8, background: 'var(--panel-2)', border: `1px solid ${bad.length ? 'var(--warn-edge)' : 'var(--border)'}` }}>
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <span className="lbl">Strike zone agreement</span>
          <Seg label="Strike zone cameras shown" value={st.szAll ? 'all' : 'problems'} onChange={(v) => st.set({ szAll: v === 'all' })} options={[['problems', 'Problems only'], ['all', `All ${sz.length}`]]} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: bad.length ? 'var(--warn-ink)' : 'var(--ok-ink)' }}>{bad.length ? `${bad.length} of ${sz.length} cameras need a look` : `All ${sz.length} agree`}</span>
        <span className="mono tiny muted">Tolerance ±{tol}</span>
        {!st.szAll ? (bad.length === 0
          ? <div className="row" style={{ gap: 10, padding: 14, borderRadius: 8, background: '#112219', border: '1px solid #23503A', color: '#BFE8D2' }}><HealthDot h="ok" size={10} />All {sz.length} tracking cameras agree within tolerance</div>
          : bad.map((z) => (
            <div key={z.cam.id} className="col" style={{ gap: 6 }}>
              <button type="button" onClick={() => pop('sz' + z.cam.id)} aria-label={`${label(z.cam)} strike zone problem, show details`}
                className="row" style={{ width: '100%', gap: 10, padding: 10, borderRadius: 8, textAlign: 'left', background: z.state === 'crit' ? 'var(--crit-bg)' : 'var(--warn-bg)', border: `1px solid ${z.state === 'crit' ? 'var(--crit-edge)' : 'var(--warn-edge)'}` }}>
                <span className="mono" style={{ fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#0B0E13' }}>{mark(z.cam)}</span>
                <span className="col grow" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{label(z.cam)}</span><span className="small" style={{ color: 'var(--text-2)' }}>{z.d === null ? 'No data for this pitch' : 'Out of tolerance'}</span></span>
                <span className="mono" style={{ color: z.state === 'crit' ? 'var(--crit-ink)' : 'var(--warn-ink)' }}>{z.d === null ? '—' : `Δ ${z.d.toFixed(3)}`}</span><Chevron />
              </button>
              {st.pop === 'sz' + z.cam.id && <GoPopout text={`Open ${label(z.cam)} in Cameras to check its feed and ball mosaic for pitch ${p.num}?`} onCancel={() => st.set({ pop: null })}
                onGo={() => fromGame({ view: 'cameras', cam: z.cam.id, camTab: 'mosaic', camFilter: 'all', camSub: 'monitor' })} />}
            </div>
          ))) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5 }}>
            {sz.map((z) => (
              <div key={z.cam.id} className="col" style={{ gap: 2, alignItems: 'center', padding: '6px 2px', borderRadius: 6, background: z.state === 'ok' ? '#112219' : z.state === 'warn' ? 'var(--warn-bg)' : 'var(--crit-bg)', border: `1px ${z.d === null ? 'dashed' : 'solid'} ${z.state === 'ok' ? '#23503A' : z.state === 'warn' ? 'var(--warn-edge)' : 'var(--crit-edge)'}` }}>
                <span className="mono small" style={{ fontWeight: 700 }}>{mark(z.cam)}</span><span className="mono tiny">{z.d === null ? 'no data' : z.d.toFixed(3)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="col">
        <span className="lbl">Post-processing</span>
        {TASKS.map((n, k) => {
          const t = taskState(p, k, ops); const ok = t === 'ok' || t === 'reviewed'; const red = rawTaskState(p, k) === 'crit' && t === 'crit';
          const value = k === 0 ? `${p.pp.release.mph ?? '—'} mph` : k === 1 ? `${p.pp.spin.rpm ?? '—'} rpm · err ${p.pp.spin.fitError ?? '—'}` : t === 'ok' ? 'Valid' : t === 'crit' ? 'Failed' : t === 'reviewed' ? 'Validation failed · reviewed' : 'Validation failed';
          const review = reviewable(p, k, ops);
          const status = t === 'reviewed' ? 'Reviewed' : t === 'ok' ? 'Success' : t === 'queued' || t === 'processing' ? 'Queued' : review && !red ? 'Needs review' : 'Failed';
          const box = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, textAlign: 'left' as const, background: ok ? 'var(--panel-2)' : red ? 'var(--crit-bg)' : 'var(--warn-bg)', border: `1px solid ${ok ? 'var(--border)' : red ? 'var(--crit-edge)' : 'var(--warn-edge)'}` };
          const inner = (<><HealthDot h={ok ? 'ok' : red ? 'crit' : 'warn'} size={10} /><span className="col grow" style={{ gap: 0 }}><span className="small" style={{ color: 'var(--text-3)' }}>{n}</span>{(ok || k === 2 || review) && <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-hi)' }}>{value}</span>}</span><span className={`pill ${ok ? (t === 'reviewed' ? 'info' : 'ok') : red ? 'crit' : 'warn'}`}>{status}</span></>);
          return (
            <div key={n} className="col" style={{ gap: 6 }}>
              {ok ? <div style={box}>{inner}</div> : <button type="button" style={box} onClick={() => pop('pp' + k)} aria-label={`${n} ${status}, show details`}>{inner}<Chevron /></button>}
              {st.pop === 'pp' + k && <GoPopout text={`Open the ${n} task for pitch ${p.num} in Post-processing to review it?`} onCancel={() => st.set({ pop: null })}
                onGo={() => fromGame({ view: 'pp', ppSel: p.num, ppPicks: {}, ppTask: k, ppFilter: 'all' })} />}
            </div>
          );
        })}
      </div>
      {(ds.game.timing.tssOffsetMs > ds.thresholds.tssOffsetMaxMs || ds.game.timing.latencyMs > ds.thresholds.latencyMaxMs) && (
        <div className="row small" style={{ gap: 10, padding: '9px 10px', borderRadius: 8, background: 'var(--warn-bg)', border: '1px solid #4E3E17' }}>
          <HealthDot h="warn" size={8} /><span className="grow" style={{ color: '#FFE0A0' }}>Timing: TSS offset {ds.game.timing.tssOffsetMs} ms</span><span className="mono" style={{ color: 'var(--text-3)' }}>latency {ds.game.timing.latencyMs} ms</span>
        </div>
      )}
    </aside>
  );
}

function Timeline({ sel }: { sel: number }) {
  const ds = useDs(); const st = usePick('set'); const ops = usePpOps();
  const latest = ds.pitches.at(-1)!.num;
  const C = { ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', none: '#2A313C', hit: '#B48CFF' };
  const lane = (c: string) => ({ display: 'block', height: 6, margin: '4px 0', borderRadius: 2, background: c });
  return (
    <section className="panel" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row wrap" style={{ gap: 12 }}><h2 style={{ fontSize: 14, fontWeight: 600 }}>Pitch timeline</h2><span className="small muted">Click any pitch to jump to it. Red and amber mark errors; purple marks hits.</span></div>
      <div className="row" style={{ alignItems: 'stretch', gap: 10 }}>
        <div className="col tiny muted" style={{ gap: 3, paddingTop: 3, lineHeight: '14px', flex: '0 0 auto', width: 60 }}>
          <span style={{ height: 30, display: 'flex', alignItems: 'center' }}>Verdict</span>
          {['Hit', 'ACS', 'Release', 'Spin', 'Trackpac'].map((x) => <span key={x} style={{ height: 14 }}>{x}</span>)}
        </div>
        <div className="row" style={{ gap: 3, flex: '1 1 auto', minWidth: 0, overflowX: 'auto', alignItems: 'stretch' }}>
          {ds.pitches.map((p) => {
            const pass = p.confidence > ds.thresholds.confidencePass;
            const ts = [0, 1, 2].map((k) => taskState(p, k, ops));
            const on = p.num === sel;
            return (
              <button key={p.num} type="button" aria-label={`Pitch ${p.num}${pass ? '' : ', confidence fail'}`} onClick={() => st.set({ gameSel: p.num === latest ? null : p.num, pop: null })}
                style={{ flex: '1 0 22px', display: 'flex', flexDirection: 'column', gap: 3, padding: '3px 2px', borderRadius: 5, border: `1px solid ${on ? 'var(--accent)' : 'transparent'}`, background: on ? 'var(--sel)' : 'transparent' }}>
                <span className="mono" style={{ height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 10, fontWeight: 700, background: pass ? '#13261C' : 'var(--crit-bg)', color: pass ? 'var(--ok-ink)' : 'var(--crit-ink)' }}>{p.num}</span>
                <span style={lane(p.hit ? (p.hit.trackPct >= ds.thresholds.hitTrackGoodPct ? C.hit : C.warn) : C.none)} />
                <span style={lane(p.acsDelivered ? C.ok : C.warn)} />
                {ts.map((t, k) => <span key={k} style={lane(t === 'ok' || t === 'reviewed' ? C.ok : t === 'crit' ? C.crit : t === 'warn' ? C.warn : 'var(--accent)')} />)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function GameView() {
  const ds = useDs(); const st = usePick('gameSel', 'set');
  const latest = ds.pitches.at(-1)!;
  const sel = st.gameSel ?? latest.num;
  const p = ds.pitches.find((x) => x.num === sel) ?? latest;
  const reviewing = st.gameSel !== null && sel !== latest.num;
  return (
    <div className="view">
      {reviewing && (
        <div className="row wrap" style={{ gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--accent-bg)', border: '1px solid var(--accent-edge)' }}>
          <span style={{ fontWeight: 700, color: '#A9D6FF', letterSpacing: '.04em' }}>REVIEWING</span>
          <span className="mono">Pitch {p.num} of {latest.num} · {p.time}</span>
          <span className="row" style={{ gap: 4 }}>
            <button type="button" className="icon-btn" aria-label="Previous pitch" disabled={p.num <= 1} onClick={() => st.set({ gameSel: p.num - 1 })}><Chevron dir="left" /></button>
            <button type="button" className="icon-btn" aria-label="Next pitch" onClick={() => st.set({ gameSel: p.num + 1 >= latest.num ? null : p.num + 1 })}><Chevron /></button>
          </span>
          <span className="small muted">Combined is always live. Mosaics, hit images and the pitch card follow the selected pitch.</span>
          <span className="grow" />
          <button type="button" className="btn go" onClick={() => st.set({ gameSel: null })}><span className="dot" style={{ background: '#06210F' }} />Return to live</button>
        </div>
      )}
      <HealthTiles />
      <div className="fit-row fill">
        <FieldPanel p={p} reviewing={reviewing} />
        <PitchCard p={p} reviewing={reviewing} latestNum={latest.num} />
      </div>
      <Timeline sel={sel} />
    </div>
  );
}
