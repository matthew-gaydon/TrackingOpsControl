/**
 * Launch flow: sign in → pick a session → main view.
 *
 * Prototype only: there is no real authentication. The operator's name is kept in
 * sessionStorage (per browser tab) so a reload mid-game doesn't sign them out; nothing else
 * from the sign-in form is stored. The open session is the URL's ?data=<dataset>, so opening
 * or switching a session is a page load, which also resets all per-session UI state.
 * When the real backend arrives, signIn/signOut become API calls and sessions.json becomes
 * a request for the operator's sessions.
 */
import type { SessionEntry } from '../data/types';

const KEY = 'toc.operator';
const CREATED_KEY = 'toc.createdSessions';

/** Sessions the operator created on the launch page (prototype: kept in this browser only). */
export function loadCreated(): SessionEntry[] {
  try { return JSON.parse(localStorage.getItem(CREATED_KEY) ?? '[]'); } catch { return []; }
}
export function saveCreated(list: SessionEntry[]) {
  try { localStorage.setItem(CREATED_KEY, JSON.stringify(list)); } catch { /* storage unavailable: kept for this page only */ }
}

/**
 * How the signed-in operator is shown: first initial + last name from a Hawk-Eye email
 * ("first.last@hawkeyeinnovations.com" -> "FLast"; middle names are dropped). A login that
 * isn't first.last is shown as entered (an email shows just the part before the @).
 */
export function displayName(login: string): string {
  const local = login.trim().split('@')[0];
  const parts = local.split(/[._]/).filter(Boolean);
  const cap = (w: string) => w.split('-').map((x) => x.charAt(0).toUpperCase() + x.slice(1).toLowerCase()).join('-');
  if (parts.length < 2) return local;
  return parts[0].charAt(0).toUpperCase() + cap(parts[parts.length - 1]);
}

export function getOperator(): string | null {
  try { return sessionStorage.getItem(KEY); } catch { return null; }
}

export function signIn(name: string) {
  try { sessionStorage.setItem(KEY, name.trim()); } catch { /* private mode: stays signed in until reload */ }
}

/** Back to the sign-in page. */
export function signOut() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  window.location.href = urlWithData(null);
}

/** Open a session's dataset in the main view. `sessionId` lets the main view show that session's identity. */
export function openSession(dataset: string, sessionId?: string) {
  const u = new URL(urlWithData(dataset));
  if (sessionId) u.searchParams.set('session', sessionId);
  window.location.href = u.toString();
}

/** Back to the session list (stays signed in). */
export function toSessions() {
  window.location.href = urlWithData(null);
}

function urlWithData(dataset: string | null): string {
  const u = new URL(window.location.href);
  if (dataset) u.searchParams.set('data', dataset); else u.searchParams.delete('data');
  u.searchParams.delete('session');
  return u.toString();
}
