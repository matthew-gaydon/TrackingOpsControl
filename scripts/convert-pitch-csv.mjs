// Converts a pitch-data CSV export into a dataset the app can open.
//
//   node scripts/convert-pitch-csv.mjs data/<sessionId>_pitch-data.csv
//
// The session ID is the file name up to the first "_". The game's identity (teams, venue, GamePK)
// comes from the matching record in data/*sessions*.json. Output: data/<sessionId>/ with
// game.json, cameras.json, pitches.json and status.json. The launch page then opens that session
// with its own pitches instead of the demo stand-in.
//
// What the CSV gives (TrackMan-style pitch export, one row per pitch, times in UTC):
//   pitch number and time, release speed, spin rate, pitch type, call / play result, count,
//   pitcher and batter, and for batted balls exit speed, launch angle, distance and the distance
//   actually tracked. Hit tracked % = LastTrackedDistance / Distance (capped at 100), balls in play only.
// Post-tracking context in the export (pitcher, batter, count, pitch type, result) isn't used:
// the operator wouldn't have it while tracking.
//
// Also read when present (next to the CSV in data/):
//   <sessionId>_acs_data.json or acs_data.json   ACS bat packets, one JSON object per line, `id` = PitchUID.
//     No packet for a pitch -> fail (FAILED). Packet with no swing data -> noswing (NO SWING).
//     Packet with data -> success (SUCCESS). There's no quality check yet, so for the demo a few
//     swings with data are marked review (NEEDS REVIEW), picked with a fixed seed.
//   <sessionId>_sz_diffs_conf.csv or sz_diffs_conf.csv   BMCC strike-zone diffs and confidence.
//     Rows are matched to pitches by time (the ball reaches the plate 0-3 s after the export's time).
//     "SZD-X n" / "SZD-Z n" are BMCC tracking camera n; a camera with no value all game isn't part of
//     the strike zone and is left out; "-" on a pitch = no data from that camera. Confidence 1 = PASS, 0 = FAIL.
//     The export stops at camera 12, so FullField 7 and 8 (13, 14) are filled with random values within ±0.003 for the demo.
// Still not available, shown as "No data": track length/quality, spin fit error, cloud states.
// Each row is treated as a valid Trackpac result (the export is produced from the processed track).
// Cameras, redundancy and timing aren't in a pitch export either: they come from the `healthy`
// sample (all cameras running), so the camera views have something to show.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) { console.error('usage: node scripts/convert-pitch-csv.mjs data/<sessionId>_pitch-data.csv'); process.exit(1); }
const sessionId = basename(file).split('_')[0];
if (!/^[\w.-]+$/.test(sessionId)) { console.error(`can't read a session ID from ${basename(file)}`); process.exit(1); }

// ---- CSV (quoted fields, "" escapes) ----
function parseLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
const head = parseLine(lines[0]).map((h) => h.trim());
const rows = lines.slice(1).map(parseLine).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim()])));
const num = (v) => (v === '' || v === undefined || isNaN(+v) ? undefined : +v);
const txt = (v) => (v === '' || v === 'Undefined' ? undefined : v);
const r2 = (v) => (v === undefined ? undefined : Math.round(v * 100) / 100);
const r3 = (v) => (v === undefined ? undefined : Math.round(v * 1000) / 1000 || 0);   // || 0 drops -0
const firstOf = (...names) => names.map((n) => join(dirname(file), n)).find((f) => existsSync(f));

// ---- ACS packets (one JSON object per line) ----
const acsFile = firstOf(`${sessionId}_acs_data.json`, 'acs_data.json');
const ACS_META = new Set(['packet_type', 'id', 'timestamp', 'publish_timestamp', 'venue_id', 'system']);
const acsById = new Map();
if (acsFile) {
  for (const line of readFileSync(acsFile, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { const p = JSON.parse(line); if (p.id) acsById.set(p.id, Object.keys(p).some((k) => !ACS_META.has(k))); } catch { /* skip a bad line */ }
  }
}

// ---- strike-zone diffs and confidence ----
const szFile = firstOf(`${sessionId}_sz_diffs_conf.csv`, 'sz_diffs_conf.csv');
let szRows = [], szCams = [];
if (szFile) {
  const sl = readFileSync(szFile, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const sh = parseLine(sl[0]).map((h) => h.trim());
  szRows = sl.slice(1).map(parseLine).map((r) => Object.fromEntries(sh.map((h, i) => [h, (r[i] ?? '').trim()])))
    .map((r) => ({ r, t: Date.parse(`${r.Date}T${r['Local Time']}Z`) })).filter((x) => !isNaN(x.t)).sort((a, b) => a.t - b.t);
  szCams = [...new Set(sh.map((h) => h.match(/^SZD-[XZ] (\d+)$/)?.[1]).filter(Boolean).map(Number))];
}
const healthyCams = JSON.parse(readFileSync(join(repo, 'public', 'data', 'healthy', 'cameras.json'), 'utf8'));
const camByTracking = new Map(healthyCams.filter((c) => c.bmccTrackingNumber).map((c) => [c.bmccTrackingNumber, c.id]));
const usedSz = new Set();
/** The strike-zone row for a pitch: the first unused row 0-3 s after the export's time. */
function szFor(timeMs) {
  const i = szRows.findIndex((x, k) => !usedSz.has(k) && x.t >= timeMs - 500 && x.t <= timeMs + 3000);
  if (i < 0) return undefined;
  usedSz.add(i);
  return szRows[i].r;
}

// ---- the session record ----
const dataDir = join(repo, 'data');
const sessions = readdirSync(dataDir).filter((f) => /sessions.*\.json$/i.test(f))
  .flatMap((f) => { const v = JSON.parse(readFileSync(join(dataDir, f), 'utf8')); return Array.isArray(v) ? v : v.sessions ?? []; });
const rec = sessions.find((s) => s.session?.id === sessionId);
if (!rec) console.warn(`[warn] no session ${sessionId} in data/*sessions*.json; using the CSV for the game's identity`);

// ---- pitches ----
const pitches = rows.map((r) => {
  const mph = num(r.RelSpeed), rpm = num(r.SpinRate);
  const inPlay = r.PitchCall === 'InPlay';
  const dist = num(r.Distance), tracked = num(r.LastTrackedDistance);
  const time = `${r.Date}T${r.Time}Z`;
  const sz = szFor(Date.parse(time));
  const conf = sz?.['Strike Zone Confidence Score'];
  const acs = !acsFile ? undefined : !acsById.has(r.PitchUID) ? 'fail' : acsById.get(r.PitchUID) ? 'success' : 'noswing';
  return {
    num: num(r.PitchNo),
    uid: txt(r.PitchUID),
    time,
    ...(conf === undefined || isNaN(+conf) ? {} : { confidenceOk: +conf >= 1 }),
    ...(acs ? { acs } : {}),
    ...(sz ? { strikeZone: Object.fromEntries(szCams.map((n) => {
      const x = num(sz[`SZD-X ${n}`]), z = num(sz[`SZD-Z ${n}`]);
      return [n, x === undefined || z === undefined ? null : { x: r3(x), z: r3(z) }];
    })) } : {}),
    hit: inPlay ? { trackPct: dist && tracked !== undefined ? Math.min(100, Math.round((tracked / dist) * 100)) : null, distanceFt: r2(dist) ?? null } : null,
    pp: {
      release: mph !== undefined ? { status: 'success', mph: r2(mph) } : { status: 'failed' },
      spin: rpm !== undefined ? { status: 'success', rpm: Math.round(rpm) } : { status: 'failed' },
      trackpac: { status: 'valid' },
    },
  };
}).filter((p) => p.num !== undefined).sort((a, b) => a.num - b.num);
if (!pitches.length) { console.error('no pitches in the CSV'); process.exit(1); }

// Demo fill: the strike-zone export stops at camera 12, so FullField 7 and 8 (tracking cameras 13
// and 14) get random X and Z within ±0.003 on every matched pitch (own fixed seed: same every run).
const SZ_FILL = [13, 14];
let fillSeed = [...sessionId].reduce((a, c) => (a * 37 + c.charCodeAt(0)) >>> 0, 11);
const fillRand = () => ((fillSeed = (fillSeed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const within = (m) => r3((fillRand() * 2 - 1) * m);
if (szFile) {
  for (const n of SZ_FILL) if (!szCams.includes(n)) szCams.push(n);
  for (const p of pitches) if (p.strikeZone) for (const n of SZ_FILL) if (p.strikeZone[n] === undefined) p.strikeZone[n] = { x: within(0.003), z: within(0.003) };
}

// strike zone: keep only cameras with a value somewhere in the game, keyed by camera id
const szLive = szCams.filter((n) => pitches.some((p) => p.strikeZone?.[n]));
for (const p of pitches) {
  if (!p.strikeZone) continue;
  p.strikeZone = Object.fromEntries(szLive.filter((n) => camByTracking.has(n)).map((n) => [camByTracking.get(n), p.strikeZone[n]]));
}

// ACS: no quality check yet, so mark a few swings for review (fixed seed: same picks every run)
let seed = [...sessionId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const swings = pitches.filter((p) => p.acs === 'success');
const review = [];
while (review.length < Math.min(3, swings.length)) { const p = swings[Math.floor(rand() * swings.length)]; if (!review.includes(p)) review.push(p); }
review.forEach((p) => { p.acs = 'review'; });

// ---- game ----
const last = Date.parse(pitches.at(-1).time);
const healthy = (f) => JSON.parse(readFileSync(join(repo, 'public', 'data', 'healthy', f), 'utf8'));
const hg = healthy('game.json');
const venue = rec ? [rec.venue?.name, rec.venue?.surface?.description].filter(Boolean).join(' · ') : rows[0].Stadium;
const game = {
  venue,
  gamePk: rec?.session?.mlbGamePk ?? num(rows[0].GameID) ?? null,
  sessionId,
  gameMode: 'LIVE',
  session: 'out',
  now: new Date(last + 16_000).toISOString(),     // just after the last pitch
  redundancy: hg.redundancy,                      // not in a pitch export: healthy sample
  timing: hg.timing,                              // not in a pitch export: healthy sample
  thresholds: hg.thresholds,
  // shared sample images until real mosaics / hit images are added
  defaultImages: Object.fromEntries(Object.entries(hg.defaultImages ?? {}).map(([k, v]) => [k, `/data/healthy/${v}`])),
  source: { file: basename(file), acs: acsFile && basename(acsFile), strikeZone: szFile && basename(szFile), rows: rows.length, teams: rec?.teams ? `${rec.teams.away?.name} @ ${rec.teams.home?.name}` : `${rows[0].AwayTeam} @ ${rows[0].HomeTeam}` },
};

const out = join(dataDir, sessionId);
mkdirSync(out, { recursive: true });
const write = (f, v) => writeFileSync(join(out, f), JSON.stringify(v, null, 2) + '\n');
write('game.json', game);
write('cameras.json', healthy('cameras.json'));
write('pitches.json', pitches);
if (!existsSync(join(out, 'status.json'))) write('status.json', []);
const hits = pitches.filter((p) => p.hit);
const count = (f) => pitches.filter(f).length;
console.log(`wrote ${out}: ${pitches.length} pitches (${hits.length} in play), ${game.source.teams}, GamePK ${game.gamePk}`);
console.log(acsFile ? `  ACS (${basename(acsFile)}): ${count((p) => p.acs === 'success')} success, ${count((p) => p.acs === 'noswing')} no swing, ${count((p) => p.acs === 'fail')} failed, review: pitches ${review.map((p) => p.num).join(', ')}` : '  ACS: no file, shown as No data');
console.log(szFile ? `  Strike zone (${basename(szFile)}): ${count((p) => p.strikeZone)} pitches matched; cameras ${szLive.map((n) => camByTracking.get(n)).join(', ')}; confidence ${count((p) => p.confidenceOk === true)} pass, ${count((p) => p.confidenceOk === false)} fail` : '  Strike zone: no file, shown as No data');
