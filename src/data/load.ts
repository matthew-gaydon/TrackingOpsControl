import { DEFAULT_THRESHOLDS, type CameraFile, type Dataset, type GameFile, type PitchFile, type SessionEntry, type StatusMessage } from './types';
import { fmtClock, hasDate, resolveNow, resolveTime } from './time';

/** The open session's dataset, from ?data=<name>. null = no session open (show the launch page). */
export function datasetName(): string | null {
  const p = new URLSearchParams(window.location.search).get('data');
  return p && /^[\w.-]+$/.test(p) ? p : null;
}

async function getJson<T>(url: string, fallback?: T): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Could not load ${url} (${r.status})`);
  }
  return (await r.json()) as T;
}

export async function loadDataset(name: string): Promise<Dataset> {
  const base = `${import.meta.env.BASE_URL}data/${name}/`;
  const [game, cameras, pitches, status] = await Promise.all([
    getJson<GameFile>(base + 'game.json'),
    getJson<CameraFile[]>(base + 'cameras.json'),
    getJson<PitchFile[]>(base + 'pitches.json'),
    getJson<StatusMessage[]>(base + 'status.json', []),
  ]);
  validate(cameras, pitches);
  const nowMs = resolveNow(game.now, game.date);
  const when = (t: string, what: string) => {
    const ms = resolveTime(t, nowMs);
    if (isNaN(ms)) console.warn(`[data] ${what}: unreadable time "${t}"`);
    return ms;
  };
  return {
    name, base, game, nowMs, cameras,
    pitches: [...pitches].sort((a, b) => a.num - b.num).map((p) => {
      const atMs = when(p.time, `pitch ${p.num}`);
      const acs = p.acs ?? (p.acsDelivered === false ? 'fail' : 'success');
      return { ...p, acs, atMs, time: hasDate(p.time) ? fmtClock(atMs, true) : p.time };
    }),
    status: status.map((m, i) => ({
      ...m, id: m.id ?? `msg${i}`, atMs: when(m.at, `status message ${i}`),
      clearedAtMs: m.clearedAt ? when(m.clearedAt, `status message ${i} clearedAt`) : undefined,
    })),
    thresholds: { ...DEFAULT_THRESHOLDS, ...(game.thresholds ?? {}) },
  };
}

/** Sessions for the launch page (public/data/sessions.json). */
export async function loadSessions(): Promise<SessionEntry[]> {
  const f = await getJson<{ sessions: SessionEntry[] }>(`${import.meta.env.BASE_URL}data/sessions.json`);
  return f.sessions ?? [];
}

/** Light checks so a malformed export fails loudly in the console instead of silently. */
function validate(cameras: CameraFile[], pitches: PitchFile[]) {
  const ids = new Set<string>();
  for (const c of cameras) {
    if (ids.has(c.id)) console.warn(`[data] duplicate camera id ${c.id}`);
    ids.add(c.id);
    if (!['pitchToPlate', 'fullField', 'biomechanics'].includes(c.group)) console.warn(`[data] camera ${c.id} has unknown group ${c.group}`);
  }
  for (const p of pitches) {
    for (const k of Object.keys(p.strikeZone ?? {})) if (!ids.has(k)) console.warn(`[data] pitch ${p.num}: strikeZone refers to unknown camera ${k}`);
  }
}

/** Resolve an image path from the dataset (relative) to a URL. */
export function img(ds: Dataset, path?: string): string | undefined {
  if (!path) return undefined;
  if (/^(https?:|data:|\/)/.test(path)) return path;
  return ds.base + path;
}
