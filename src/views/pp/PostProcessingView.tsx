import { usePick } from '../../state/store';
import { useAlerts, useDs, usePpOps } from '../../state/hooks';
import { img } from '../../data/load';
import { isBad, pitchWorst, reviewable, taskState, taskStatus, taskValue, tkey, TASKS, type TaskState } from '../../data/model';
import type { PitchFile } from '../../data/types';
import { ContextMenu, HealthDot, menuPos, type MenuItem } from '../../components/ui';
import { ZoomBox } from '../../components/ZoomBox';

const COL: Record<TaskState, string> = { ok: '#9FD9BA', warn: 'var(--warn-ink)', crit: 'var(--crit-ink)', reviewed: '#A9D6FF', queued: '#A9D6FF', processing: '#7CC4FF' };
const PILL: Record<TaskState, string> = { ok: 'ok', warn: 'warn', crit: 'crit', reviewed: 'info', queued: 'info', processing: 'info' };
const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w === 'pitch' ? 'es' : 's'}`;
const GRID = '16px 1.4fr 1fr 1.6fr 1fr 90px';

export function PostProcessingView() {
  const ds = useDs(); const st = usePick('ppAffected', 'ppFilter', 'ppMenu', 'ppPicks', 'ppQueue', 'ppSel', 'ppTask', 'reviewed', 'set'); const ops = usePpOps(); const al = useAlerts();
  const enqueue = (keys: string[]) => st.set((s) => { const q = [...s.ppQueue]; keys.forEach((k) => { if (!q.includes(k)) q.push(k); }); return { ppQueue: q }; });

  const keep = (p: PitchFile) => st.ppFilter === 'all' || (st.ppFilter === 'flag' && pitchWorst(p, ops) !== 'ok') || (st.ppFilter === 'affected' && st.ppAffected.includes(p.num));
  const visible = [...ds.pitches].reverse().filter(keep);
  const picked = Object.keys(st.ppPicks).map(Number);
  const selNums = picked.length ? picked : st.ppSel === null ? [] : [st.ppSel];
  const isSel = (n: number) => selNums.includes(n);
  const sel = ds.pitches.filter((p) => isSel(p.num)).sort((a, b) => b.num - a.num);
  const focus = al.focus && !al.focus.acked && al.focus.route.view === 'pp' ? al.focus : null;
  const hl = (n: number) => !!focus && (focus.route.affected?.includes(n) || focus.route.ppSel === n);

  const click = (p: PitchFile, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const cur = new Set(selNums); cur.has(p.num) ? cur.delete(p.num) : cur.add(p.num);
      const left = [...cur];
      st.set({ ppPicks: left.length > 1 ? Object.fromEntries(left.map((n) => [n, true])) : {}, ppSel: left.length ? (cur.has(p.num) ? p.num : left[0]) : null, ppTask: null, ppMenu: null });
    } else if (e.shiftKey && st.ppSel !== null) {
      const a = visible.findIndex((q) => q.num === st.ppSel), b = visible.findIndex((q) => q.num === p.num);
      const range = a < 0 ? [p] : visible.slice(Math.min(a, b), Math.max(a, b) + 1);
      st.set({ ppPicks: Object.fromEntries(range.map((q) => [q.num, true])), ppTask: null, ppMenu: null });
    } else st.set({ ppSel: p.num, ppPicks: {}, ppTask: null, ppMenu: null });
  };
  const openMenu = (p: PitchFile | null, e: React.MouseEvent, viaButton = false) => {
    const pos = menuPos(e, viaButton);
    st.set(p && !isSel(p.num) ? { ppMenu: pos, ppSel: p.num, ppPicks: {} } : { ppMenu: pos });
  };

  // summary
  let okT = 0, badT = 0;
  ds.pitches.forEach((p) => [0, 1, 2].forEach((k) => (isBad(taskState(p, k, ops)) ? badT++ : okT++)));
  const perTask = TASKS.map((n, k) => ({ n, ok: ds.pitches.filter((p) => !isBad(taskState(p, k, ops))).length, bad: ds.pitches.filter((p) => isBad(taskState(p, k, ops))).length }));
  const errs = ds.pitches.map((p) => p.pp.spin.fitError ?? 0);
  const review = ds.thresholds.spinFitErrorReview;
  const ymax = Math.max(review * 1.2, ...errs);
  const spark = errs.map((e, i) => `${(i * 300 / Math.max(1, errs.length - 1)).toFixed(1)},${(56 - (e / ymax) * 50).toFixed(1)}`).join(' ');
  const failedKeys = (ps: PitchFile[]) => ps.flatMap((p) => [0, 1, 2].filter((k) => isBad(taskState(p, k, ops))).map((k) => tkey(p.num, k)));
  const spinAlert = al.byKey.spin && !al.byKey.spin.acked && !al.byKey.spin.cleared ? al.byKey.spin : undefined;

  // menu
  const m = st.ppMenu;
  const order = m && m.task !== null ? [m.task, ...[0, 1, 2].filter((k) => k !== m.task)] : [0, 1, 2];
  const items: MenuItem[] = [
    ...order.map((k, i) => ({ label: `Reprocess ${TASKS[k]}`, note: pl(sel.length, 'pitch'), first: !!m && m.task === k && i === 0, onSelect: () => enqueue(sel.map((p) => tkey(p.num, k))) })),
    { label: 'Reprocess all tasks', note: pl(sel.length * 3, 'task'), separator: true, onSelect: () => enqueue(sel.flatMap((p) => [0, 1, 2].map((k) => tkey(p.num, k)))) },
    { label: 'Reprocess failed tasks only', note: pl(failedKeys(sel).length, 'task'), disabled: !failedKeys(sel).length, onSelect: () => enqueue(failedKeys(sel)) },
  ];

  const single = sel.length === 1 ? sel[0] : null;
  const LIGHT = (t: TaskState, p: PitchFile, k: number) => t === 'crit' || (t === 'warn' && !reviewable(p, k, ops)) ? ['var(--crit)', 2] : t === 'warn' ? ['var(--warn)', 2] : t === 'ok' ? ['var(--ok)', 6] : ['var(--accent)', t === 'reviewed' ? 2 : 6];

  return (
    <div className="view">
      <div className="row wrap" style={{ gap: 12, alignItems: 'stretch' }}>
        <div className="panel panel-pad row wrap" style={{ flex: '1 1 460px', gap: 22 }}>
          {[['Success', okT.toLocaleString(), 'var(--ok-ink)'], ['Need attention', String(badT), badT ? 'var(--warn-ink)' : 'var(--text-hi)'], ['Queued', String(st.ppQueue.length), st.ppQueue.length ? '#7CC4FF' : 'var(--text-hi)']].map(([k, v, c]) => (
            <div key={k} className="col" style={{ gap: 0 }}><span className="lbl">{k}</span><span className="mono" style={{ fontSize: 24, fontWeight: 600, color: c }}>{v}</span></div>
          ))}
          <div className="col" style={{ gap: 0 }}><span className="lbl">ETA</span><span style={{ fontSize: 16, fontWeight: 600 }}>{st.ppQueue.length ? `~${st.ppQueue.length * 2} s` : 'Completed'}</span></div>
        </div>
        <div className="panel panel-pad col" style={{ flex: '1 1 360px' }}>
          {perTask.map((t) => (
            <div key={t.n} className="row" style={{ gap: 10 }}>
              <span className="small" style={{ width: 92, color: 'var(--text-2)' }}>{t.n}</span>
              <div className="grow" style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', background: '#1E242E' }}><span style={{ width: `${t.ok / ds.pitches.length * 100}%`, background: 'var(--ok)' }} /><span style={{ width: `${t.bad / ds.pitches.length * 100}%`, background: 'var(--warn)' }} /></div>
              <span className="mono small" style={{ width: 130, textAlign: 'right', color: 'var(--text-3)' }}>{t.ok} ok · {t.bad} flagged</span>
            </div>
          ))}
        </div>
        <div className="panel panel-pad col" style={{ flex: '1 1 300px', gap: 6, border: spinAlert && focus?.id === spinAlert.id ? '2px solid var(--warn)' : undefined }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><span className="lbl">Spin fit error · this game</span>{spinAlert && <span className="mono tiny" style={{ color: 'var(--warn-ink)' }}>above review line</span>}</div>
          <svg viewBox="0 0 300 56" role="img" aria-label={`Spin fit error per pitch with the ${review} review line`} style={{ width: '100%', height: 56 }}>
            <line x1="0" y1={56 - (review / ymax) * 50} x2="300" y2={56 - (review / ymax) * 50} stroke="#F5B841" strokeDasharray="4 4" strokeWidth="1" />
            <polyline points={spark} fill="none" stroke="#5AB8FF" strokeWidth="2" strokeLinejoin="round" />
          </svg>
          <span className="tiny muted">Dashed: {review} review line. Crossing it raises an alert.</span>
        </div>
      </div>

      <div className="fit-row fill">
        <main className="panel" style={{ flex: '999 1 600px', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="panel-head">
            <h2 style={{ fontSize: 14, fontWeight: 600 }}>Pitches</h2>
            <div className="row" style={{ gap: 4 }}>
              {([['all', 'All'], ['flag', 'Needs review'], ...(st.ppFilter === 'affected' ? [['affected', 'Affected pitches']] : [])] as [typeof st.ppFilter, string][]).map(([k, l]) => (
                <button key={k} type="button" className="filter" aria-pressed={st.ppFilter === k} onClick={() => st.set({ ppFilter: k, ppPicks: {}, ppMenu: null })}>{l}</button>
              ))}
            </div>
          </div>
          {st.ppFilter === 'affected' && <div className="small" style={{ padding: '8px 14px', color: '#FFE0A0', background: 'var(--warn-bg)', borderBottom: '1px solid #4E3E17' }}>Showing pitches tracked while a camera was missing. Review each, then acknowledge the alert.</div>}
          <div className="row wrap" style={{ padding: '8px 14px', minHeight: 50, borderBottom: `1px solid ${sel.length ? 'var(--accent-edge)' : 'var(--border)'}`, background: sel.length ? 'var(--accent-bg)' : 'transparent' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: sel.length ? '#CFE8FF' : 'var(--text-3)' }}>{sel.length > 1 ? `${pl(sel.length, 'pitch')} selected` : single ? `Pitch ${single.num} selected` : 'No pitches selected'}</span>
            <span className="small muted">{sel.length > 1 ? 'Right-click a selected pitch, or a task in it, to reprocess.' : single ? 'Ctrl-click or Shift-click to select more pitches. Right-click to reprocess.' : 'Click a pitch to select it. Ctrl-click or Shift-click to select more. Right-click to reprocess.'}</span>
            <span className="grow" />
            <button type="button" className="btn primary" aria-haspopup="menu" disabled={!sel.length} onClick={(e) => openMenu(null, e, true)}>Reprocess…</button>
            {sel.length > 0 && <button type="button" className="btn" onClick={() => st.set({ ppPicks: {}, ppSel: null, ppMenu: null, ppTask: null })}>Clear selection</button>}
          </div>
          <div className="fill scroll">
            <div style={{ minWidth: 720 }}>
              <div className="lbl sticky-head" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)' }}><span /><span>Pitch</span>{TASKS.map((t) => <span key={t}>{t}</span>)}<span title="Placeholder: worker assignment isn't in the dataset yet">Worker · sample</span></div>
              {visible.map((p) => {
                const w = pitchWorst(p, ops);
                return (
                  <button key={p.num} type="button" aria-pressed={isSel(p.num)} className={`list-row${hl(p.num) && !isSel(p.num) ? ' hl' : ''}`} style={{ gridTemplateColumns: GRID }}
                    onClick={(e) => click(p, e)} onContextMenu={(e) => openMenu(p, e)}>
                    <HealthDot h={w === 'ok' ? 'ok' : w} />
                    <span className="mono small">Pitch {p.num} · {p.time}</span>
                    {TASKS.map((_, k) => <span key={k} data-task={k} className="mono small" style={{ color: COL[taskState(p, k, ops)] }}>{k === 2 ? taskValue(p, k, ops) : taskState(p, k, ops) === 'ok' ? taskValue(p, k, ops) : taskStatus(p, k, ops)}</span>)}
                    <span className="mono tiny" style={{ color: 'var(--faint)', fontStyle: 'italic' }} title="Placeholder value">{p.num % 3 === 1 ? 'BCPP1' : 'BPP1 · BCPP1'}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="row wrap" style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
            <button type="button" className="btn" disabled={!failedKeys(ds.pitches).length} onClick={() => enqueue(failedKeys([...ds.pitches].reverse()))}>Reprocess failed ({failedKeys(ds.pitches).length})</button>
            <button type="button" className="btn" disabled title="Not built in the prototype yet">Bulk reprocess with model… · coming soon</button>
            <span className="grow" />
            <button type="button" className="btn danger" disabled={!st.ppQueue.length} onClick={() => st.set({ ppQueue: [] })}>Clear task queue</button>
          </div>
        </main>

        <aside className="panel panel-pad col scroll" style={{ flex: '1 1 400px', maxWidth: 500, minWidth: 0, gap: 12 }}>
          {sel.length === 0 && <div className="col" style={{ flex: '1 1 auto', alignItems: 'center', justifyContent: 'center', padding: '60px 12px', textAlign: 'center' }}><span style={{ fontSize: 13, color: 'var(--text-2)' }}>No pitches selected</span><span className="small muted">Select a pitch to see its tasks, or several pitches for an overview.</span></div>}
          {sel.length > 1 && (() => {
            const probs = [0, 1, 2].map((k) => sel.filter((p) => isBad(taskState(p, k, ops))).length);
            const total = probs.reduce((a, b) => a + b, 0);
            const cols = 'minmax(0, 1fr) 64px 64px 64px';
            return (
              <>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ fontSize: 16, fontWeight: 600 }}>{pl(sel.length, 'pitch')} selected</h2><span className={`pill ${total ? 'warn' : 'ok'}`}>{total ? `${pl(total, 'task')} need${total === 1 ? 's' : ''} attention` : 'All tasks OK'}</span></div>
                <div className="row wrap tiny" style={{ gap: 12, color: 'var(--text-3)' }}>
                  {[['var(--ok)', 6, 'Success'], ['var(--warn)', 2, 'Needs review'], ['var(--crit)', 2, 'Failed'], ['var(--accent)', 6, 'Queued / processing']].map(([c, r, l]) => <span key={l as string} className="row" style={{ gap: 6 }}><span className="light" style={{ background: c as string, borderRadius: r as number }} />{l}</span>)}
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <div className="lbl" style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '8px 12px', background: 'var(--panel-2)', borderBottom: '1px solid var(--border)' }}><span>Pitch</span>{TASKS.map((t) => <span key={t} style={{ textAlign: 'center' }}>{t}</span>)}</div>
                  <div className="tiny muted" style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '6px 12px', borderBottom: '1px solid var(--border)' }}><span>Problems</span>{probs.map((n, k) => <span key={k} className="mono" style={{ textAlign: 'center', fontWeight: 600, color: n ? 'var(--warn-ink)' : 'var(--faint)' }}>{n || '—'}</span>)}</div>
                  <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                    {sel.map((p) => (
                      <button key={p.num} type="button" onClick={() => st.set({ ppSel: p.num, ppPicks: {}, ppTask: null })} onContextMenu={(e) => openMenu(p, e)}
                        aria-label={`Pitch ${p.num}: ${TASKS.map((n, k) => `${n} ${taskStatus(p, k, ops)}`).join(', ')}. Open details.`}
                        style={{ width: '100%', display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '7px 12px', minHeight: 34, border: 0, borderBottom: '1px solid var(--line)', background: 'transparent', textAlign: 'left' }}>
                        <span className="mono small" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Pitch {p.num} · {p.time}</span>
                        {[0, 1, 2].map((k) => { const [c, r] = LIGHT(taskState(p, k, ops), p, k); return <span key={k} style={{ display: 'flex', justifyContent: 'center' }}><span className="light" title={`${TASKS[k]}: ${taskStatus(p, k, ops)}`} style={{ background: c as string, borderRadius: r as number }} /></span>; })}
                      </button>
                    ))}
                  </div>
                </div>
                <span className="tiny muted">Click a pitch for its full detail. Right-click, or use Reprocess…, to reprocess tasks on the selected pitches.</span>
              </>
            );
          })()}
          {single && (() => {
            const p = single; const w = pitchWorst(p, ops);
            return (
              <>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div className="col" style={{ gap: 0 }}><h2 style={{ fontSize: 16, fontWeight: 600 }}>Pitch {p.num}</h2><span className="mono small muted">{p.time}</span></div>
                  <span className={`pill ${w}`}>{w === 'ok' ? 'ALL TASKS OK' : 'NEEDS REVIEW'}</span>
                </div>
                {TASKS.map((n, k) => {
                  const t = taskState(p, k, ops); const focused = st.ppTask === k && isBad(t);
                  return (
                    <div key={n} className="col" style={{ gap: 10, padding: 12, borderRadius: 8, background: 'var(--panel-2)', border: focused ? `2px solid ${t === 'crit' ? 'var(--crit-ink)' : 'var(--warn)'}` : `1px solid ${t === 'warn' ? 'var(--warn-edge)' : t === 'crit' ? 'var(--crit-edge)' : 'var(--border)'}` }}>
                      <div className="row" style={{ gap: 10 }}>
                        <HealthDot h={t === 'ok' ? 'ok' : t === 'crit' ? 'crit' : t === 'warn' ? 'warn' : 'info'} size={10} />
                        <span className="col grow" style={{ gap: 0 }}><span className="small" style={{ color: 'var(--text-3)' }}>{n}</span><span className="mono" style={{ fontSize: 15, fontWeight: 600 }}>{taskValue(p, k, ops)}</span></span>
                        <span className={`pill ${PILL[t]}`}>{taskStatus(p, k, ops)}</span>
                      </div>
                      {isBad(t) && (
                        <div className="row wrap">
                          {t === 'warn' && reviewable(p, k, ops) && <button type="button" className="btn primary" onClick={() => st.set({ reviewed: { ...st.reviewed, [tkey(p.num, k)]: true } })}>Mark reviewed</button>}
                          <button type="button" className="btn" onClick={() => enqueue([tkey(p.num, k)])}>Reprocess {n}</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="col" style={{ gap: 6 }}>
                  <span className="lbl">Spin fit · frames</span>
                  {img(ds, p.spinStrip ?? ds.game.defaultImages?.spinStrip) && <ZoomBox zoomKey={`pp:spin:${p.num}`} style={{ borderRadius: 6, border: '1px solid var(--border)' }}><img src={img(ds, p.spinStrip ?? ds.game.defaultImages?.spinStrip)} alt={`Spin fitting result strip for pitch ${p.num}`} draggable={false} style={{ width: '100%', display: 'block' }} /></ZoomBox>}
                </div>
                <div className="row wrap">
                  <button type="button" className="btn link" onClick={() => st.set({ view: 'game', gameSel: p.num === ds.pitches.at(-1)!.num ? null : p.num, focusAlertId: null })}>View pitch in Game</button>
                  <button type="button" className="btn" onClick={() => enqueue([0, 1, 2].map((k) => tkey(p.num, k)))}>Reprocess all tasks</button>
                </div>
              </>
            );
          })()}
        </aside>
      </div>
      {m && sel.length > 0 && <ContextMenu pos={m} title={`Reprocess on ${single ? `Pitch ${single.num}` : pl(sel.length, 'pitch')}`} items={items} onClose={() => st.set({ ppMenu: null })} />}
    </div>
  );
}
