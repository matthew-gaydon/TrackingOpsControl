// Generates the two built-in sample datasets:
//   public/data/demo     – the full error scenario the alert flows are demonstrated with
//   public/data/healthy  – everything at full health (the canvas's "All healthy" switch)
// Run: node scripts/make-demo-data.mjs
// Real data: copy a dataset folder, then replace the JSON (see DATA.md). You don't need this script for that.
import { mkdirSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

const CAL = {
  imageSize: [1044, 425],
  lines: [[160, 373, 1043, 74], [160, 373, 1043, 323], [907, 118, 1043, 100]],
  keyPoints: [
    { id: 'hp', label: 'Home plate', x: 160, y: 373 },
    { id: 'ul', label: 'Upper foul line', x: 600, y: 224 },
    { id: 'll', label: 'Lower foul line', x: 600, y: 348 },
    { id: 'md', label: 'Mound line', x: 907, y: 118 },
  ],
};
const BIO = [['Camera 15', 'BMCA15', 599], ['Camera 23', 'BMCA15', 598], ['Camera 16', 'BMCA16', 600], ['Camera 24', 'BMCA16', 600], ['Camera 17', 'BMCA17', 600], ['Camera 21', 'BMCA17', 599], ['Camera 18', 'BMCA18', 600], ['Camera 22', 'BMCA18', 600], ['Camera 19', 'BMCA19', 600], ['Camera 29', 'BMCA19', 600], ['Camera 20', 'BMCA20', 600], ['Camera 30', 'BMCA20', 599], ['BMCA25', 'BMCA25', 600], ['BMCA26', 'BMCA26', 600], ['BMCA27', 'BMCA27', 0], ['BMCA28', 'BMCA28', 600]];

const pad = (n, w = 2) => String(n).padStart(w, '0');
const bmccTime = (sec) => `${pad(Math.floor(sec / 3600) % 24)}-${pad(Math.floor(sec / 60) % 60)}-${pad(sec % 60)}.${pad(Math.floor((sec * 997) % 1000), 3)}`;
const clock = (sec) => `${pad(Math.floor(sec / 3600) % 24)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`;

function build(healthy) {
  const H = healthy;
  const cameras = [];
  for (let k = 1; k <= 6; k++) cameras.push({
    id: 'P' + k, group: 'pitchToPlate', number: k, bmccTrackingNumber: k, host: 'BMCA' + k,
    running: H || k !== 6, fps: H || k !== 6 ? 600 : 0,
    tracking: { multicamPresent: H || k !== 6, playerTracking: H || k !== 5 },
    calibration: CAL,
    lastBall: { strength: 7, perimeter: 62.4, area: 288, boxes: [{ x: 48, y: 280, size: 34 }, { x: 368, y: 186, size: 34 }] },
    antiwobble: !H && k === 1 ? { linesMatched: 11, linesTotal: 14, patchesMatched: 2, patchesTotal: 8 } : { linesMatched: 14, linesTotal: 14, patchesMatched: 8, patchesTotal: 8 },
  });
  for (let k = 1; k <= 8; k++) cameras.push({
    id: 'F' + k, group: 'fullField', number: k, bmccTrackingNumber: k + 6, host: 'BMCA' + (k + 6),
    running: true, fps: 600, tracking: { multicamPresent: true, playerTracking: true }, calibration: CAL,
    lastBall: { strength: 7, perimeter: 62.4, area: 288, boxes: [{ x: 48, y: 280, size: 34 }, { x: 368, y: 186, size: 34 }] },
    antiwobble: { linesMatched: 14, linesTotal: 14, patchesMatched: 8, patchesTotal: 8 },
  });
  BIO.forEach(([name, host, fps], i) => cameras.push({
    id: 'B' + (i + 1), group: 'biomechanics', number: i + 1, host, bmccName: name,
    running: H || fps > 0, fps: H ? 600 : fps, calibration: CAL,
  }));

  // 32 pitches, roughly 75 s apart, ending on six real BMCC results
  const real = [[96.4, 2519.6, 0.13], [98.1, 2551.8, 0.14], [98.0, 2535.3, 0.13], [80.9, 2343.4, 0.12], [98.5, 2580.3, 0.13], [97.6, 2564.7, 0.20]];
  const start = 4 * 3600 + 31 * 60 + 10; // 04:31:10
  const flagged = H ? {} : { 3: 'spin', 9: 'release', 14: 'spin', 15: 'trackpac', 21: 'spin', 24: 'spin' };
  const lowConf = H ? {} : { 18: 6.2, 9: 6.8 }; const noAcs = H ? {} : { 18: true, 22: true };
  const hits = { 2: 1, 7: 1, 11: 1, 16: 1, 20: 1, 27: 1, 29: 1, 31: 1 };
  const cloudFail = H ? {} : { '20:bat': 1, '11:pitcherBiomech': 1, '27:batterBiomech': 0 };
  const trackIds = cameras.filter((c) => c.group !== 'biomechanics').map((c) => c.id);
  const pitches = [];
  for (let i = 0; i < 32; i++) {
    const t = start + i * 75 + ((i * 13) % 20);
    const r = i >= 26 ? real[i - 26] : [88 + ((i * 7) % 11), 2280 + ((i * 53) % 320), +(0.09 + i * 0.0032 + ((i % 3) * 0.01)).toFixed(2)];
    const err = !H && i === 24 ? 0.27 : r[2];
    const f = flagged[i];
    const conf = i === 31 ? 8.57 : (lowConf[i] || +(7.6 + ((i * 13) % 14) / 10).toFixed(2));
    const strikeZone = {};
    trackIds.forEach((id, k) => {
      let d = ((i * 7 + k * 3) % 3) / 1000;
      if (!H && id === 'P6') d = null;                       // not running
      if (!H && id === 'F5' && (i === 13 || i === 14)) d = null; // missing while FullField 5 was down
      if (!H && id === 'F2' && i === 31) d = 0.007;           // out of tolerance on the latest pitch
      strikeZone[id] = d;
    });
    const tpStatus = f === 'trackpac' ? 'validation_failed' : (!H && i === 7) ? 'failed' : 'valid';
    const age = 31 - i;
    const tpCloud = tpStatus === 'failed' ? 'failed' : tpStatus === 'validation_failed' ? 'needs_validation' : age <= 1 ? 'successful' : 'uploaded';
    const cloudOf = (key, k) => {
      if (tpCloud !== 'uploaded') return 'queued';
      if (cloudFail[i + ':' + key] !== undefined) return 'failed';
      if (age === 2) return 'processing';
      if (age === 3) return k === 0 ? 'success' : 'processing';
      return 'success';
    };
    const hitTrack = i === 31 ? 100 : i === 16 && !H ? 62 : 88 + (i % 12);
    pitches.push({
      num: i + 1, time: bmccTime(t), confidence: conf,
      trackLength: i === 31 ? 10.0 : +('9.' + (4 + (i % 6))), trackQuality: i === 31 ? 5.91 : +((conf > 7 ? '6.' : '4.') + (i % 9)),
      acsDelivered: !noAcs[i],
      hit: hits[i] ? { trackPct: hitTrack, distanceFt: i === 31 ? 120.5 : 160 + ((i * 37) % 240) } : null,
      strikeZone,
      pp: {
        release: { status: f === 'release' ? 'failed' : 'success', mph: r[0] },
        spin: { status: f === 'spin' ? 'failed' : 'success', rpm: r[1], fitError: err },
        trackpac: { status: tpStatus },
      },
      cloud: { trackpac: tpCloud, bat: cloudOf('bat', 0), pitcherBiomech: cloudOf('pitcherBiomech', 1), batterBiomech: cloudOf('batterBiomech', 2) },
    });
  }
  const tOf = (n) => { const p = pitches[n - 1].time.split(/[-:.]/).map(Number); return p[0] * 3600 + p[1] * 60 + p[2]; };
  const now = tOf(32) + 16;

  const status = H ? [] : [
    { at: clock(start - 3600), level: 'Warning', source: 'BMCC', text: 'Writing to disk disabled: true' },
    { at: clock(tOf(14) - 20), clearedAt: clock(tOf(15) + 22), level: 'CRITICAL ERROR', source: 'BMCC', text: 'Cameras:: "11 Missing from multicam frames, ensure software is launched and running at full frame rate."' },
    { at: clock(now - 40), level: 'CRITICAL ERROR', source: 'BMCC', text: 'Cameras:: "6 Missing from multicam frames, ensure software is launched and running at full frame rate."' },
    { at: clock(now - 300), level: 'ERROR', source: 'BMCC', text: 'Monitored Cameras: BMCA27 — status red (not connected)' },
    { at: clock(now - 5), level: 'Warning', source: 'BMCA1', text: 'Antiwobble Consensus: "Not enough successful patches to do requested pose type, doing Pose 2 (Pitch, Yaw) instead"' },
    { at: clock(now - 2), level: 'ERROR', source: 'BMCA1', text: 'FullImage: "No threshold values could be found for baseball bat in model called model_objects_as_points_mudskipper_resnet34_baseball_bat_hwk6_75_trt7_dynamic. A default value of 0.15 is used."' },
    { at: clock(now), level: 'Warning', source: 'BMCC', text: 'Player tracking frame selection: "Not all cameras did player tracking on frame. Done on: 1 10 11 12 13 14 2 3 4 7 8 9 Not done on: 5 "', appearsAfterSec: 8 },
  ];

  const game = {
    venue: 'MSA_2027_KTXDiamond', gamePk: 823476, sessionId: 'fu0uhriq_2026-11-03', gameMode: 'LIVE',
    session: H ? 'in' : 'out', now: clock(now), date: '2026-11-04', // clock-only times: UTC date of `now`
    redundancy: { role: 'MAIN', btcConnected: true, bdsConnected: H, peers: 1 },
    timing: { latencyMs: 172, tssOffsetMs: H ? 4 : 18 },
    thresholds: { targetFps: 600, confidencePass: 7, strikeZoneTolerance: 0.005, spinFitErrorReview: 0.25, tssOffsetMaxMs: 10, latencyMaxMs: 400, hitTrackGoodPct: 85 },
    defaultImages: { live: 'images/default/live.jpg', tracking: 'images/default/tracking.png', mosaic: 'images/default/mosaic.jpg', still: 'images/default/still.jpg', spinStrip: 'images/default/spin-strip.png' },
  };
  return { game, cameras, pitches, status };
}

for (const [name, healthy] of [['demo', false], ['healthy', true]]) {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  const d = build(healthy);
  for (const [file, val] of Object.entries({ 'game.json': d.game, 'cameras.json': d.cameras, 'pitches.json': d.pitches, 'status.json': d.status })) {
    writeFileSync(join(dir, file), JSON.stringify(val, null, 2) + '\n');
  }
  if (name !== 'demo' && existsSync(join(root, 'demo', 'images')) && !existsSync(join(dir, 'images'))) cpSync(join(root, 'demo', 'images'), join(dir, 'images'), { recursive: true });
  console.log('wrote', dir);
}
writeFileSync(join(root, 'index.json'), JSON.stringify({ datasets: ['demo', 'healthy'], default: 'demo' }, null, 2) + '\n');
