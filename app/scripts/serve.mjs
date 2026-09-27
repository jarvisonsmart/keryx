/**
 * Serve the exported PWA (dist/) for local E2E: `npm run preview` on
 * http://localhost:4173 (PORT overrides). Unknown paths fall back to
 * index.html, like GitHub Pages' single-page setup.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = join(import.meta.dirname, '..', 'dist');
const base = '/' + (process.env.EXPO_BASE_URL ?? '').split('/').filter(Boolean).join('/');
const port = Number(process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
};

createServer(async (req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://x').pathname;
  if (base !== '/' && !pathname.startsWith(base + '/')) {
    res.writeHead(302, { Location: base + '/' }).end();
    return;
  }
  const path = normalize(decodeURIComponent(base === '/' ? pathname : pathname.slice(base.length))).replace(/^(\.\.[/\\])+/, '');
  for (const file of [join(root, path), join(root, path, 'index.html'), ...(!extname(path) ? [join(root, 'index.html')] : [])]) {
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(body);
      return;
    } catch {
      // try the next candidate
    }
  }
  res.writeHead(404).end();
}).listen(port, () => console.log(`serving dist/ on http://localhost:${port}`));
