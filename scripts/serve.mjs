#!/usr/bin/env node
// Serve a built dist/ on 127.0.0.1, on a port the OS picks, so parallel
// worktrees never share one. Prints "listening on <port>" once bound.
// GET /__sl-ide/build answers buildId(dir), which render.mjs checks before
// measuring, so a run can only ever measure its own build.
//
//   node scripts/serve.mjs [dir=dist]
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
};

// The build's identity: where it lives plus its index.html, whose asset
// names carry Vite's content hashes.
export function buildId(dir) {
  const root = fs.realpathSync(dir);
  return createHash('sha256').update(root).update('\0').update(fs.readFileSync(path.join(root, 'index.html'))).digest('hex');
}

export function serve(dir) {
  const root = fs.realpathSync(dir);
  const id = buildId(root);
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__sl-ide/build') return res.end(id);
    let file = path.join(root, decodeURIComponent(url.pathname));
    if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); return res.end(); }
    if (fs.statSync(file, { throwIfNoEntry: false })?.isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
      res.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const server = await serve(process.argv[2] ?? 'dist');
  console.log(`listening on ${server.address().port}`);
}
