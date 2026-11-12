// Stand-in Control live images for a converted session: one pitch's hit images, cleaned up.
//
//   node scripts/make-control-images.mjs data/<sessionId> [pitchNumber]
//
// Pitch exports have no live camera feed, so the Control view showed one static sample image for every
// camera. A hit image is the closest thing we have: a full camera frame with few graphics on it. For each
// PitchToPlate and FullField camera this takes that pitch's hit image (pitches.json images[cam].hit),
// paints out BMCA's text (the "LAST HIT CONTRIBUTION IMAGE" title top left and the contribution stats
// bottom left, pure green / red), and writes data/<sessionId>/control/<cam>.jpg; cameras.json points
// images.live at it. BMCA's calibration model (thin magenta lines) is lifted out of the image into
// <cam>-cal.png (its scattered dots are dropped and painted out), white on transparent and thickened to about 3 px, and becomes calibration.overlay (the app
// tints it and moves it when nudging); the sample lines are dropped, and the key points snap onto the model.
// Biomechanics cameras are left on the sample image. The small baked-in hit graphic is left as it is.
//
// Default pitch: 10 (the one picked for fu0uhriq). Run again after convert-pitch-csv.mjs, which rewrites
// cameras.json from the healthy sample.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import sharp from 'sharp';

const dir = process.argv[2];
const pitchNum = Number(process.argv[3] ?? 10);
if (!dir || !existsSync(join(dir, 'pitches.json'))) { console.error('usage: node scripts/make-control-images.mjs data/<sessionId> [pitchNumber]'); process.exit(1); }
const sessionId = basename(dir);
const dataRoot = join(dir, '..');
const OUT_W = 2048;

const pitches = JSON.parse(readFileSync(join(dir, 'pitches.json'), 'utf8'));
const cameras = JSON.parse(readFileSync(join(dir, 'cameras.json'), 'utf8'));
const pitch = pitches.find((p) => p.num === pitchNum);
if (!pitch) { console.error(`no pitch ${pitchNum} in ${dir}`); process.exit(1); }

// BMCA's text is pure green or pure red, drawn in fixed boxes (fractions of the frame).
const TEXT_BOXES = [[0, 0, 0.3, 0.045], [0, 0.78, 0.3, 1]]; // [x0, y0, x1, y1]: title top left, stats bottom left
const isText = (r, g, b) => (g > 170 && g - r > 70 && g - b > 70) || (r > 170 && r - g > 90 && r - b > 90);
// BMCA's calibration model is drawn in 1 px magenta (anti-aliased into the background).
const isModel = (r, g, b) => Math.min(r, b) - g > 60 && Math.abs(r - b) < 90;

/** Sets every pixel within `rad` of (x, y) in the mask. */
function stamp(mask, w, h, x, y, rad) {
  for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
    const xx = x + dx, yy = y + dy;
    if (dx * dx + dy * dy <= rad * rad + 1 && xx >= 0 && yy >= 0 && xx < w && yy < h) mask[yy * w + xx] = 1;
  }
}

/** The model's lines only: connected pieces (8-connected) at least `minSpan` px across. BMCA also scatters
 *  small dots over the field (8-15 px), which aren't part of a standard model, so those are dropped. */
function keepLines(mask, w, h, minSpan) {
  const out = new Uint8Array(w * h), seen = new Uint8Array(w * h), stack = new Int32Array(w * h), piece = [];
  let kept = 0;
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k] || seen[k]) continue;
    let sp = 0, x0 = w, x1 = -1, y0 = h, y1 = -1;
    stack[sp++] = k; seen[k] = 1; piece.length = 0;
    while (sp) {
      const q = stack[--sp], x = q % w, y = (q - x) / w;
      piece.push(q);
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, j = yy * w + xx;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
      }
    }
    if (Math.max(x1 - x0, y1 - y0) + 1 >= minSpan) { for (const q of piece) out[q] = 1; kept += piece.length; }
  }
  return { lines: out, kept };
}

/** Masks of BMCA's text (inside TEXT_BOXES only, empty when there's no text) and of the calibration model. */
function findGraphics(px, w, h, ch) {
  const text = new Uint8Array(w * h), model = new Uint8Array(w * h);
  let textHits = 0, modelHits = 0;
  for (const [fx0, fy0, fx1, fy1] of TEXT_BOXES) {
    const x0 = Math.floor(fx0 * w), y0 = Math.floor(fy0 * h), x1 = Math.ceil(fx1 * w), y1 = Math.ceil(fy1 * h);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * ch;
      if (isText(px[i], px[i + 1], px[i + 2])) { textHits++; stamp(text, w, h, x, y, 2); }
    }
  }
  if (textHits < 500) text.fill(0); // no BMCA text on this image
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    if (isModel(px[i], px[i + 1], px[i + 2])) { model[y * w + x] = 1; modelHits++; }
  }
  return { text, model, textHits: textHits >= 500 ? textHits : 0, modelHits };
}

/** Paints out the masked pixels: fills the mask from its edges inwards with the average of known neighbours. */
function inpaint(px, w, h, ch, mask) {
  let front = [];
  for (let k = 0; k < mask.length; k++) if (mask[k]) front.push(k);
  while (front.length) {
    const next = [], fill = [];
    for (const k of front) {
      const x = k % w, y = (k - x) / w;
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if ((dx || dy) && xx >= 0 && yy >= 0 && xx < w && yy < h && !mask[yy * w + xx]) {
          const i = (yy * w + xx) * ch; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
        }
      }
      if (n) fill.push([k, r / n, g / n, b / n]); else next.push(k);
    }
    if (!fill.length) break;
    for (const [k, r, g, b] of fill) { const i = k * ch; px[i] = r; px[i + 1] = g; px[i + 2] = b; mask[k] = 0; }
    front = next;
  }
}

const outDir = join(dir, 'control');
mkdirSync(outDir, { recursive: true });
const done = [];
for (const cam of cameras) {
  if (cam.group === 'biomechanics') continue;
  const src = pitch.images?.[cam.id]?.hit;
  if (!src?.startsWith('/local-data/')) { console.warn(`  ${cam.id}: no hit image on pitch ${pitchNum}, left as is`); continue; }
  const { data, info } = await sharp(join(dataRoot, src.slice('/local-data/'.length))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h, channels: ch } = info;
  const outH = Math.round(h * OUT_W / w);
  const { text, model, textHits } = findGraphics(data, w, h, ch);
  const { lines, kept } = keepLines(model, w, h, Math.round(24 * w / 4096));
  const hasModel = kept > 200;

  // Overlay: the model's lines (no dots), thickened so they come out about 3 px wide at OUT_W, as a white-on-transparent
  // mask (the app colours it). The base image loses the whole model (dots too) and the text.
  const clean = new Uint8Array(w * h);
  for (let k = 0; k < text.length; k++) if (text[k]) clean[k] = 1;
  if (hasModel) {
    const rad = Math.max(2, Math.round(1.5 * w / OUT_W));
    const thick = new Uint8Array(w * h);
    for (let k = 0; k < model.length; k++) if (model[k]) { const x = k % w, y = (k - x) / w; stamp(clean, w, h, x, y, 1); if (lines[k]) stamp(thick, w, h, x, y, rad); }
    const rgba = Buffer.alloc(w * h * 4);
    for (let k = 0; k < thick.length; k++) { rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = 255; rgba[k * 4 + 3] = thick[k] ? 255 : 0; }
    await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).resize(OUT_W, outH).png({ compressionLevel: 9 }).toFile(join(outDir, `${cam.id}-cal.png`));
  }
  inpaint(data, w, h, ch, clean);
  await sharp(data, { raw: { width: w, height: h, channels: ch } })
    .resize(OUT_W, outH).jpeg({ quality: 86, mozjpeg: true }).toFile(join(outDir, `${cam.id}.jpg`));

  cam.images = { ...(cam.images ?? {}), live: `/local-data/${sessionId}/control/${cam.id}.jpg` };
  if (cam.lastBall) delete cam.lastBall.boxes;
  const cal = cam.calibration;
  if (cal) {
    const [W, H] = cal.imageSize;
    const sx = OUT_W / W, sy = outH / H, r = Math.round;
    cal.imageSize = [OUT_W, outH];
    cal.keyPoints = cal.keyPoints.map((k) => ({ ...k, x: r(k.x * sx), y: r(k.y * sy) }));
    if (hasModel) {
      cal.overlay = `/local-data/${sessionId}/control/${cam.id}-cal.png`;
      cal.lines = [];
      // Key points snap to the nearest point on the model's lines, so each one sits on the overlay. They're generic
      // points on the model, not named field features.
      const pts = [];
      for (let k = 0; k < lines.length; k++) if (lines[k]) { const x = k % w; pts.push([x / w * OUT_W, (k - x) / w / h * outH]); }
      cal.keyPoints = cal.keyPoints.map((kp, i) => {
        let best = pts[0], bd = Infinity;
        for (const p of pts) { const d = (p[0] - kp.x) ** 2 + (p[1] - kp.y) ** 2; if (d < bd) { bd = d; best = p; } }
        return { id: kp.id, label: `Model point ${i + 1}`, x: r(best[0]), y: r(best[1]) };
      });
    } else {
      delete cal.overlay;
      cal.lines = cal.lines.map(([x1, y1, x2, y2]) => [r(x1 * sx), r(y1 * sy), r(x2 * sx), r(y2 * sy)]);
    }
  }
  done.push(`${cam.id}${textHits ? '' : ' (no text)'}${hasModel ? '' : ' (no model: sample lines)'}`);
}
writeFileSync(join(dir, 'cameras.json'), JSON.stringify(cameras, null, 2) + '\n');
console.log(`Control images from pitch ${pitchNum} -> ${outDir}: ${done.join(', ')}`);
