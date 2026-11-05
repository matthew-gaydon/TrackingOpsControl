/**
 * Dataset times → absolute timestamps (ms since epoch, UTC).
 *
 * Datasets may give either full timestamps ("2026-11-04T05:09:34Z", preferred) or clock-only
 * times ("05:09:34", BMCC "05-09-34.206"). A clock-only time has no date, so it is read as the
 * latest moment with that clock time at or before the dataset's `now`. Everything in a dataset has
 * already happened by `now`, so this resolves a game that crosses midnight correctly
 * (e.g. 23:58 with now = 00:40 is the previous day).
 */

const DAY = 86_400_000;
/** Clock times this far after `now` are still taken as today (covers a message stamped at `now`). */
const GRACE = 60_000;
const DATED = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/** True for a full timestamp, false for a clock-only time. */
export const hasDate = (t: string) => DATED.test(t.trim());

/** "05-09-23.565", "05:09:23" or "05:09:23.565" -> seconds since midnight. NaN if unreadable. */
export function clockSec(t: string): number {
  const m = t.match(/(\d{1,2})[-:](\d{2})[-:](\d{2})(?:\.(\d+))?/);
  if (!m) return NaN;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + (m[4] ? +('0.' + m[4]) : 0);
}

/** A full timestamp with no zone is taken as UTC, so it reads the same on every machine. */
function parseDated(t: string): number {
  let s = t.trim().replace(' ', 'T');
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(s)) s += 'Z';
  return Date.parse(s);
}

/** The dataset clock (`game.now`, with `game.date` for a clock-only value). */
export function resolveNow(now: string, date?: string): number {
  if (hasDate(now)) {
    const ms = parseDated(now);
    if (isNaN(ms)) throw new Error(`game.now "${now}" is not a readable timestamp`);
    return ms;
  }
  const s = clockSec(now);
  if (isNaN(s)) throw new Error(`game.now "${now}" is not a readable time`);
  const day = Date.parse(`${date ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  if (isNaN(day)) throw new Error(`game.date "${date}" is not a YYYY-MM-DD date`);
  return day + Math.round(s * 1000);
}

/** Any dataset time, made absolute against the dataset clock. NaN if unreadable. */
export function resolveTime(t: string, nowMs: number): number {
  if (hasDate(t)) return parseDated(t);
  const s = clockSec(t);
  if (isNaN(s)) return NaN;
  let ms = Math.floor(nowMs / DAY) * DAY + Math.round(s * 1000);
  if (ms > nowMs + GRACE) ms -= DAY;
  return ms;
}

/** "HH:MM:SS" (or "HH:MM:SS.mmm") in UTC, the same clock the dataset uses. */
export function fmtClock(ms: number, withMs = false): string {
  if (!isFinite(ms)) return '—';
  return new Date(ms).toISOString().slice(11, withMs ? 23 : 19);
}

export function fmtDuration(sec: number): string {
  if (!isFinite(sec) || sec < 0) return '';
  if (sec < 60) return `${Math.round(sec)} s`;
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h ? `${h}h ${m % 60}m` : `${m}m ${Math.round(sec % 60)}s`;
}
