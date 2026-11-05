import { useEffect, useRef, type ReactNode } from 'react';
import { useUi, type MenuPos } from '../state/store';
import { SHORT, type Severity } from '../alerts/engine';

export const Chevron = ({ dir = 'right', size = 12 }: { dir?: 'right' | 'left' | 'down'; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
    <path d={dir === 'right' ? 'M9 6l6 6-6 6' : dir === 'left' ? 'M15 6l-6 6 6 6' : 'M6 9l6 6 6-6'} />
  </svg>
);
export const Arrow = () => (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export const SevBadge = ({ sev }: { sev: Severity }) => <span className={`badge ${sev}`}>{SHORT[sev]}</span>;

const HC: Record<string, string> = { ok: 'var(--ok)', warn: 'var(--warn)', crit: 'var(--crit)', info: 'var(--accent)', none: '#2A313C' };
/** Status is never colour-only: circle = ok, square = problem. */
export const HealthDot = ({ h, size = 9 }: { h: 'ok' | 'warn' | 'crit' | 'info' | 'none'; size?: number }) => (
  <span className={`dot ${h === 'ok' || h === 'info' ? '' : 'sq'}`} style={{ width: size, height: size, background: HC[h] }} />
);

export function Seg<T extends string>({ value, options, onChange, label, role = 'radiogroup', large, disabled }: {
  value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label: string; role?: 'radiogroup' | 'tablist'; large?: boolean; disabled?: boolean;
}) {
  return (
    <div role={role} aria-label={label} className={`seg${large ? ' lg' : ''}`}>
      {options.map(([k, l]) => (
        <button key={k} type="button" disabled={disabled} role={role === 'tablist' ? 'tab' : 'radio'}
          {...(role === 'tablist' ? { 'aria-selected': value === k } : { 'aria-checked': value === k })} onClick={() => onChange(k)}>{l}</button>
      ))}
    </div>
  );
}

export const Switch = ({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) => (
  <button type="button" className="switch" aria-pressed={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}><span /></button>
);

export function Stepper({ value, onChange, step, decimals = 0, min = -Infinity, max = Infinity, label, disabled, changed, width }: {
  value: number; onChange: (v: number) => void; step: number; decimals?: number; min?: number; max?: number; label: string; disabled?: boolean; changed?: boolean; width?: number;
}) {
  const r = (x: number) => +x.toFixed(decimals);
  return (
    <span className="stepper">
      <button type="button" aria-label={`Decrease ${label}`} disabled={disabled} onClick={() => onChange(Math.max(min, r(value - step)))}>−</button>
      <span className={`val${changed ? ' changed' : ''}${disabled ? ' off' : ''}`} style={width ? { width } : undefined}>{value.toFixed(decimals)}</span>
      <button type="button" aria-label={`Increase ${label}`} disabled={disabled} onClick={() => onChange(Math.min(max, r(value + step)))}>+</button>
    </span>
  );
}

/** Small confirm popout used before any jump to another view ("Take me there"). */
export const GoPopout = ({ text, onGo, onCancel, goLabel = 'Take me there' }: { text: string; onGo: () => void; onCancel: () => void; goLabel?: string }) => (
  <div role="dialog" aria-label="Go to detail" className="popout">
    <span style={{ flex: '1 1 200px', fontSize: 12, color: '#CFE8FF', lineHeight: 1.4 }}>{text}</span>
    <button type="button" className="btn primary" onClick={onGo}>{goLabel}<Arrow /></button>
    <button type="button" className="btn" style={{ background: 'transparent' }} onClick={onCancel}>Cancel</button>
  </div>
);

export interface MenuItem { label: string; note?: string; onSelect: () => void; disabled?: boolean; first?: boolean; separator?: boolean }
/** Right-click / button context menu, fixed to the cursor. */
export function ContextMenu({ pos, title, items, footnote, onClose }: { pos: MenuPos; title: string; items: MenuItem[]; footnote?: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); }, []);
  const x = Math.min(pos.x, window.innerWidth - 290), y = Math.min(pos.y, window.innerHeight - 60 - items.length * 36);
  return (
    <>
      <button type="button" className="menu-backdrop" aria-label="Close menu" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div ref={ref} role="menu" aria-label={title} className="menu" style={{ left: Math.max(8, x), top: Math.max(8, y) }}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <span className="menu-title">{title}</span>
        {items.map((it) => (
          <span key={it.label} style={{ display: 'contents' }}>
            {it.separator && <hr />}
            <button type="button" role="menuitem" disabled={it.disabled} className={it.first ? 'first' : ''} onClick={() => { it.onSelect(); onClose(); }}>
              <span style={{ flex: '1 1 auto' }}>{it.label}</span>{it.note && <span className="mono tiny muted">{it.note}</span>}
            </button>
          </span>
        ))}
        {footnote && <span className="tiny muted" style={{ padding: '6px 12px 8px', lineHeight: 1.4 }}>{footnote}</span>}
      </div>
    </>
  );
}

/** Where to open a menu: at the cursor for right-click, under the button otherwise. */
export function menuPos(e: React.MouseEvent, viaButton = false): MenuPos {
  e.preventDefault();
  const t = (e.target as HTMLElement).closest?.('[data-task]') as HTMLElement | null;
  const task = t && t.dataset.task !== '' ? Number(t.dataset.task) : null;
  if (viaButton) { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); return { x: r.right - 270, y: r.bottom + 4, task: null }; }
  return { x: e.clientX, y: e.clientY, task };
}

/** Lets one store field be toggled with a stable callback. */
export const useSet = () => useUi((s) => s.set);
