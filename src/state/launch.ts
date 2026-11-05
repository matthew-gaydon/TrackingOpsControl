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
const KEY = 'toc.operator';

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

/** Open a session's dataset in the main view. */
export function openSession(dataset: string) {
  window.location.href = urlWithData(dataset);
}

/** Back to the session list (stays signed in). */
export function toSessions() {
  window.location.href = urlWithData(null);
}

function urlWithData(dataset: string | null): string {
  const u = new URL(window.location.href);
  if (dataset) u.searchParams.set('data', dataset); else u.searchParams.delete('data');
  return u.toString();
}
