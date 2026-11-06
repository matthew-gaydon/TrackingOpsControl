import { DEFAULT_THRESHOLDS, type CameraFile, type Dataset, type GameFile, type PitchFile, type MesaSession, type SessionEntry, type StatusMessage } from './types';
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

/** "local.<folder>" = data/<folder>/ (served by the dev server); anything else = public/data/<name>/. */
const datasetBase = (name: string) => name.startsWith('local.') ? `${import.meta.env.BASE_URL}local-data/${name.slice(6)}/` : `${import.meta.env.BASE_URL}data/${name}/`;

/** The session picked on the launch page, from ?session=<id>. */
export function sessionParam(): string | null {
  const p = new URLSearchParams(window.location.search).get('session');
  return p && /^[\w.-]+$/.test(p) ? p : null;
}

export async function loadDataset(name: string): Promise<Dataset> {
  const base = datasetBase(name);
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
      const acs = p.acs ?? (p.acsDelivered === undefined ? undefined : p.acsDelivered ? 'success' : 'fail');
      return { ...p, acs, atMs, time: hasDate(p.time) ? fmtClock(atMs, true) : p.time };
    }),
    status: status.map((m, i) => ({
      ...m, id: m.id ?? `msg${i}`, atMs: when(m.at, `status message ${i}`),
      clearedAtMs: m.clearedAt ? when(m.clearedAt, `status message ${i} clearedAt`) : undefined,
    })),
    thresholds: { ...DEFAULT_THRESHOLDS, ...(game.thresholds ?? {}) },
  };
}

/** A real GroundControl session record, as the launch page shows it. */
export function fromMesa(r: MesaSession): SessionEntry {
  const s = r.session; const away = r.teams?.away?.name, home = r.teams?.home?.name;
  return {
    sessionId: s.id, gamePk: s.mlbGamePk ?? null,
    title: away && home ? `${away} @ ${home}` : away || home || s.metadata?.display_name || s.metadata?.alias || s.id,
    venue: [r.venue?.name, r.venue?.surface?.description].filter(Boolean).join(' · '),
    start: s.startTime, gameMode: s.type, status: s.status.toLowerCase(),
    league: r.league?.name ?? r.competition?.name, gameType: s.mlbGameType,
  };
}

/**
 * Sessions for the launch page. Real sessions from the local data/ folder when there are any
 * (each opens data/<sessionId>/ if that folder holds a dataset, otherwise the demo dataset as a
 * stand-in); otherwise the built-in placeholder list in public/data/sessions.json.
 */
export async function loadSessions(): Promise<SessionEntry[]> {
  const local = await getJson<MesaSession[] | null>(`${import.meta.env.BASE_URL}local-data/sessions.json`, null).catch(() => null);
  if (Array.isArray(local) && local.length) {
    const folders = new Set(await getJson<string[]>(`${import.meta.env.BASE_URL}local-data/datasets.json`, []).catch(() => [] as string[]));
    return local.filter((r) => r?.session?.id).map(fromMesa).map((e) => folders.has(e.sessionId) ? { ...e, dataset: `local.${e.sessionId}` } : { ...e, dataset: 'demo', sample: true });
  }
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
export function img(ds: Dataset, path?: string, width?: number): string | undefined {
  if (!path) return undefined;
  const url = /^(https?:|data:|\/)/.test(path) ? path : ds.base + path;
  // local sample images are large PNGs: ask the dev server for a smaller copy at the width shown
  return width && url.includes('/local-data/') ? `${url}?w=${Math.round(width)}` : url;
}
