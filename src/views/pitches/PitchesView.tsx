import { useEffect, useMemo, useRef } from 'react';
import { usePick } from '../../state/store';
import { useDs, usePpOps } from '../../state/hooks';
import { HealthDot } from '../../components/ui';
import { FieldPanel, PitchCard, pitchVerdict } from '../game/GameView';

const GRID = '12px 1fr auto';
const TONE_TEXT = { ok: 'var(--text-2)', warn: 'var(--warn-ink)', crit: 'var(--crit-ink)' } as const;

/**
 * Pitches: every pitch in one place, for reviewing at scale. A slim list (status, pitch, time),
 * the pitch's camera mosaics / hit images, and the same pitch card as the Game view (which holds
 * all the per-pitch detail). ↑ / ↓ move through the list.
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
      <main className="panel" style={{ flex: '0 0 188px', minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="col" style={{ gap: 8, padding: '10px 10px 8px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>Pitches <span className="mono small muted">{ds.pitches.length}</span></h2>
          <div role="radiogroup" aria-label="Show pitches" className="seg" style={{ padding: 2 }}>
            {([['all', 'All', ''], ['flagged', 'Flagged', count.flagged], ['red', 'Red', count.red]] as const).map(([k, l, n]) => (
              <button key={k} type="button" role="radio" aria-checked={st.pitFilter === k} onClick={() => st.set({ pitFilter: k })} style={{ flex: '1 1 auto', padding: '5px 6px', fontSize: 11 }}>
                {l}{n !== '' && <span className="mono" style={{ marginLeft: 4, color: k === 'red' && n ? 'var(--crit-ink)' : k === 'flagged' && n ? 'var(--warn-ink)' : undefined }}>{n}</span>}
              </button>
            ))}
          </div>
        </div>
        <div ref={list} className="fill scroll" tabIndex={0} onKeyDown={onKey} aria-label="Pitch list. Up and down arrows move the selection." style={{ outline: 'none', scrollbarWidth: 'thin' }}>
          {visible.length === 0 && <div className="small muted" style={{ padding: 12 }}>No pitches here.</div>}
          {visible.map(({ q, v }) => {
            const on = q.num === sel;
            const what = `Pitch ${q.num}: ${v.problems.length ? v.problems.join(', ') : 'all deliverables good'}`;
            return (
              <button key={q.num} data-row={q.num} type="button" aria-pressed={on} className="list-row" title={what} aria-label={what}
                onClick={() => select(q.num)} style={{ gridTemplateColumns: GRID, gap: 10, padding: '7px 10px', minHeight: 34 }}>
                <HealthDot h={v.h} size={10} />
                <span className="mono small" style={{ fontWeight: 600, color: TONE_TEXT[v.h] }}>Pitch {q.num}</span>
                <span className="mono tiny muted">{q.time.slice(0, 8)}</span>
              </button>
            );
          })}
        </div>
        <div className="tiny muted" style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', lineHeight: 1.4 }}>Newest first. ↑ ↓ to step. Hover for what’s wrong.</div>
      </main>
      <FieldPanel p={p} reviewing={false} scope="pitches" />
      <PitchCard p={p} reviewing={false} latestNum={latest.num} scope="pitches" select={select} />
    </div>
  );
}
