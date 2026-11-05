import { useCallback, type ReactNode } from 'react';
import { usePick, useUi } from '../../state/store';
import { useAlerts, useDs } from '../../state/hooks';
import { img } from '../../data/load';
import { health, healthNote, isTracking, label } from '../../data/model';
import { DEFAULT_SETTINGS, type CameraFile, type CameraSettings } from '../../data/types';
import { Seg, SevBadge, Stepper, Switch } from '../../components/ui';
import { ZoomBox, wasDrag } from '../../components/ZoomBox';

type Sec = 'image' | 'ball' | 'calib';
const SEC: Record<Sec, (keyof CameraSettings)[]> = {
  image: ['autoExp', 'expTarget', 'exposure', 'maxExp', 'autoGain', 'aGain', 'autoDGain', 'dGain', 'lens', 'iris', 'focus'],
  ball: ['lmr', 'size', 'thresh', 'strMin', 'perMin', 'perMax', 'areaMin', 'areaMax', 'scale'],
  calib: ['nx', 'ny', 'rx', 'ry', 'awLines', 'awTpl', 'awScore'],
};
const TAB_NAME: Record<Sec, string> = { image: 'Image', ball: 'Ball tuning', calib: 'Calibration' };

/** Saved settings = defaults + dataset values + operator saves. Live = saved + unsaved overrides. */
export function useSettings() {
  const ds = useDs(); const saved = useUi((s) => s.ctlSaved); const live = useUi((s) => s.ctlLive);
  return useCallback((id: string) => {
    const cam = ds.cameras.find((c) => c.id === id);
    const sv: CameraSettings = { ...DEFAULT_SETTINGS, ...(cam?.settings ?? {}), ...(saved[id] ?? {}) };
    const lv: CameraSettings = { ...sv, ...(live[id] ?? {}) };
    const dirty = (sec: Sec) => SEC[sec].filter((k) => lv[k] !== sv[k]);
    return { sv, lv, dirty };
  }, [ds, saved, live]);
}
export function useAnyDirty() {
  const get = useSettings();
  return (id: string) => { const s = get(id); return (['image', 'ball', 'calib'] as Sec[]).some((k) => s.dirty(k).length > 0); };
}

const Box = ({ title, tag, tagTone, note, children, highlight }: { title: string; tag?: string; tagTone?: 'warn'; note?: string; children?: ReactNode; highlight?: boolean }) => (
  <div className="col" style={{ gap: 6, padding: '10px 12px', borderRadius: 8, background: 'var(--panel-2)', border: `1px solid ${highlight ? 'var(--warn)' : 'var(--border)'}`, boxShadow: highlight ? '0 0 0 3px rgba(245,184,65,.18)' : undefined }}>
    <div className="row"><h3 className="grow" style={{ fontSize: 13, fontWeight: 600 }}>{title}</h3>{tag && <span className={tagTone === 'warn' ? 'pill warn' : 'pill neutral'} style={{ fontSize: 10 }}>{tag}</span>}</div>
    {note && <span className="tiny muted" style={{ lineHeight: 1.45 }}>{note}</span>}
    {children}
  </div>
);
const Row = ({ label: l, changed, children }: { label: string; changed?: boolean; children: ReactNode }) => (
  <div className="row" style={{ minHeight: 36 }}>
    <span className="row grow small" style={{ gap: 6, color: 'var(--text-2)' }}>{l}{changed && <><span className="changed-dot" /><span className="sr">unsaved</span></>}</span>
    {children}
  </div>
);

export function ControlPanel() {
  const ds = useDs(); const st = usePick('ack', 'bmcaNote', 'cam', 'clickPts', 'ctrlTab', 'lensRestart', 'moveMsg', 'nudgeOn', 'nudgeStep', 'overlays', 'pickPt', 'resetOpen', 'set'); const al = useAlerts(); const getS = useSettings();
  const c = ds.cameras.find((x) => x.id === st.cam) ?? ds.cameras[0];
  const { sv, lv, dirty } = getS(c.id);
  const upd = (patch: Partial<CameraSettings>) => st.set((s) => ({ ctlLive: { ...s.ctlLive, [c.id]: { ...(s.ctlLive[c.id] ?? {}), ...patch } } }));
  const chg = (k: keyof CameraSettings) => lv[k] !== sv[k];
  const tab: Sec = st.ctrlTab;
  const h = health(c, ds);
  const nudgeOn = !!st.nudgeOn[c.id];
  const focus = al.focus && !al.focus.acked && al.focus.route.camSub === 'control' && al.focus.route.cam === c.id ? al.focus : null;

  const num = (k: keyof CameraSettings, l: string, step: number, dec: number, min: number, max: number, disabled = false) => (
    <Row key={k} label={l} changed={chg(k)}><Stepper label={l} value={lv[k] as number} onChange={(v) => upd({ [k]: v })} step={step} decimals={dec} min={min} max={max} disabled={disabled} changed={chg(k)} /></Row>
  );
  const tog = (k: keyof CameraSettings, l: string, disabled = false) => (
    <Row key={k} label={l} changed={chg(k)}><span className="tiny muted" style={{ minWidth: 22, textAlign: 'right' }}>{lv[k] ? 'On' : 'Off'}</span><Switch label={l} on={!!lv[k]} onChange={(v) => upd({ [k]: v })} disabled={disabled} /></Row>
  );
  const read = (l: string, v: string, note: string) => (
    <Row key={l} label={l}><span className="col" style={{ gap: 1, alignItems: 'flex-end' }}><span className="mono" style={{ fontSize: 13 }}>{v}</span><span style={{ fontSize: 10 }} className="muted">{note}</span></span></Row>
  );

  // ---- image response (mock) ----
  const autoExpUs = +(252.37 * lv.expTarget / 80).toFixed(2);
  const expUs = lv.autoExp ? autoExpUs : lv.exposure;
  const gainF = (lv.autoGain ? 1 : Math.pow(10, (lv.aGain - 30) / 40)) * (lv.autoDGain ? 1 : 1 + lv.dGain / 100);
  const bright = Math.max(0.15, Math.min(2.4, (expUs / 252.37) * gainF * Math.pow(3 / lv.iris, 2)));
  const blur = Math.min(4, Math.abs(lv.focus - (c.settings?.focus ?? DEFAULT_SETTINGS.focus)) / 40);

  // ---- overlays ----
  const cal = c.calibration;
  const [W, H] = cal?.imageSize ?? [1044, 425];
  const dx = lv.nx + lv.rx * 4, dy = lv.ny - lv.ry * 4, gx = sv.nx + sv.rx * 4, gy = sv.ny - sv.ry * 4;
  const showCal = st.overlays.cal && !!cal;
  const lb = c.lastBall;
  const ballPass = lv.lmr && !!lb && lb.strength >= lv.strMin && lb.perimeter >= lv.perMin && lb.perimeter <= lv.perMax && lb.area >= lv.areaMin && lb.area <= lv.areaMax;
  const clickOn = c.running && tab === 'calib' && nudgeOn && st.clickPts && showCal;
  const pickP = clickOn && st.pickPt ? cal!.keyPoints.find((k) => k.id === st.pickPt) : undefined;
  const live = img(ds, c.images?.live ?? ds.game.defaultImages?.live);

  const place = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (wasDrag() || !pickP) return;
    const r = e.currentTarget.getBoundingClientRect();
    const mx = Math.round((e.clientX - r.left) / r.width * W - (pickP.x + dx)), my = Math.round((e.clientY - r.top) / r.height * H - (pickP.y + dy));
    upd({ nx: lv.nx + mx, ny: lv.ny + my });
    const parts = [mx && `${Math.abs(mx)} ${mx > 0 ? 'right' : 'left'}`, my && `${Math.abs(my)} ${my < 0 ? 'up' : 'down'}`].filter(Boolean).join(' and ');
    st.set({ pickPt: null, moveMsg: { cam: c.id, text: `Moved the calibration so the ${pickP.label.toLowerCase()} sits where you clicked${parts ? ` (${parts})` : ''}. Save to keep it.` } });
  };

  const save = () => st.set((s) => {
    const ch: Partial<typeof s> = { ctlSaved: { ...s.ctlSaved, [c.id]: { ...(s.ctlSaved[c.id] ?? {}), ...Object.fromEntries(SEC[tab].map((k) => [k, lv[k]])) } }, resetOpen: false };
    if (tab === 'calib') ch.nudgeOn = { ...s.nudgeOn, [c.id]: false };
    return ch;
  });
  const revert = () => st.set((s) => {
    const m = { ...(s.ctlLive[c.id] ?? {}) }; SEC[tab].forEach((k) => delete m[k]);
    const ch: Partial<typeof s> = { ctlLive: { ...s.ctlLive, [c.id]: m }, resetOpen: false };
    if (tab === 'calib') ch.nudgeOn = { ...s.nudgeOn, [c.id]: false };
    return ch;
  });
  const dN = dirty(tab).length;
  const stp = { fine: 1, normal: 3, coarse: 8 }[st.nudgeStep];
  const sg = (n: number) => (n > 0 ? '+' : '') + n;
  const nudgeDirty = lv.nx !== sv.nx || lv.ny !== sv.ny;
  const moved = !!(sv.nx || sv.ny || sv.rx || sv.ry || lv.nx || lv.ny || lv.rx || lv.ry);
  const aw = c.antiwobble;
  const ballTable: [string, number, number, keyof CameraSettings, keyof CameraSettings | null, number][] = lb ? [
    ['Strength', lb.strength, 0, 'strMin', null, 1], ['Perimeter', lb.perimeter, 2, 'perMin', 'perMax', 5], ['Area', lb.area, 2, 'areaMin', 'areaMax', 5]] : [];
  const tableCols = { display: 'grid', gridTemplateColumns: 'minmax(72px, 1fr) 148px minmax(76px, 1fr) 148px', columnGap: 14, alignItems: 'center', justifyItems: 'center', minHeight: 36 } as const;
  const camAlerts = al.open.filter((a) => a.cameraId === c.id && a.sev !== 'dev');

  return (
    <div className="col" style={{ gap: 12 }}>
      <section className="panel">
        <div className="panel-head">
          <h2 style={{ fontSize: 16, fontWeight: 600 }}>{label(c)}</h2><span className="mono small muted">Live image</span>
          <span className={`pill ${h}`}>{h === 'ok' ? 'Healthy' : healthNote(c, ds)}</span>
          <span className="grow" />
          <button type="button" className="btn" onClick={() => st.set({ bmcaNote: !st.bmcaNote })}>Open in BMCA ↗</button>
        </div>
        {st.bmcaNote && <div className="small" style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', background: '#0F1A26', color: '#B5DDFF' }}>In the real app this opens {c.host ?? 'BMCA'} for {label(c)}, for everything not brought into Tracking Ops Control.</div>}
        <div className="row wrap" style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
          <span className="lbl">Overlays</span>
          {([['cal', 'Calibration', 'var(--cal)', !cal], ['ball', 'Ball detections', 'var(--ok)', !isTracking(c) || !lb]] as const).map(([k, l, col, off]) => (
            <button key={k} type="button" className="btn" aria-pressed={st.overlays[k] && !off} disabled={off} onClick={() => st.set({ overlays: { ...st.overlays, [k]: !st.overlays[k] } })}
              style={{ minHeight: 30, background: st.overlays[k] && !off ? '#1B2433' : 'transparent' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, border: `1.5px solid ${col}`, background: st.overlays[k] && !off ? col : 'transparent' }} />{l}
            </button>
          ))}
          <span className="grow" />
          {showCal && (dx !== gx || dy !== gy) && <span className="row tiny" style={{ color: 'var(--text-2)' }}><svg width="26" height="6" aria-hidden="true"><line x1="0" y1="3" x2="26" y2="3" stroke="#FF8BEA" strokeWidth="2" strokeDasharray="5 4" /></svg>Saved position</span>}
        </div>
        <div style={{ padding: 12, background: 'var(--deep)', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
          {c.running && live ? (
            <ZoomBox zoomKey={`c:${c.id}`} style={{ width: '100%', borderRadius: 6, border: '1px solid var(--line)' }}>
              {(scale) => (
                <>
                  <img src={live} alt={`Live image from ${label(c)}`} draggable={false} style={{ display: 'block', width: '100%', filter: `brightness(${bright.toFixed(2)}) blur(${blur.toFixed(1)}px)` }} />
                  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} role="img" aria-label="Calibration and ball detection overlays">
                    {showCal && (dx !== gx || dy !== gy) && <g transform={`translate(${gx} ${gy})`} stroke="#FF8BEA" strokeOpacity={0.7} strokeWidth={2} strokeDasharray="9 7" fill="none">{cal!.lines.map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />)}</g>}
                    {showCal && <g transform={`translate(${dx} ${dy})`} stroke="var(--cal)" strokeWidth={2.5} fill="none">{cal!.lines.map((l, i) => <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} />)}</g>}
                    {st.overlays.ball && isTracking(c) && lb?.boxes?.map((b, i) => {
                      const s = Math.round(b.size * lv.scale); const col = ballPass ? '#3DD68C' : '#FF5F57'; const t = ballPass ? 'ball' : 'rejected';
                      return <g key={i}><rect x={b.x - s / 2} y={b.y - s / 2} width={s} height={s} fill="none" stroke={col} strokeWidth={2} strokeDasharray="4 3" />
                        <rect x={b.x - s / 2} y={b.y - s / 2 - 18} width={t.length * 7.4 + 8} height={16} fill="#07090C" fillOpacity={0.8} />
                        <text x={b.x - s / 2 + 4} y={b.y - s / 2 - 6} fill={col} fontSize={12} fontFamily="IBM Plex Mono, monospace">{t}</text></g>;
                    })}
                    {pickP && <circle cx={pickP.x + dx} cy={pickP.y + dy} r={9} fill="none" stroke="#fff" strokeWidth={2} />}
                  </svg>
                  {pickP && <button type="button" aria-label={`Click where the ${pickP.label.toLowerCase()} should be`} onClick={place} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', padding: 0, border: 0, background: 'rgba(90,184,255,.06)', cursor: 'crosshair' }} />}
                  {clickOn && cal!.keyPoints.map((k) => {
                    const on = st.pickPt === k.id;
                    return <button key={k.id} type="button" data-nopan="1" aria-pressed={on} aria-label={`${on ? 'Selected' : 'Select key point'}: ${k.label}`} onClick={() => st.set({ pickPt: on ? null : k.id, moveMsg: null })}
                      style={{ position: 'absolute', left: `${((k.x + dx) / W) * 100}%`, top: `${((k.y + dy) / H) * 100}%`, width: 18, height: 18, padding: 0, borderRadius: '50%', transform: `translate(-50%, -50%) scale(${1 / scale})`, border: '2px solid #fff', background: on ? 'var(--accent)' : 'rgba(255,61,220,.9)', boxShadow: `0 0 0 3px rgba(0,0,0,.45)${on ? ', 0 0 0 7px rgba(90,184,255,.35)' : ''}` }} />;
                  })}
                </>
              )}
            </ZoomBox>
          ) : <span className="muted" style={{ padding: '60px 0' }}>{c.running ? 'No live image in this dataset' : 'No live image: this camera isn’t running'}</span>}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 1, background: 'var(--border)', borderTop: '1px solid var(--border)', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
          {([['Frame rate', c.running ? `${c.fps}/${c.targetFps ?? ds.thresholds.targetFps}` : '—', !c.running ? 'crit' : ''],
            ['Exposure', c.running ? `${expUs.toFixed(0)} µs` : '—', chg('exposure') || chg('expTarget') ? 'chg' : ''],
            ['Analog gain', lv.autoGain ? 'auto' : lv.aGain.toFixed(1), chg('aGain') || chg('autoGain') ? 'chg' : ''],
            ['Digital gain', lv.autoDGain ? 'auto' : lv.dGain.toFixed(1), chg('dGain') || chg('autoDGain') ? 'chg' : ''],
            ['Iris', lv.lens ? `f/${lv.iris.toFixed(1)}` : 'no lens', chg('iris') ? 'chg' : ''],
            ['Focus', lv.lens ? String(lv.focus) : 'no lens', chg('focus') ? 'chg' : '']] as const).map(([k, v, s]) => (
            <div key={k} className="col" style={{ background: 'var(--panel)', padding: '9px 12px', gap: 2 }}><span className="lbl">{k}</span><span className="mono" style={{ fontSize: 14, fontWeight: 600, color: s === 'crit' ? 'var(--crit-ink)' : s === 'chg' ? 'var(--unsaved)' : 'var(--text-hi)' }}>{v}</span></div>
          ))}
        </div>
        <span className="tiny muted" style={{ display: 'block', padding: '8px 14px' }}>Scroll to zoom and drag to pan. In this prototype the image roughly responds to exposure, gain, iris and focus, and the overlays move as you nudge.</span>
      </section>

      <section className="panel panel-pad col" style={{ gap: 10, border: focus ? '2px solid var(--warn)' : undefined }}>
        <Seg role="tablist" label="Camera controls" value={tab} onChange={(v) => st.set({ ctrlTab: v, resetOpen: false, pickPt: null })}
          options={(['image', 'ball', 'calib'] as Sec[]).map((k) => [k, <>{TAB_NAME[k]}{dirty(k).length > 0 && <><span className="changed-dot" style={{ width: 7, height: 7 }} /><span className="sr">has unsaved changes</span></>}</>])} />
        {!c.running ? (
          <div className="col" style={{ gap: 10, padding: 14, borderRadius: 8, background: 'var(--crit-bg)', border: '1px solid var(--crit-edge)' }}>
            <span style={{ fontWeight: 600 }}>{label(c)} isn’t running</span>
            <span className="small" style={{ color: '#FFB0AA' }}>Controls are unavailable until the camera is sending frames again.</span>
            <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => st.set({ camSub: 'monitor' })}>Check it in Monitoring</button>
          </div>
        ) : (
          <>
            <div className="row small" style={{ alignItems: 'flex-start', padding: '8px 10px', borderRadius: 7, background: 'var(--warn-bg)', border: '1px solid #4E3E17', color: '#FFE2A3', lineHeight: 1.45 }}>
              <span>⚠</span><span>Game is {ds.game.gameMode}. Changes reach the camera straight away. <strong>Save</strong> keeps them; <strong>Revert</strong> undoes them.</span>
            </div>
            {camAlerts.map((a) => (
              <div key={a.id} className="row card" style={{ padding: '8px 10px' }}><SevBadge sev={a.sev} /><span className="grow small" style={{ fontWeight: 600 }}>{a.title}</span><button type="button" className="btn" onClick={() => st.ack(a.id)}>Acknowledge</button></div>
            ))}
            <div style={{ display: 'grid', gap: 10, alignItems: 'stretch', gridTemplateColumns: tab === 'ball' && isTracking(c) ? 'minmax(260px, 1fr) minmax(520px, 2fr)' : 'repeat(auto-fit, minmax(260px, 1fr))' }}>
              {tab === 'image' && <>
                <Box title="Exposure">
                  {tog('autoExp', 'Auto exposure')}
                  {lv.autoExp ? <>{num('expTarget', 'Auto exposure target', 1, 2, 10, 250)}{read('Current exposure', `${autoExpUs.toFixed(2)} µs`, 'set by auto exposure')}</> : num('exposure', 'Exposure', 10, 2, 10, lv.maxExp)}
                  {num('maxExp', 'Max exposure', 50, 2, 100, 5000)}
                </Box>
                <Box title="Gain">
                  {tog('autoGain', 'Auto analog gain')}
                  {lv.autoGain ? read('Analog gain', sv.aGain.toFixed(2), 'set by auto analog gain') : num('aGain', 'Analog gain', 1, 2, 0, 48)}
                  {tog('autoDGain', 'Auto digital gain')}
                  {lv.autoDGain ? read('Digital gain', sv.dGain.toFixed(2), 'set by auto digital gain') : num('dGain', 'Digital gain', 1, 2, 0, 100)}
                </Box>
                <Box title="Lens" note={lv.lens ? undefined : 'Connect to the lens to change iris and focus.'}>
                  {tog('lens', 'Connect to lens')}
                  {num('iris', 'Iris (f-number)', 0.5, 1, 1.4, 16, !lv.lens)}
                  {num('focus', 'Focus', 20, 0, 0, 30000, !lv.lens)}
                  <div className="row"><button type="button" className="btn" onClick={() => st.set({ lensRestart: c.id })}>Restart lens controller</button></div>
                  {st.lensRestart === c.id && <span className="tiny" style={{ color: 'var(--ok-ink)' }}>Restart sent to the lens controller (Birger).</span>}
                </Box>
              </>}
              {tab === 'ball' && (!isTracking(c) ? <Box title="No ball tuning on this camera" note="Biomechanics cameras do no live ball tracking, so there is nothing to tune here." /> : <>
                <Box title="Ball detector">
                  {tog('lmr', 'Use LMR')}
                  {num('size', 'Size', 1, 0, 1, 64, !lv.lmr)}
                  {num('thresh', 'Threshold', 1, 0, 1, 255, !lv.lmr)}
                  {num('scale', 'Ball scaling', 0.05, 2, 0.5, 2)}
                </Box>
                <Box title="Ball tuning" note="A candidate counts as a ball only inside these limits. Last ball is the latest candidate on this camera, so you can see the effect of a change before the next pitch.">
                  {lb ? <>
                    <div style={tableCols}><span /><span className="lbl" style={{ fontSize: 10 }}>Min</span><span className="lbl" style={{ fontSize: 10 }}>Last ball</span><span className="lbl" style={{ fontSize: 10 }}>Max</span></div>
                    {ballTable.map(([l, last, dec, mn, mx, step]) => {
                      const ok = last >= (lv[mn] as number) && (!mx || last <= (lv[mx] as number));
                      return (
                        <div key={l} style={tableCols}>
                          <span className="small" style={{ justifySelf: 'start', color: 'var(--text-2)' }}>{l}</span>
                          <Stepper label={`minimum ${l}`} value={lv[mn] as number} onChange={(v) => upd({ [mn]: v })} step={step} decimals={dec} min={0} disabled={!lv.lmr} changed={chg(mn)} />
                          <span className="mono small" style={{ fontWeight: 600, color: ok ? '#9FD9BA' : 'var(--crit-ink)' }}>{last.toFixed(dec)}{ok ? '' : ' ✕'}</span>
                          {mx ? <Stepper label={`maximum ${l}`} value={lv[mx] as number} onChange={(v) => upd({ [mx]: v })} step={step * 5} decimals={dec} min={0} disabled={!lv.lmr} changed={chg(mx)} /> : <span className="tiny" style={{ color: 'var(--faint)' }}>no max</span>}
                        </div>
                      );
                    })}
                    <span className="small" style={{ fontWeight: 600, color: ballPass ? 'var(--ok-ink)' : 'var(--crit-ink)' }}>{!lv.lmr ? 'LMR is off: no ball detection on this camera.' : ballPass ? 'The last ball passes these limits.' : 'The last ball would be rejected with these limits.'}</span>
                  </> : <span className="small muted">No last-ball values in this dataset (cameras[].lastBall).</span>}
                </Box>
              </>)}
              {tab === 'calib' && <>
                <Box title="Nudging" note={nudgeOn ? 'Line the calibration up with the field markings. The dashed lines show the saved position.' : 'Turn nudging on to move the calibration. It stays off by default so a stray click can’t move it.'}>
                  <div className="row wrap">
                    <Seg label="Nudging" value={nudgeOn ? 'on' : 'off'} onChange={(v) => st.set({ nudgeOn: { ...st.nudgeOn, [c.id]: v === 'on' } })} options={[['off', 'Off'], ['on', 'On']]} />
                    <span className="small" style={{ fontWeight: 600, color: nudgeDirty ? 'var(--unsaved)' : 'var(--muted)' }}>{nudgeDirty ? `Unsaved nudge · ${sg(lv.nx)} across, ${sg(-lv.ny)} up` : sv.nx || sv.ny ? `Saved nudge · ${sg(sv.nx)} across, ${sg(-sv.ny)} up` : 'No nudges set'}</span>
                  </div>
                  <div className="row" style={{ padding: '6px 8px', borderRadius: 7, background: '#11151C', border: '1px solid var(--border)' }}>
                    <span className="col grow" style={{ gap: 2 }}><span className="small" style={{ fontWeight: 600, color: 'var(--text-2)' }}>Click to move points</span>
                      <span className="tiny muted" style={{ lineHeight: 1.4 }}>{!nudgeOn ? 'Turn nudging on first.' : !st.clickPts ? 'Pick a key point on the calibration, then click where it belongs. The arrows still work.' : !st.overlays.cal ? 'Turn on the Calibration overlay to see the key points.' : pickP ? `Now click where the ${pickP.label.toLowerCase()} should be in the image. Zoom in for precision.` : 'Click one of the key points (dots) on the image.'}</span></span>
                    <span className="tiny muted">{st.clickPts ? 'On' : 'Off'}</span>
                    <Switch label="Click to move points" on={st.clickPts} disabled={!nudgeOn} onChange={(v) => st.set({ clickPts: v, pickPt: null, moveMsg: null })} />
                  </div>
                  {st.moveMsg?.cam === c.id && <span className="tiny" style={{ color: 'var(--unsaved)' }}>{st.moveMsg.text}</span>}
                  <div className="row wrap" style={{ gap: 14 }}>
                    <div style={{ flex: '0 0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 36px)', gridTemplateRows: 'repeat(2, 36px)', gap: 3 }}>
                      {(['', 'up', '', 'left', 'down', 'right'] as const).map((d, i) => d ? (
                        <button key={d} type="button" className="icon-btn" style={{ width: 36, height: 36 }} aria-label={`Nudge ${d}`} disabled={!nudgeOn}
                          onClick={() => upd(d === 'up' ? { ny: lv.ny - stp } : d === 'down' ? { ny: lv.ny + stp } : d === 'left' ? { nx: lv.nx - stp } : { nx: lv.nx + stp })}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d={d === 'up' ? 'M6 15l6-6 6 6' : d === 'down' ? 'M6 9l6 6 6-6' : d === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>
                        </button>) : <span key={i} />)}
                    </div>
                    <div className="col" style={{ gap: 6 }}>
                      <span className="lbl" style={{ fontSize: 10 }}>Step size</span>
                      <Seg label="Nudge step size" disabled={!nudgeOn} value={st.nudgeStep} onChange={(v) => st.set({ nudgeStep: v })} options={[['fine', 'Fine'], ['normal', 'Normal'], ['coarse', 'Coarse']]} />
                      <span className="muted" style={{ fontSize: 10 }}>Replaces Shift (slow) / Ctrl (fast) in BMCA</span>
                    </div>
                  </div>
                </Box>
                <Box title="Refinement" tag="BMCA: 2D nudge" note="A small 2D shift of the calibration on the image, on top of any nudge.">
                  {num('rx', 'Horizontal', 0.25, 2, -20, 20)}{num('ry', 'Vertical', 0.25, 2, -20, 20)}
                  <div className="row"><button type="button" className="btn" disabled={lv.rx === 0 && lv.ry === 0} onClick={() => upd({ rx: 0, ry: 0 })}>Clear refinement</button></div>
                </Box>
                <Box title="Antiwobble" highlight={!!focus} tag={aw && aw.patchesMatched < aw.patchesTotal / 2 ? 'Falling back' : undefined} tagTone="warn">
                  {tog('awLines', 'Lines')}
                  {read('Lines matched', lv.awLines ? (aw ? `${aw.linesMatched}/${aw.linesTotal}` : '—') : 'off', '')}
                  {tog('awTpl', 'Templates')}
                  {read('Template patches matched', lv.awTpl ? (aw ? `${aw.patchesMatched}/${aw.patchesTotal}` : '—') : 'off', '')}
                  {num('awScore', 'Templates score threshold', 0.05, 2, 0, 1)}
                </Box>
                <Box title="Reference calibration" note={moved ? 'Nudges or refinement are applied on top of the reference calibration.' : 'Using the reference calibration, with no nudges or refinement.'}>
                  <div className="row"><button type="button" className="btn danger" disabled={!moved} onClick={() => st.set({ resetOpen: !st.resetOpen })}>Reset to reference calibration</button></div>
                  {st.resetOpen && moved && (
                    <div className="col" style={{ gap: 8, padding: 10, borderRadius: 7, background: 'var(--crit-bg)', border: '1px solid var(--crit-edge)', color: '#FFD7D3' }}>
                      <span className="small" style={{ lineHeight: 1.5 }}>Remove every nudge and refinement on {label(c)} and restore its reference calibration? This is saved straight away.</span>
                      <div className="row">
                        <button type="button" className="btn danger" onClick={() => st.set((s) => {
                          const m = { ...(s.ctlLive[c.id] ?? {}) }; (['nx', 'ny', 'rx', 'ry'] as const).forEach((k) => delete m[k]);
                          return { ctlSaved: { ...s.ctlSaved, [c.id]: { ...(s.ctlSaved[c.id] ?? {}), nx: 0, ny: 0, rx: 0, ry: 0 } }, ctlLive: { ...s.ctlLive, [c.id]: m }, nudgeOn: { ...s.nudgeOn, [c.id]: false }, resetOpen: false };
                        })}>Reset calibration</button>
                        <button type="button" className="btn" onClick={() => st.set({ resetOpen: false })}>Cancel</button>
                      </div>
                    </div>
                  )}
                </Box>
              </>}
            </div>
            {(tab !== 'ball' || isTracking(c)) && (
              <div className="row wrap" style={{ paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                <span className="grow small" style={{ fontWeight: 600, color: dN ? 'var(--unsaved)' : 'var(--muted)' }}>{dN ? `${dN} unsaved change${dN > 1 ? 's' : ''} in ${TAB_NAME[tab]}` : `${TAB_NAME[tab]} settings saved`}</span>
                <button type="button" className="btn" disabled={!dN} onClick={revert}>Revert</button>
                <button type="button" className="btn primary" disabled={!dN} onClick={save}>Save</button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export type { CameraFile };
