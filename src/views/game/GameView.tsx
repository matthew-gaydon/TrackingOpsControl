import { useEffect, useRef } from 'react';
import { clockMs, usePick, useUi, type FlowStage } from '../../state/store';
import { useGoInSession } from '../../components/Shell';
import { useAlerts, useDs, usePpOps } from '../../state/hooks';
import { img } from '../../data/load';
import { fmtClock } from '../../data/time';
import { ACS, confidencePass, hasHitImages, IMG_ASPECT, pitchHasHit, szVerdict, GROUP, health, healthNote, hitTone, isBad, label, mark, rawTaskState, reviewable, strikeZone, taskState, TASKS, type Health } from '../../data/model';
import type { CameraFile, PitchFile } from '../../data/types';
import type { Tone } from '../../data/model';
import { Chevron, GoPopout, HealthDot, Seg } from '../../components/ui';
import { ZoomBox, wasDrag } from '../../components/ZoomBox';

type FV = 'combined' | 'pitchToPlate' | 'fullField' | 'biomechanics';

const STAGES: { k: Exclude<FlowStage, 'idle'>; label: string }[] = [
  { k: 'setup', label: 'Pre-Game Setup' }, { k: 'live', label: 'Live Tracking' }, { k: 'ended', label: 'Tracking Ended' },
];
const NEXT: Record<FlowStage, { to: FlowStage; label: string } | null> = {
  idle: { to: 'setup', label: 'Start Setup' }, setup: { to: 'live', label: 'Start Live Tracking' },
  live: { to: 'ended', label: 'End Live Tracking' }, ended: null,
};

/**
 * Game Flow: the stages of a game. Each button moves to the next stage. Starting Live Tracking
 * takes the system In session; ending it (after a confirm) takes it Out. Other system actions
 * hook in here later.
 */
function GameFlow() {
  const st = usePick('flow', 'flowConfirmEnd', 'set');
  const goIn = useGoInSession();
  const { stage, at } = st.flow;
  const next = NEXT[stage];
  const go = (to: FlowStage) => {
    if (to === 'live') goIn();
    if (to === 'ended') st.set({ session: 'out' });
    st.set((s) => ({ flow: { stage: to, at: { ...s.flow.at, [to]: clockMs(s) } }, flowConfirmEnd: false }));
  };
  const idx = STAGES.findIndex((x) => x.k === stage);
  const current = STAGES[idx];
  const tone = stage === 'live' ? { bg: '#12301F', ink: 'var(--ok-ink)', dot: 'var(--ok)' } : stage === 'ended' ? { bg: 'var(--panel-2)', ink: 'var(--text-2)', dot: 'var(--muted)' } : stage === 'setup' ? { bg: 'var(--accent-bg)', ink: '#A9D6FF', dot: 'var(--accent)' } : { bg: 'var(--panel-2)', ink: 'var(--text-3)', dot: '#2A313C' };
  return (
    <section aria-label="Game flow" className="col" style={{ gap: 6, padding: '10px 12px', borderRadius: 10, background: 'var(--panel)', border: `1px solid ${stage === 'live' ? '#23503A' : 'var(--border)'}` }}>
      <span className="small" style={{ color: 'var(--text-3)' }}>Game Flow</span>
      {/* current status, large */}
      <div className="row" aria-live="polite" style={{ gap: 10, padding: '8px 10px', borderRadius: 8, background: tone.bg }}>
        <span className="dot" style={{ width: 10, height: 10, background: tone.dot, animation: stage === 'live' ? 'blink 1.6s infinite' : undefined }} />
        <span className="grow" style={{ fontWeight: 700, fontSize: 15, color: tone.ink }}>{current?.label ?? 'Not started'}</span>
        {current && at[current.k] !== undefined && <span className="mono tiny muted" title="Started (UTC)">{fmtClock(at[current.k]!)}</span>}
      </div>
      {/* stages so far */}
      {idx > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {STAGES.slice(0, idx).map((x) => (
            <li key={x.k} className="row tiny" style={{ gap: 8, color: 'var(--text-3)' }}>
              <span aria-hidden="true" style={{ color: 'var(--ok-ink)' }}>✓</span><span className="grow">{x.label}</span>
              {at[x.k] !== undefined && <span className="mono muted">{fmtClock(at[x.k]!)}</span>}
            </li>
          ))}
        </ol>
      )}
      {/* the next step */}
      {next && (next.to !== 'ended' || !st.flowConfirmEnd) && (
        <button type="button" className={`btn ${next.to === 'ended' ? 'danger' : next.to === 'live' ? 'go' : 'primary'}`} style={{ justifyContent: 'center', minHeight: 36, fontSize: 13 }}
          onClick={() => (next.to === 'ended' ? st.set({ flowConfirmEnd: true }) : go(next.to))}>
          {next.label}
        </button>
      )}
      {next?.to === 'ended' && st.flowConfirmEnd && (
        <div className="col" style={{ gap: 8, padding: 10, borderRadius: 8, background: 'var(--crit-bg)', border: '1px solid var(--crit-edge)' }}>
          <span className="small" style={{ color: '#FFD7D3', lineHeight: 1.45 }}>End live tracking? This takes the system Out of session.</span>
          <div className="row">
            <button type="button" className="btn danger" onClick={() => go('ended')}>End Live Tracking</button>
            <button type="button" className="btn" onClick={() => st.set({ flowConfirmEnd: false })}>Cancel</button>
          </div>
        </div>
      )}
      {next?.to === 'live' && <span className="tiny muted">Starting live tracking takes the system In session.</span>}
    </section>
  );
}

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
  const r = ds.game.redundancy;
  const redFocus = al.focus && !al.focus.acked && al.focus.route.target === 'red';
  const link = (ok: boolean, name: string) => (
    <div className="col" style={{ flex: '1 1 0', gap: 2, padding: '6px 8px', borderRadius: 7, background: ok ? '#112219' : 'var(--warn-bg)', border: `1px solid ${ok ? '#23503A' : 'var(--warn-edge)'}` }}>
      <span className="row" style={{ gap: 6 }}><HealthDot h={ok ? 'ok' : 'warn'} size={9} /><span style={{ fontWeight: 700, fontSize: 14 }}>{name}</span></span>
      <span className="mono" style={{ fontWeight: 700, fontSize: 12, color: ok ? 'var(--ok-ink)' : 'var(--warn-ink)' }}>{ok ? 'Connected' : 'Down'}</span>
    </div>
  );
  return (
    <div className="col scroll" style={{ flex: '0 0 272px', gap: 6, minWidth: 0, scrollbarWidth: 'thin' }}>
      <GameFlow />
      <section aria-label="Redundancy" className="col" style={{ gap: 8, padding: '10px 12px', borderRadius: 10, background: 'var(--panel)',
        border: redFocus ? '2px solid var(--warn)' : `1px solid ${r.btcConnected && r.bdsConnected ? 'var(--border)' : 'var(--warn-edge)'}` }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="small grow" style={{ color: 'var(--text-3)' }}>Redundancy</span>
          <span className="mono tiny muted" title="Peers">peers +{r.peers}</span>
          <span className="mono" style={{ padding: '3px 12px', borderRadius: 5, fontWeight: 700, fontSize: 16, letterSpacing: '.04em', background: '#1D3A5C', color: '#A9D6FF' }}>{r.role}</span>
        </div>
        <div className="row" style={{ gap: 8, alignItems: 'stretch' }}>
          {link(r.btcConnected, 'BTC')}
          {link(r.bdsConnected, 'BDS')}
        </div>
      </section>
      {tiles.map((x) => (
        <button key={x.label} type="button" onClick={x.go} className="row" style={{ gap: 12, padding: '7px 12px', borderRadius: 10, textAlign: 'left', width: '100%', background: 'var(--panel)', border: `1px solid ${x.h === 'ok' ? 'var(--border)' : x.h === 'warn' ? 'var(--warn-edge)' : 'var(--crit-edge)'}` }}>
          <HealthDot h={x.h} size={12} />
          <span className="col grow" style={{ gap: 2, alignItems: 'flex-start' }}>
            <span className="small" style={{ color: 'var(--text-3)' }}>{x.label}</span>
            <span className="mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-hi)', lineHeight: 1.3 }}>{x.value}</span>
            <span className="tiny" style={{ color: x.h === 'ok' ? 'var(--muted)' : x.h === 'warn' ? 'var(--warn-ink)' : 'var(--crit-ink)' }}>{x.note}</span>
          </span>
          <Chevron />
        </button>
      ))}
    </div>
  );
}

function Combined({ hit }: { hit?: PitchFile['hit'] }) {
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
            <text x="440" y="112" textAnchor="end" fill="#DCC8FF" fontSize="12" fontFamily="IBM Plex Mono, monospace">{[hit.distanceFt != null && `${Math.round(hit.distanceFt)} ft`, hit.trackPct != null && `track ${hit.trackPct}%`].filter(Boolean).join(' · ')}</text>
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

const NoImage = ({ text }: { text: string }) => (
  <span className="tiny" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 6, color: '#7F8B9C' }}>{text}</span>
);
/** A camera's image for a pitch. Local sample images are fetched at the size shown (grid ~640 px, enlarged ~2400 px). */
function CamImage({ c, p, mode, big }: { c: CameraFile; p: PitchFile; mode: 'mosaic' | 'hit'; big?: boolean }) {
  const ds = useDs();
  const w = big ? 2400 : 640;
  const style = { width: '100%', height: '100%', objectFit: 'contain', display: 'block' } as const;
  if (mode === 'hit') {
    const own = p.images?.[c.id]?.hit;
    if (own) return <img src={img(ds, own, w)} alt={`${label(c)} hit image`} draggable={false} style={style} />;
    // real hit images: a pitch without them had no hit; a camera without one didn't capture it
    if (hasHitImages(ds)) return <NoImage text={pitchHasHit(p) ? 'No hit image from this camera' : 'No hit on this pitch'} />;
    if (!p.hit) return <NoImage text="No hit on this pitch" />;
    const src = img(ds, ds.game.defaultImages?.hit);
    if (src) return <img src={src} alt={`${label(c)} hit image`} draggable={false} style={style} />;
    return (
      <span className="col" style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>
        <svg width="60%" height="55%" viewBox="0 0 120 50" aria-hidden="true"><path d="M8 44 Q50 -6 112 18" fill="none" stroke="#C6A4FF" strokeWidth="2" strokeDasharray="5 4" /><circle cx="8" cy="44" r="3" fill="#C6A4FF" /></svg>
        {big && <span>Hit image placeholder (add pitches[].images.{c.id}.hit)</span>}
      </span>
    );
  }
  const src = img(ds, p.images?.[c.id]?.mosaic ?? c.images?.mosaic ?? ds.game.defaultImages?.mosaic, w);
  return src ? <img src={src} alt={big ? `${label(c)} ball mosaic` : ''} draggable={false} style={style} /> : <NoImage text="No ball mosaic" />;
}

export type Scope = 'game' | 'pitches';
/** The camera panel's state for a view: Game keeps its own, the Pitches tab its own. */
function useField(scope: Scope) {
  const st = usePick('bigCam', 'fieldView', 'imgMode', 'pitBig', 'pitView', 'pitImg', 'set');
  return scope === 'game'
    ? { fv: st.fieldView as FV, img: st.imgMode, big: st.bigCam, set: (ch: { fv?: FV; img?: 'mosaic' | 'hit'; big?: string | null }) => st.set({ ...(ch.fv && { fieldView: ch.fv }), ...(ch.img && { imgMode: ch.img }), ...(ch.big !== undefined && { bigCam: ch.big }) }) }
    : { fv: st.pitView as FV, img: st.pitImg, big: st.pitBig, set: (ch: { fv?: FV; img?: 'mosaic' | 'hit'; big?: string | null }) => st.set({ ...(ch.fv && ch.fv !== 'combined' && { pitView: ch.fv }), ...(ch.img && { pitImg: ch.img }), ...(ch.big !== undefined && { pitBig: ch.big }) }) };
}

/** Camera mosaics / hit images for a pitch. On Game it also has the live Combined view; on Pitches it doesn't. */
export function FieldPanel({ p, reviewing, scope = 'game', fill }: { p: PitchFile; reviewing: boolean; scope?: Scope; fill?: boolean }) {
  const ds = useDs(); const st = usePick('lastHitOverlay', 'set'); const f = useField(scope);
  const fv = f.fv;
  const cams = fv === 'combined' ? [] : ds.cameras.filter((c) => c.group === fv);
  const mode = fv === 'biomechanics' ? 'mosaic' : f.img;
  const big = f.big ? cams.find((c) => c.id === f.big) : undefined;
  const step = (d: number) => { const i = cams.findIndex((c) => c.id === f.big); f.set({ big: cams[(i + d + cams.length) % cams.length].id }); };
  const latest = ds.pitches.at(-1)!;
  const badge = (c: CameraFile) => { const h = health(c, ds); return h === 'ok' ? null : <span className="tag-over" style={{ right: 6, top: 6, color: h === 'crit' ? 'var(--crit-ink)' : 'var(--warn-ink)', fontFamily: 'var(--sans)', fontWeight: 700, fontSize: 10 }}>{healthNote(c, ds)}</span>; };
  return (
    <section className="panel" style={{ flex: fill ? '1 1 0' : '999 1 600px', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="row wrap" style={{ gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
        <Seg role="tablist" label="Field view" value={fv} onChange={(v) => f.set({ fv: v, big: null })}
          options={[...(scope === 'game' ? [['combined', 'Combined']] as [FV, string][] : []), ['pitchToPlate', 'PitchToPlate'], ['fullField', 'FullField'], ['biomechanics', 'Biomechanics']]} />
        <span className="small muted">{fv === 'combined' ? 'Live bird’s-eye view' : `${cams.length} cameras · ${mode === 'hit' ? 'hit images' : 'ball mosaics'}`}</span>
        <span className="grow" />
        {fv === 'combined' && <label className="row small" style={{ gap: 6, color: 'var(--text-3)' }}><input type="checkbox" checked={st.lastHitOverlay} onChange={() => st.set({ lastHitOverlay: !st.lastHitOverlay })} />Last hit overlay</label>}
        {(fv === 'pitchToPlate' || fv === 'fullField') && <Seg label="Image type" value={f.img} onChange={(v) => f.set({ img: v })} options={[['mosaic', 'Ball mosaic'], ['hit', 'Hit image']]} />}
      </div>
      {fv === 'combined' ? <Combined hit={[...ds.pitches].reverse().find((x) => x.hit)?.hit ?? latest.hit} /> : (
        <div className="col fill" style={{ gap: 10, padding: 12, background: '#0D1012', borderRadius: '0 0 10px 10px' }}>
          <div className="row wrap">
            <span className="mono" style={{ fontSize: 13 }}>Pitch {p.num} · {p.time}</span>
            {reviewing && <span className="pill info">REVIEW</span>}
            <span className="grow" />
            {big && <button type="button" className="btn" onClick={() => f.set({ big: null })}>All {cams.length} cameras</button>}
          </div>
          {mode === 'hit' && hasHitImages(ds) && !pitchHasHit(p) && (
            <div className="row small" role="status" style={{ gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--warn-bg)', border: '1px solid var(--warn-edge)', color: '#FFE0A0' }}>
              <HealthDot h="warn" size={9} /><span className="grow"><strong>No hit on pitch {p.num}.</strong> Hit images only exist for pitches with contact.</span>
              <button type="button" className="btn" onClick={() => f.set({ img: 'mosaic' })}>Show ball mosaics</button>
            </div>
          )}
          {big && (
            // jump straight to any camera in the group while one is enlarged; ← → keys step through them
            <div role="tablist" aria-label={`${GROUP[big.group].name} cameras`} className="seg hscroll" style={{ alignSelf: 'flex-start', maxWidth: '100%', flex: '0 0 auto' }}
              onKeyDown={(e) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1); } }}>
              {cams.map((c) => {
                const h = health(c, ds); const on = c.id === big.id;
                return (
                  <button key={c.id} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1} title={`${label(c)}${h === 'ok' ? '' : ` · ${healthNote(c, ds)}`}`}
                    ref={(el) => { if (on && el && el.parentElement?.contains(document.activeElement)) el.focus(); }}
                    onClick={() => f.set({ big: c.id })} className="mono" style={{ flex: '0 0 auto', minWidth: 44, padding: '5px 10px', fontWeight: 700 }}>
                    {h !== 'ok' && <HealthDot h={h} size={7} />}{mark(c)}
                  </button>
                );
              })}
            </div>
          )}
          {!big ? (
            <div className="fill scroll" style={{ display: 'grid', alignContent: 'start', gap: 8, gridTemplateColumns: `repeat(${fv === 'biomechanics' ? 4 : fv === 'fullField' ? 4 : 3}, minmax(0, 1fr))` }}>
              {cams.map((c) => (
                <button key={c.id} type="button" aria-label={`${label(c)}, enlarge`} onClick={() => { if (!wasDrag()) f.set({ big: c.id }); }}
                  style={{ position: 'relative', aspectRatio: String(IMG_ASPECT[c.group]), padding: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: 'var(--deep)' }}>
                  <ZoomBox as="span" zoomKey={`${scope}:${fv}:${c.id}:${mode}:${p.num}`} controls={false} style={{ position: 'absolute', inset: 0, display: 'block' }}>
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
                <ZoomBox zoomKey={`${scope}b:${fv}:${big.id}:${mode}:${p.num}`} style={{ width: `min(100cqw, calc(100cqh * ${IMG_ASPECT[big.group]}))`, aspectRatio: String(IMG_ASPECT[big.group]), borderRadius: 8, border: '1px solid var(--border)', background: 'var(--deep)' }}>
                  <CamImage c={big} p={p} mode={mode} big />
                </ZoomBox>
              </div>
              <button type="button" className="icon-btn" aria-label="Next camera" onClick={() => step(1)} style={{ width: 40, height: 40 }}><Chevron /></button>
            </div>
          )}
          {big && <span className="mono small">{label(big)} · {GROUP[big.group].tag}</span>}
          <span className="tiny muted">{big ? 'Pick any camera from the tabs, or step with the arrows (← → keys work too).' : 'Click a camera to enlarge it.'} Scroll on any image to zoom, drag to pan.</span>
        </div>
      )}
    </section>
  );
}

/** Everything about one pitch. `select` moves to another pitch (Game: review mode; Pitches: the list's selection). */
export function PitchCard({ p, reviewing, latestNum, scope = 'game', select }: { p: PitchFile; reviewing: boolean; latestNum: number; scope?: Scope; select?: (n: number) => void }) {
  const field = useField(scope);
  const ds = useDs(); const st = usePick('pop', 'set', 'szAll'); const ops = usePpOps();
  const pass = confidencePass(p, ds);
  const sz = strikeZone(p, ds);
  const bad = sz.filter((z) => z.state === 'warn' || z.state === 'crit');
  const idle = sz.filter((z) => z.state === 'none').length;   // FullField cameras that didn't contribute (normal)
  const contrib = sz.length - idle;
  const tol = ds.thresholds.strikeZoneTolerance;
  const fromGame = (ch: Parameters<typeof st.set>[0]) => st.set({ ...(ch as object), crumbPitch: p.num, crumbView: scope, focusAlertId: null, pop: null } as never);
  const goPitch = (n: number) => { if (select) select(n); else st.set({ gameSel: n >= latestNum ? null : n }); st.set({ pop: null }); };
  const pop = (k: string) => st.set({ pop: st.pop === k ? null : k });
  const hitT = p.hit && p.hit.trackPct != null ? hitTone(p.hit.trackPct, ds) : null;
  const quick: { k: string; label: string; value: string; tone: Tone | 'none'; text?: string; go?: () => void }[] = [
    { k: 'conf', label: 'Confidence', value: pass === null ? 'No data' : pass ? 'PASS' : 'FAIL', tone: pass === null ? 'none' : pass ? 'ok' : 'crit',
      text: `Pitch ${p.num} failed confidence. Show its PitchToPlate ball mosaics in the field panel?`, go: () => { st.set({ pop: null }); field.set({ fv: 'pitchToPlate', img: 'mosaic', big: null }); } },
    { k: 'acs', label: 'ACS delivery', value: p.acs ? ACS[p.acs].label : 'No data', tone: p.acs ? ACS[p.acs].tone : 'none' },
    { k: 'hit', label: 'Hit tracked', value: !p.hit ? 'No hit' : p.hit.trackPct != null ? `${p.hit.trackPct}%` : 'No data', tone: hitT ?? 'none',
      text: `Pitch ${p.num} has a poor hit track. Show its FullField hit images?`, go: () => { st.set({ pop: null }); field.set({ fv: 'fullField', img: 'hit', big: null }); } },
  ];
  const TONE = {
    ok: { bg: '#112219', edge: '#23503A', ink: 'var(--ok-ink)' }, warn: { bg: 'var(--warn-bg)', edge: 'var(--warn-edge)', ink: 'var(--warn-ink)' },
    crit: { bg: 'var(--crit-bg)', edge: 'var(--crit-edge)', ink: 'var(--crit-ink)' }, none: { bg: 'var(--panel-2)', edge: 'var(--border)', ink: 'var(--text-3)' },
  };
  const navBtn = { width: 32, height: 32 };
  return (
    <aside className="panel panel-pad col scroll" style={{ flex: '1 1 380px', maxWidth: 460, minWidth: 0, gap: 10 }}>
      <div className="row">
        <button type="button" className="icon-btn" style={navBtn} aria-label="Previous pitch" disabled={p.num <= 1} onClick={() => goPitch(p.num - 1)}><Chevron dir="left" /></button>
        <div className="col grow" style={{ gap: 0 }}><h2 style={{ fontSize: 16, fontWeight: 600 }}>Pitch {p.num}</h2><span className="mono small muted">{p.time}</span></div>
        {reviewing && <span className="pill info">REVIEW</span>}
        <button type="button" className="icon-btn" style={navBtn} aria-label="Next pitch" disabled={select ? p.num >= latestNum : !reviewing} onClick={() => goPitch(p.num + 1)}><Chevron /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {quick.map((q) => {
          const t = TONE[q.tone]; const bad = q.tone === 'warn' || q.tone === 'crit';
          const box = { display: 'flex', flexDirection: 'column' as const, gap: 3, padding: '8px 10px', borderRadius: 8, textAlign: 'left' as const, background: t.bg, border: `1px solid ${bad && st.pop === q.k ? t.ink : t.edge}` };
          const inner = (<><span className="tiny" style={{ color: 'var(--text-2)' }}>{q.label}</span>
            <span className="row mono" style={{ gap: 6, fontSize: 14, fontWeight: 700, color: t.ink }}>{q.tone !== 'none' && <HealthDot h={q.tone} size={8} />}{q.value}</span></>);
          return bad && q.go ? <button key={q.k} type="button" style={box} onClick={() => pop(q.k)} aria-label={`${q.label} ${q.value}, show details`}>{inner}</button> : <div key={q.k} style={box}>{inner}</div>;
        })}
      </div>
      {quick.filter((q) => (q.tone === 'warn' || q.tone === 'crit') && q.go && st.pop === q.k).map((q) => <GoPopout key={q.k} text={q.text!} onGo={q.go!} onCancel={() => st.set({ pop: null })} />)}

      {sz.length === 0 ? (
        <div className="row small" style={{ gap: 10, padding: '10px 12px', borderRadius: 8, background: 'var(--panel-2)', border: '1px dashed var(--border-2)', color: 'var(--text-3)' }}>
          <span className="lbl">Strike zone agreement</span><span className="grow" /><span>No data in this dataset</span>
        </div>
      ) : (
      <div className="col" style={{ gap: 10, padding: 12, borderRadius: 8, background: 'var(--panel-2)', border: `1px solid ${bad.length ? 'var(--warn-edge)' : 'var(--border)'}` }}>
        <div className="row wrap" style={{ justifyContent: 'space-between' }}>
          <span className="lbl">Strike zone agreement</span>
          <Seg label="Strike zone cameras shown" value={st.szAll ? 'all' : 'problems'} onChange={(v) => st.set({ szAll: v === 'all' })} options={[['problems', 'Problems only'], ['all', `All ${sz.length}`]]} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 600, color: bad.length ? 'var(--warn-ink)' : 'var(--ok-ink)' }}>{bad.length ? `${bad.length} of ${sz.length} cameras need a look` : `All ${contrib} contributing cameras agree`}</span>
        <span className="mono tiny muted">Tolerance ±{tol}{idle ? ` · ${idle} FullField not contributing (–)` : ''}</span>
        {!st.szAll ? (bad.length === 0
          ? <div className="row" style={{ gap: 10, padding: 14, borderRadius: 8, background: '#112219', border: '1px solid #23503A', color: '#BFE8D2' }}><HealthDot h="ok" size={10} />All {contrib} contributing cameras agree within tolerance</div>
          : bad.map((z) => (
            <div key={z.cam.id} className="col" style={{ gap: 6 }}>
              <button type="button" onClick={() => pop('sz' + z.cam.id)} aria-label={`${label(z.cam)} strike zone problem, show details`}
                className="row" style={{ width: '100%', gap: 10, padding: 10, borderRadius: 8, textAlign: 'left', background: z.state === 'crit' ? 'var(--crit-bg)' : 'var(--warn-bg)', border: `1px solid ${z.state === 'crit' ? 'var(--crit-edge)' : 'var(--warn-edge)'}` }}>
                <span className="mono" style={{ fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#0B0E13' }}>{mark(z.cam)}</span>
                <span className="col grow" style={{ gap: 0 }}><span style={{ fontWeight: 600 }}>{label(z.cam)}</span><span className="small" style={{ color: 'var(--text-2)' }}>{z.d === null ? 'No strike zone for this pitch' : z.state === 'crit' ? `Over ±${ds.thresholds.strikeZoneCritical}` : 'Out of tolerance'}</span></span>
                <span className="mono" style={{ color: z.state === 'crit' ? 'var(--crit-ink)' : 'var(--warn-ink)' }}>{z.d === null ? '—' : `Δ ${z.d.toFixed(3)}`}</span><Chevron />
              </button>
              {st.pop === 'sz' + z.cam.id && <GoPopout text={`Open ${label(z.cam)} in Cameras to check its feed and ball mosaic for pitch ${p.num}?`} onCancel={() => st.set({ pop: null })}
                onGo={() => fromGame({ view: 'cameras', cam: z.cam.id, camTab: 'mosaic', camFilter: 'all', camSub: 'monitor' })} />}
            </div>
          ))) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 5 }}>
            {sz.map((z) => (
              <div key={z.cam.id} className="col" title={z.state === 'none' ? `${label(z.cam)} didn't contribute to this pitch's strike zone` : undefined}
                style={{ gap: 2, alignItems: 'center', padding: '6px 2px', borderRadius: 6, color: z.state === 'none' ? 'var(--faint)' : undefined,
                  background: z.state === 'ok' ? '#112219' : z.state === 'warn' ? 'var(--warn-bg)' : z.state === 'none' ? 'var(--panel)' : 'var(--crit-bg)',
                  border: `1px ${z.d === null ? 'dashed' : 'solid'} ${z.state === 'ok' ? '#23503A' : z.state === 'warn' ? 'var(--warn-edge)' : z.state === 'none' ? 'var(--border-2)' : 'var(--crit-edge)'}` }}>
                <span className="mono small" style={{ fontWeight: 700 }}>{mark(z.cam)}</span><span className="mono tiny">{z.d === null ? (z.state === 'none' ? '–' : 'no data') : z.d.toFixed(3)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="col">
        <span className="lbl">Post-processing</span>
        {TASKS.map((n, k) => {
          const t = taskState(p, k, ops); const ok = t === 'ok' || t === 'reviewed'; const red = rawTaskState(p, k) === 'crit' && t === 'crit';
          const value = k === 0 ? `${p.pp.release.mph ?? '—'} mph` : k === 1 ? `${p.pp.spin.rpm ?? '—'} rpm${p.pp.spin.fitError !== undefined ? ` · err ${p.pp.spin.fitError}` : ''}` : t === 'ok' ? 'Valid' : t === 'crit' ? 'Failed' : t === 'reviewed' ? 'Validation failed · reviewed' : 'Validation failed';
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

/** One verdict per pitch: the worst of its deliverables. Red if any is red, amber if any is amber, else green. */
export function pitchVerdict(p: PitchFile, ds: ReturnType<typeof useDs>, ops: ReturnType<typeof usePpOps>): { h: 'ok' | 'warn' | 'crit'; problems: string[] } {
  const crit: string[] = [], warn: string[] = [];
  if (confidencePass(p, ds) === false) crit.push('confidence fail');
  const sz = szVerdict(p, ds); crit.push(...sz.crit); warn.push(...sz.warn);
  if (p.hit && p.hit.trackPct != null) { const h = hitTone(p.hit.trackPct, ds); if (h !== 'ok') (h === 'crit' ? crit : warn).push(`hit ${p.hit.trackPct}% tracked`); }
  if (p.acs === 'fail') crit.push('ACS failed'); else if (p.acs === 'review') warn.push('ACS needs review');
  TASKS.forEach((n, k) => { const t = taskState(p, k, ops); if (t === 'crit') crit.push(`${n} failed`); else if (t === 'warn') warn.push(`${n} ${reviewable(p, k, ops) ? 'needs review' : 'failed'}`); });
  return { h: crit.length ? 'crit' : warn.length ? 'warn' : 'ok', problems: [...crit, ...warn] };
}

function Timeline({ sel }: { sel: number }) {
  const ds = useDs(); const st = usePick('set'); const ops = usePpOps();
  const latest = ds.pitches.at(-1)!.num;
  const strip = useRef<HTMLDivElement>(null);
  const C = { ok: { bg: '#13261C', fg: 'var(--ok-ink)', edge: '#23503A' }, warn: { bg: 'var(--warn-bg)', fg: 'var(--warn-ink)', edge: 'var(--warn-edge)' }, crit: { bg: 'var(--crit-bg)', fg: 'var(--crit-ink)', edge: 'var(--crit-edge)' } };
  // keep the selected pitch in view (on load that's the latest, at the right-hand end)
  useEffect(() => {
    const box = strip.current;
    const el = box?.querySelector<HTMLElement>(`[data-pitch="${sel}"]`);
    if (!el || !box) return;
    const l = el.offsetLeft - box.offsetLeft, r = l + el.offsetWidth;
    if (l < box.scrollLeft) box.scrollLeft = l - 40;
    else if (r > box.scrollLeft + box.clientWidth) box.scrollLeft = r - box.clientWidth + 40;
  }, [sel, ds.pitches.length]);
  // a mouse wheel scrolls the strip sideways
  useEffect(() => {
    const box = strip.current; if (!box) return;
    const onWheel = (e: WheelEvent) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { e.preventDefault(); box.scrollLeft += e.deltaY; } };
    box.addEventListener('wheel', onWheel, { passive: false });
    return () => box.removeEventListener('wheel', onWheel);
  }, []);
  const page = (d: number) => strip.current?.scrollBy({ left: d * strip.current.clientWidth * 0.8 });
  const counts = { crit: 0, warn: 0 };
  const lights = ds.pitches.map((p) => { const v = pitchVerdict(p, ds, ops); if (v.h !== 'ok') counts[v.h]++; return { p, v }; });
  return (
    <section className="panel row" style={{ flex: '0 0 auto', padding: '8px 12px', gap: 10, minWidth: 0 }}>
      <span className="col" style={{ gap: 2, flex: '0 0 auto' }}>
        <h2 style={{ fontSize: 13, fontWeight: 600 }}>Pitch timeline</h2>
        <span className="tiny muted">{ds.pitches.length} pitches · <span style={{ color: counts.crit ? 'var(--crit-ink)' : undefined }}>{counts.crit} red</span> · <span style={{ color: counts.warn ? 'var(--warn-ink)' : undefined }}>{counts.warn} amber</span></span>
      </span>
      <button type="button" className="icon-btn" aria-label="Scroll timeline to earlier pitches" onClick={() => page(-1)}><Chevron dir="left" /></button>
      <div ref={strip} className="row hscroll" style={{ gap: 3, flex: '1 1 auto', minWidth: 0, padding: '3px 2px 6px' }}>
        {lights.map(({ p, v }) => {
          const c = C[v.h]; const on = p.num === sel;
          const what = `Pitch ${p.num}: ${v.problems.length ? v.problems.join(', ') : 'all deliverables good'}`;
          return (
            <button key={p.num} data-pitch={p.num} type="button" onClick={() => st.set({ gameSel: p.num === latest ? null : p.num, pop: null })}
              title={what} aria-label={what} aria-pressed={on}
              className="mono" style={{ flex: '0 0 auto', minWidth: 28, height: 28, padding: '0 4px', fontSize: 10, fontWeight: 700, background: c.bg, color: c.fg,
                // status is never colour-only: rounded = good, square = problem
                borderRadius: v.h === 'ok' ? 14 : 3, border: `1px solid ${c.edge}`, boxShadow: on ? '0 0 0 2px var(--accent)' : undefined }}>
              {p.num}
            </button>
          );
        })}
      </div>
      <button type="button" className="icon-btn" aria-label="Scroll timeline to later pitches" onClick={() => page(1)}><Chevron /></button>
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
      <div className="fit-row fill">
        <HealthTiles />
        <FieldPanel p={p} reviewing={reviewing} />
        <PitchCard p={p} reviewing={reviewing} latestNum={latest.num} />
      </div>
      <Timeline sel={sel} />
    </div>
  );
}
