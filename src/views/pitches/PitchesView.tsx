import { useEffect, useMemo, useRef } from 'react';
import { usePick } from '../../state/store';
import { useDs, usePpOps } from '../../state/hooks';
import { ACS, confidencePass, hitTone, pitchWorst, strikeZone, szVerdict, type Tone } from '../../data/model';
import type { PitchFile } from '../../data/types';
import { HealthDot } from '../../components/ui';
import { FieldPanel, PitchCard, pitchVerdict } from '../game/GameView';

const INK: Record<Tone | 'none', string> = { ok: 'var(--ok-ink)', warn: 'var(--warn-ink)', crit: 'var(--crit-ink)', none: 'var(--faint)' };
const GRID = '12px 50px 58px 46px 66px 40px 72px 22px';

/** One short cell: coloured text, with a dot so it's never colour-only. */
const Cell = ({ tone, children, title }: { tone: Tone | 'none'; children: React.ReactNode; title?: string }) => (
  <span className="row mono tiny" title={title} style={{ gap: 4, color: INK[tone], whiteSpace: 'nowrap', overflow: 'hidden' }}>
    {tone !== 'none' && <HealthDot h={tone} size={6} />}{children}
  </span>
);

/** The strike zone on one pitch in a few characters: missing PitchToPlate cameras, else the largest PitchToPlate Δ. */
function szCell(p: PitchFile, ds: ReturnType<typeof useDs>): { tone: Tone | 'none'; text: string; title: string } {
  const sz = strikeZone(p, ds);
  if (!sz.length) return { tone: 'none', text: '—', title: 'No strike-zone data' };
  const v = szVerdict(p, ds);
  const tone: Tone = v.crit.length ? 'crit' : v.warn.length ? 'warn' : 'ok';
  const p2p = sz.filter((z) => z.cam.group === 'pitchToPlate');
  const missing = p2p.filter((z) => z.d === null);
  const max = Math.max(0, ...p2p.filter((z) => z.d !== null).map((z) => Math.abs(z.d!)));
  const text = missing.length ? `${missing.map((z) => `P${z.cam.number}`).join(' ')} –` : `±${max.toFixed(3)}`;
  return { tone, text, title: [...v.crit, ...v.warn].join(', ') || `All PitchToPlate cameras within ±${ds.thresholds.strikeZoneTolerance}` };
}

/**
 * Pitches: every pitch in one place, for reviewing at scale. A list with each pitch's verdict and
 * deliverables, its camera mosaics / hit images, and the same pitch card as the Game view.
 * ↑ / ↓ move through the list.
 */
export function PitchesView() {
  const ds = useDs(); const st = usePick('pitchSel', 'pitFilter', 'set'); const ops = usePpOps();
  const latest = ds.pitches.at(-1)!;
  const sel = st.pitchSel ?? latest.num;
  const p = ds.pitches.find((x) => x.num === sel) ?? latest;
  const rows = useMemo(() => [...ds.pitches].reverse().map((q) => ({ q, v: pitchVerdict(q, ds, ops) })), [ds, ops]);
  const visible = rows.filter(({ v }) => st.pitFilter === 'all' || (st.pitFilter === 'red' ? v.h === 'crit' : v.h !== 'ok'));
  const count = { flagged: rows.filter(({ v }) => v.h !== 'ok').length, red: rows.filter(({ v }) => v.h === 'crit').length };
  const select = (n: number) => st.set({ pitchSel: n === latest.num ? null : n, pop: null });

  // keep the selected pitch in view
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-row="${sel}"]`)?.scrollIntoView({ block: 'nearest' }); }, [sel, st.pitFilter]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = visible.findIndex(({ q }) => q.num === sel);
    const next = visible[Math.max(0, Math.min(visible.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (next) select(next.q.num);
  };

  return (
    <div className="view fit-row">
      <main className="panel" style={{ flex: '0 0 470px', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="panel-head">
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>Pitches <span className="mono small muted">{ds.pitches.length}</span></h2>
          <div className="row" style={{ gap: 4 }}>
            {([['all', 'All'], ['flagged', `Flagged · ${count.flagged}`], ['red', `Red · ${count.red}`]] as const).map(([k, l]) => (
              <button key={k} type="button" className="filter" aria-pressed={st.pitFilter === k} onClick={() => st.set({ pitFilter: k })}>{l}</button>
            ))}
          </div>
        </div>
        <div ref={list} className="fill scroll" tabIndex={0} onKeyDown={onKey} aria-label="Pitch list. Up and down arrows move the selection." style={{ outline: 'none' }}>
          <div className="lbl sticky-head" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 6, padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10 }}>
            <span /><span>Pitch</span><span>Time</span><span>Conf</span><span>ACS</span><span>Hit</span><span>Strike zone</span><span>PP</span>
          </div>
          {visible.length === 0 && <div className="small muted" style={{ padding: 14 }}>No pitches here.</div>}
          {visible.map(({ q, v }) => {
            const pass = confidencePass(q, ds);
            const hit = q.hit && q.hit.trackPct != null ? hitTone(q.hit.trackPct, ds) : null;
            const sz = szCell(q, ds);
            const pp = pitchWorst(q, ops);
            const on = q.num === sel;
            const what = `Pitch ${q.num}: ${v.problems.length ? v.problems.join(', ') : 'all deliverables good'}`;
            return (
              <button key={q.num} data-row={q.num} type="button" aria-pressed={on} className={`list-row${v.h === 'crit' && !on ? ' hl' : ''}`} title={what} aria-label={what}
                onClick={() => select(q.num)} style={{ gridTemplateColumns: GRID, gap: 6, padding: '7px 12px', minHeight: 36 }}>
                <HealthDot h={v.h} size={10} />
                <span className="mono small" style={{ fontWeight: 600 }}>{q.num}</span>
                <span className="mono tiny muted">{q.time.slice(0, 8)}</span>
                <Cell tone={pass === null ? 'none' : pass ? 'ok' : 'crit'}>{pass === null ? '—' : pass ? 'PASS' : 'FAIL'}</Cell>
                <Cell tone={q.acs ? ACS[q.acs].tone : 'none'}>{q.acs ? { success: 'OK', noswing: 'No swing', review: 'Review', fail: 'FAILED' }[q.acs] : '—'}</Cell>
                <Cell tone={hit ?? 'none'}>{!q.hit ? '' : q.hit.trackPct != null ? `${q.hit.trackPct}%` : '?'}</Cell>
                <Cell tone={sz.tone} title={sz.title}>{sz.text}</Cell>
                <Cell tone={pp} title="Post-processing (Release, Spin, Trackpac)">{''}</Cell>
              </button>
            );
          })}
        </div>
        <div className="tiny muted" style={{ padding: '8px 12px', borderTop: '1px solid var(--border)' }}>Newest first. Click a pitch, or use ↑ ↓ in the list. Hover a row for what’s wrong.</div>
      </main>
      <FieldPanel p={p} reviewing={false} scope="pitches" />
      <PitchCard p={p} reviewing={false} latestNum={latest.num} scope="pitches" select={select} />
    </div>
  );
}
