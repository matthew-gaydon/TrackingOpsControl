import { useUi } from '../../state/store';
import { useCloudOps, useDs, usePpOps } from '../../state/hooks';
import { CLOUD_TASKS, cloudState, tkey, trackpacCloud } from '../../data/model';
import type { CloudResult, PitchFile, TrackpacCloud } from '../../data/types';
import { ContextMenu, HealthDot, menuPos, type MenuItem } from '../../components/ui';

const TPS: Record<TrackpacCloud, [string, string, string]> = {
  queued: ['Queued', 'background:#1E242E;color:#C9D2DE', '#5E6B7D'], processing: ['Processing', 'background:#10243A;color:#A9D6FF', '#5AB8FF'],
  successful: ['Successful', 'background:#13261C;color:#9FD9BA', '#2FB57A'], needs_validation: ['Needs validation', 'background:#3A2A0E;color:#FFE0A0', '#F5B841'],
  failed: ['Failed', 'background:#3A1513;color:#FFB0AA', '#FF5F57'], uploaded: ['Uploaded', 'background:#1F7A4D;color:#FFFFFF', '#3DD68C'],
};
const CLS: Record<CloudResult, [string, string, string]> = {
  queued: ['Queued', 'background:#1E242E;color:#C9D2DE', '#5E6B7D'], processing: ['Processing', 'background:#10243A;color:#A9D6FF', '#5AB8FF'],
  success: ['Success', 'background:#1F7A4D;color:#FFFFFF', '#3DD68C'], failed: ['Failed', 'background:#3A1513;color:#FFB0AA', '#FF5F57'],
};
const css = (s: string) => Object.fromEntries(s.split(';').map((d) => d.split(':')).map(([k, v]) => [k.replace(/-(\w)/g, (_, c) => c.toUpperCase()), v]));
const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w === 'pitch' ? 'es' : 's'}`;
const GRID = '24px 1.3fr 1fr 1fr 1fr 1fr';

export function CloudView() {
  const ds = useDs(); const st = useUi(); const pp = usePpOps(); const ops = useCloudOps();
  const tp = (p: PitchFile) => trackpacCloud(p, pp);
  const cs = (p: PitchFile, k: number) => cloudState(p, k, pp, ops);
  const rowFailed = (p: PitchFile) => CLOUD_TASKS.some((_, k) => cs(p, k) === 'failed');
  const rowDone = (p: PitchFile) => CLOUD_TASKS.every((_, k) => cs(p, k) === 'success');
  const attention = (p: PitchFile) => rowFailed(p) || tp(p) === 'needs_validation' || tp(p) === 'failed';
  const visible = [...ds.pitches].reverse().filter((p) => st.cloudFilter === 'all' || (st.cloudFilter === 'failed' && attention(p)) || (st.cloudFilter === 'open' && !rowDone(p)));
  const sel = ds.pitches.filter((p) => st.cloudPicks[p.num]).sort((a, b) => b.num - a.num);
  const isSel = (n: number) => !!st.cloudPicks[n];

  const tpCount: Record<string, number> = {}; const clCount: Record<string, number> = {}; const per = CLOUD_TASKS.map(() => ({} as Record<string, number>));
  ds.pitches.forEach((p) => { tpCount[tp(p)] = (tpCount[tp(p)] ?? 0) + 1; CLOUD_TASKS.forEach((_, k) => { const c = cs(p, k); clCount[c] = (clCount[c] ?? 0) + 1; per[k][c] = (per[k][c] ?? 0) + 1; }); });
  const N = ds.pitches.length;
  const big = (c: string) => ({ fontSize: 24, fontWeight: 600, color: c });
  const summary: [string, string | number, string][] = [
    ['Trackpac uploaded', `${tpCount.uploaded ?? 0} / ${N}`, 'var(--ok-ink)'], ['Trackpac needs validation', tpCount.needs_validation ?? 0, tpCount.needs_validation ? 'var(--warn-ink)' : 'var(--text)'],
    ['Cloud success', clCount.success ?? 0, 'var(--ok-ink)'], ['Cloud processing', clCount.processing ?? 0, '#A9D6FF'], ['Cloud queued', clCount.queued ?? 0, 'var(--text)'], ['Cloud failed', clCount.failed ?? 0, clCount.failed ? '#FF8E87' : 'var(--text)'],
  ];
  const TP_ORDER: TrackpacCloud[] = ['uploaded', 'successful', 'needs_validation', 'failed', 'processing', 'queued'];
  const CL_ORDER: CloudResult[] = ['success', 'processing', 'queued', 'failed'];
  const bar = (order: string[], defs: Record<string, [string, string, string]>, counts: Record<string, number>) => (
    <div className="grow" style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', background: '#1E242E' }}>{order.map((c) => <span key={c} style={{ width: `${(counts[c] ?? 0) / N * 100}%`, background: defs[c][2] }} />)}</div>
  );

  const click = (p: PitchFile, e: React.MouseEvent) => {
    const cur = { ...st.cloudPicks };
    if (e.ctrlKey || e.metaKey) { cur[p.num] ? delete cur[p.num] : (cur[p.num] = true); st.set({ cloudPicks: cur, cloudAnchor: p.num, clMenu: null }); return; }
    if (e.shiftKey && st.cloudAnchor !== null) {
      const a = visible.findIndex((q) => q.num === st.cloudAnchor), b = visible.findIndex((q) => q.num === p.num);
      const range = a < 0 ? [p] : visible.slice(Math.min(a, b), Math.max(a, b) + 1);
      st.set({ cloudPicks: Object.fromEntries(range.map((q) => [q.num, true])), clMenu: null }); return;
    }
    const only = Object.keys(cur).length === 1 && cur[p.num];
    st.set({ cloudPicks: only ? {} : { [p.num]: true }, cloudAnchor: p.num, clMenu: null });
  };
  const openMenu = (p: PitchFile | null, e: React.MouseEvent, viaButton = false) => {
    const pos = menuPos(e, viaButton);
    st.set(p && !isSel(p.num) ? { clMenu: pos, cloudPicks: { [p.num]: true }, cloudAnchor: p.num } : { clMenu: pos });
  };
  const repush = (keys: string[]) => st.set((s) => {
    const r = { ...s.cloudRetried }, d = { ...s.cloudDone }; const now = Date.now();
    keys.forEach((k) => { r[k] = now; delete d[k]; });
    return { cloudRetried: r, cloudDone: d };
  });
  const pushable = sel.filter((p) => tp(p) === 'uploaded');
  const failed = pushable.flatMap((p) => CLOUD_TASKS.map((_, k) => k).filter((k) => cs(p, k) === 'failed').map((k) => tkey(p.num, k)));
  const m = st.clMenu;
  const order = m && m.task !== null ? [m.task, ...[0, 1, 2].filter((k) => k !== m.task)] : [0, 1, 2];
  const items: MenuItem[] = [
    ...order.map((k, i) => ({ label: `Repush ${k === 0 ? 'bat data' : CLOUD_TASKS[k][1].toLowerCase()}`, note: pl(pushable.length, 'pitch'), disabled: !pushable.length, first: !!m && m.task === k && i === 0, onSelect: () => repush(pushable.map((p) => tkey(p.num, k))) })),
    { label: 'Repush all', note: pl(pushable.length * 3, 'task'), separator: true, disabled: !pushable.length, onSelect: () => repush(pushable.flatMap((p) => [0, 1, 2].map((k) => tkey(p.num, k)))) },
    { label: 'Repush failed only', note: pl(failed.length, 'task'), disabled: !failed.length, onSelect: () => repush(failed) },
  ];
  const waiting = sel.length - pushable.length;
  const valP = sel.length === 1 && tp(sel[0]) === 'needs_validation' ? sel[0] : null;

  return (
    <div className="view">
      <div className="row wrap" style={{ gap: 12, alignItems: 'stretch' }}>
        <div className="panel panel-pad row wrap" style={{ flex: '1 1 460px', gap: 22 }}>
          {summary.map(([k, v, c]) => <div key={k} className="col" style={{ gap: 0 }}><span className="lbl">{k}</span><span className="mono" style={big(c)}>{v}</span></div>)}
          <span className="tiny muted" style={{ flex: '1 1 100%' }}>Trackpac is the local task (Uploaded is its final state). Bat and biomechanics run in the cloud once that pitch’s Trackpac has uploaded.</span>
        </div>
        <div className="panel panel-pad col" style={{ flex: '1 1 420px' }}>
          <div className="row" style={{ gap: 10 }}><span className="small" style={{ width: 130, color: 'var(--text-2)' }}>Trackpac (local)</span>{bar(TP_ORDER, TPS, tpCount)}<span className="mono tiny" style={{ width: 120, textAlign: 'right', color: 'var(--text-3)' }}>{tpCount.uploaded ?? 0}/{N} uploaded</span></div>
          {CLOUD_TASKS.map(([, n], k) => <div key={n} className="row" style={{ gap: 10 }}><span className="small" style={{ width: 130, color: 'var(--text-2)' }}>{n}</span>{bar(CL_ORDER, CLS, per[k])}<span className="mono tiny" style={{ width: 120, textAlign: 'right', color: 'var(--text-3)' }}>{per[k].success ?? 0}/{N} success</span></div>)}
          <div className="row wrap tiny" style={{ gap: 12, color: 'var(--text-3)' }}><span style={{ fontWeight: 600 }} className="muted">Trackpac</span>{TP_ORDER.map((c) => <span key={c} className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: TPS[c][2] }} />{TPS[c][0]}</span>)}</div>
          <div className="row wrap tiny" style={{ gap: 12, color: 'var(--text-3)' }}><span style={{ fontWeight: 600 }} className="muted">Cloud</span>{CL_ORDER.map((c) => <span key={c} className="row" style={{ gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: CLS[c][2] }} />{CLS[c][0]}</span>)}</div>
        </div>
      </div>

      <main className="panel" style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-head">
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>Pitches</h2>
          <div className="row" style={{ gap: 4 }}>
            {([['all', 'All'], ['failed', `Needs attention · ${ds.pitches.filter(attention).length}`], ['open', 'Not complete']] as [typeof st.cloudFilter, string][]).map(([k, l]) => (
              <button key={k} type="button" className="filter" aria-pressed={st.cloudFilter === k} onClick={() => st.set({ cloudFilter: k, cloudPicks: {}, clMenu: null })}>{l}</button>
            ))}
          </div>
        </div>
        <div className="row wrap" style={{ padding: '8px 14px', minHeight: 50, borderBottom: `1px solid ${sel.length ? 'var(--accent-edge)' : 'var(--border)'}`, background: sel.length ? 'var(--accent-bg)' : 'transparent' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: sel.length ? '#CFE8FF' : 'var(--text-3)' }}>{sel.length ? `${pl(sel.length, 'pitch')} selected` : 'No pitches selected'}</span>
          <span className="small muted">{sel.length ? 'Right-click a selected pitch, or a task in it, to repush.' : 'Click a pitch to select it. Ctrl-click or Shift-click to select more. Right-click to repush.'}</span>
          <span className="grow" />
          {valP && <button type="button" className="btn warn" onClick={() => st.set({ view: 'pp', ppSel: valP.num, ppPicks: {}, ppTask: 2, ppFilter: 'all', focusAlertId: null })}>Validate Trackpac in Post-processing</button>}
          <button type="button" className="btn primary" aria-haspopup="menu" disabled={!sel.length} onClick={(e) => openMenu(null, e, true)}>Repush…</button>
          {sel.length > 0 && <button type="button" className="btn" onClick={() => st.set({ cloudPicks: {}, clMenu: null })}>Clear selection</button>}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 780 }}>
            <div className="lbl" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}><span /><span>Pitch</span><span>Trackpac (local)</span>{CLOUD_TASKS.map(([, n]) => <span key={n}>{n} (cloud)</span>)}</div>
            {visible.map((p) => {
              const t = tp(p); const att = attention(p);
              return (
                <button key={p.num} type="button" aria-pressed={isSel(p.num)} className="list-row" onClick={(e) => click(p, e)} onContextMenu={(e) => openMenu(p, e)}
                  style={{ gridTemplateColumns: GRID, padding: '8px 14px', minHeight: 40, background: isSel(p.num) ? undefined : att ? 'rgba(255,95,87,.05)' : undefined }}>
                  <HealthDot h={rowFailed(p) || t === 'failed' ? 'crit' : att ? 'warn' : rowDone(p) ? 'ok' : 'info'} />
                  <span className="mono small">Pitch {p.num} · {p.time}</span>
                  <span data-task="" className="chip" style={css(TPS[t][1])}>{TPS[t][0]}</span>
                  {CLOUD_TASKS.map((_, k) => {
                    const c = cs(p, k); const waitingTp = c === 'queued' && t !== 'uploaded';
                    return <span key={k} data-task={k} className="chip" style={css(CLS[c][1])}>{c === 'processing' && <span className="dot" style={{ width: 6, height: 6, background: '#7CC4FF', animation: 'blink 1.4s infinite' }} />}{waitingTp ? (t === 'failed' ? 'Blocked · Trackpac failed' : 'Queued · waiting on Trackpac') : CLS[c][0]}</span>;
                  })}
                </button>
              );
            })}
          </div>
        </div>
      </main>
      {m && sel.length > 0 && <ContextMenu pos={m} title={`Repush ${sel.length === 1 ? `pitch ${sel[0].num}` : pl(sel.length, 'pitch')} to the cloud`} items={items}
        footnote={waiting ? `${waiting} selected ${waiting === 1 ? 'pitch is' : 'pitches are'} still waiting on Trackpac, so ${waiting === 1 ? 'it' : 'they'} can’t be pushed yet.` : undefined} onClose={() => st.set({ clMenu: null })} />}
    </div>
  );
}
