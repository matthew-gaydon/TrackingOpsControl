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
// What it doesn't give, so the dataset leaves it out and the app shows "No data":
//   track confidence/length/quality, ACS delivery, per-camera strike zone, spin fit error, cloud states.
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
  return {
    num: num(r.PitchNo),
    time: `${r.Date}T${r.Time}Z`,
    hit: inPlay ? { trackPct: dist && tracked !== undefined ? Math.min(100, Math.round((tracked / dist) * 100)) : null, distanceFt: r2(dist) ?? null } : null,
    pp: {
      release: mph !== undefined ? { status: 'success', mph: r2(mph) } : { status: 'failed' },
      spin: rpm !== undefined ? { status: 'success', rpm: Math.round(rpm) } : { status: 'failed' },
      trackpac: { status: 'valid' },
    },
    info: {
      pitcher: txt(r.Pitcher), pitcherTeam: txt(r.PitcherTeam), batter: txt(r.Batter), batterTeam: txt(r.BatterTeam),
      inning: num(r.Inning), half: txt(r['Top/Bottom']), outs: num(r.Outs), balls: num(r.Balls), strikes: num(r.Strikes),
      pitchType: txt(r.TaggedPitchType) ?? txt(r.AutoPitchType), call: txt(r.PitchCall), result: txt(r.PlayResult)?.trim() ?? txt(r.KorBB),
      exitSpeed: r2(num(r.ExitSpeed)), launchAngle: r2(num(r.Angle)),
    },
  };
}).filter((p) => p.num !== undefined).sort((a, b) => a.num - b.num);
if (!pitches.length) { console.error('no pitches in the CSV'); process.exit(1); }

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
  source: { file: basename(file), rows: rows.length, teams: rec?.teams ? `${rec.teams.away?.name} @ ${rec.teams.home?.name}` : `${rows[0].AwayTeam} @ ${rows[0].HomeTeam}` },
};

const out = join(dataDir, sessionId);
mkdirSync(out, { recursive: true });
const write = (f, v) => writeFileSync(join(out, f), JSON.stringify(v, null, 2) + '\n');
write('game.json', game);
write('cameras.json', healthy('cameras.json'));
write('pitches.json', pitches);
if (!existsSync(join(out, 'status.json'))) write('status.json', []);
const hits = pitches.filter((p) => p.hit);
console.log(`wrote ${out}: ${pitches.length} pitches (${hits.length} in play), ${game.source.teams}, GamePK ${game.gamePk}`);
