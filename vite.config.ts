import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, resolve, sep } from 'node:path';

/**
 * Serves the repo's git-ignored `data/` folder (local sample data for showing the POC) at /local-data/:
 *   /local-data/sessions.json   every data/*sessions*.json file, merged into one array
 *   /local-data/datasets.json   the data/ subfolders that hold a dataset (have a game.json)
 *   /local-data/<path>          any file under data/ (dataset JSON, images)
 *   /local-data/<image>?w=640   a smaller copy of an image (WebP, that width), made with sharp on
 *                               first request and cached in data/.thumbs/. Camera PNGs are 2-15 MB.
 * Dev server and `vite preview` only: nothing in data/ goes into a build.
 */
function localData(): Plugin {
  const root = resolve(__dirname, 'data');
  const TYPES: Record<string, string> = { '.json': 'application/json', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  const thumbs = join(root, '.thumbs');
  /** A cached, resized WebP copy of an image file. */
  const thumb = async (file: string, w: number): Promise<Buffer> => {
    const key = createHash('sha1').update(`${file}|${statSync(file).mtimeMs}|${w}`).digest('hex');
    const out = join(thumbs, `${key}.webp`);
    if (existsSync(out)) return readFileSync(out);
    const sharp = (await import('sharp')).default;
    const buf = await sharp(file).resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    mkdirSync(thumbs, { recursive: true });
    writeFileSync(out, buf);
    return buf;
  };
  const handle = (url: string, res: import('node:http').ServerResponse) => {
    const json = (v: unknown) => { res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store'); res.end(JSON.stringify(v)); };
    const notFound = () => { res.statusCode = 404; res.end('Not found'); };
    if (!existsSync(root)) return notFound();
    const path = decodeURIComponent(url.split('?')[0]);
    if (path === '/sessions.json') {
      const files = readdirSync(root).filter((f) => /sessions.*\.json$/i.test(f));
      if (!files.length) return notFound();
      return json(files.flatMap((f) => { const v = JSON.parse(readFileSync(join(root, f), 'utf8')); return Array.isArray(v) ? v : v.sessions ?? []; }));
    }
    if (path === '/datasets.json') {
      return json(readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory() && existsSync(join(root, d, 'game.json'))));
    }
    const file = resolve(root, '.' + path);
    if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return notFound();
    const w = Number(new URLSearchParams(url.split('?')[1] ?? '').get('w'));
    if (w && /\.(png|jpe?g|webp)$/i.test(file)) {
      thumb(file, Math.max(64, Math.min(4096, Math.round(w))))
        .then((buf) => { res.setHeader('Content-Type', 'image/webp'); res.setHeader('Cache-Control', 'max-age=86400'); res.end(buf); })
        .catch((e) => { res.statusCode = 500; res.end(String(e)); });
      return;
    }
    res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(readFileSync(file));
  };
  // returns nothing: a function returned from configureServer would be run as a late hook
  const mount = (server: { middlewares: { use: (p: string, fn: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void) => unknown } }): void => {
    server.middlewares.use('/local-data', (req, res) => handle(req.url ?? '/', res));
  };
  return { name: 'local-data', configureServer: mount, configurePreviewServer: mount };
}

export default defineConfig({ plugins: [react(), localData()], server: { port: 5173, open: true } });
