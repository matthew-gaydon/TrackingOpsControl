import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useUi, type Zoom } from '../state/store';

const MAX = 8;
let dragged = false;
/** True right after a drag-pan, so click handlers can ignore the click that ends a drag. */
export const wasDrag = () => dragged;

function clampZoom(z: Zoom, w: number, h: number): Zoom {
  return { s: z.s, x: Math.min(0, Math.max(w * (1 - z.s), z.x)), y: Math.min(0, Math.max(h * (1 - z.s), z.y)) };
}

/**
 * A camera image viewport: scroll-wheel zoom around the cursor (100–800%), drag to pan,
 * optional − / % / + buttons. Zoom is remembered per `zoomKey` (view + camera + image type).
 * `children` may be a function of the current scale (used to counter-scale handles).
 */
export function ZoomBox({ zoomKey, children, controls = true, className = '', style, as = 'div', label }: {
  zoomKey: string; children: ReactNode | ((scale: number) => ReactNode); controls?: boolean; className?: string; style?: CSSProperties; as?: 'div' | 'span'; label?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const z = useUi((s) => s.zoom[zoomKey]) ?? { s: 1, x: 0, y: 0 };
  const setZoom = (next: Zoom | null) => useUi.getState().set((s) => {
    const m = { ...s.zoom };
    if (!next || next.s <= 1.001) delete m[zoomKey]; else m[zoomKey] = next;
    return { zoom: m };
  });
  const zoomAt = (px: number, py: number, f: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const cur = useUi.getState().zoom[zoomKey] ?? { s: 1, x: 0, y: 0 };
    const s2 = Math.max(1, Math.min(MAX, cur.s * f));
    setZoom(clampZoom({ s: s2, x: px - (px - cur.x) * (s2 / cur.s), y: py - (py - cur.y) * (s2 / cur.s) }, r.width, r.height));
  };

  // wheel must be non-passive so the view doesn't scroll at the same time
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const onWheel = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-nopan]')) return;
    const cur = useUi.getState().zoom[zoomKey]; if (!cur || cur.s <= 1) return;
    const el = ref.current!; const r = el.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, x0: cur.x, y0: cur.y }; let moved = false;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      moved = true; dragged = true;
      const zz = useUi.getState().zoom[zoomKey]; if (!zz) return;
      setZoom(clampZoom({ s: zz.s, x: start.x0 + dx, y: start.y0 + dy }, r.width, r.height));
    };
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); setTimeout(() => { dragged = false; }, 0); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const center = (f: number) => { const r = ref.current?.getBoundingClientRect(); if (r) zoomAt(r.width / 2, r.height / 2, f); };
  const Tag = as;
  const zoomed = z.s > 1.001;
  return (
    <Tag ref={ref as never} className={`zoom${zoomed ? ' zoomed' : ''} ${className}`} style={style} onPointerDown={onPointerDown} aria-label={label}>
      <Tag className="zoom-inner" style={{ display: 'block', position: 'relative', width: '100%', height: '100%', transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})` }}>
        {typeof children === 'function' ? children(z.s) : children}
      </Tag>
      {controls ? (
        <span className="zoom-ctl" data-nopan="1">
          <button type="button" aria-label="Zoom out" disabled={!zoomed} onClick={() => center(1 / 1.5)}>−</button>
          <button type="button" className="pct" aria-label="Reset zoom" onClick={() => setZoom(null)}>{Math.round(z.s * 100)}%</button>
          <button type="button" aria-label="Zoom in" disabled={z.s >= MAX - 0.01} onClick={() => center(1.5)}>+</button>
        </span>
      ) : zoomed ? <span className="tag-over" style={{ right: 6, bottom: 6, fontSize: 10, color: 'var(--text-2)' }}>{Math.round(z.s * 100)}%</span> : null}
    </Tag>
  );
}
