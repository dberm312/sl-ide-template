import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import slideShot from './scripts/slide-shot.js';
import { banner, lastPublish, linkSkills, publishLine, status } from './scripts/doctor.js';

// The getting-started banner under Vite's URLs on every `pnpm dev`: the full
// guide until setup is done (skills, PRODUCT.md, DESIGN.md), one line after,
// then the deck's last publish once gh answers (time-boxed, never blocking).
// Also serves the same checks to the dev bar's setup chip.
function slIde() {
  return {
    name: 'sl-ide',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      linkSkills(root);
      server.middlewares.use('/__sl-ide/status', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(status(root)));
      });
      // `pnpm check` finds this server through .sl-ide/dev.json and asks
      // /__sl-ide/root which checkout it serves before measuring it.
      const real = fs.realpathSync(root);
      server.middlewares.use('/__sl-ide/root', (_req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.end(real);
      });
      const devFile = path.join(root, '.sl-ide', 'dev.json');
      server.httpServer?.once('listening', () => {
        fs.mkdirSync(path.dirname(devFile), { recursive: true });
        fs.writeFileSync(devFile, `${JSON.stringify({ port: server.httpServer.address().port, pid: process.pid })}\n`);
      });
      server.httpServer?.once('close', () => {
        try {
          if (JSON.parse(fs.readFileSync(devFile, 'utf8')).pid === process.pid) fs.rmSync(devFile);
        } catch { /* already gone */ }
      });
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        const url = server.resolvedUrls?.local?.[0];
        console.log(banner(status(root), url));
        lastPublish(root).then((p) => { if (p) console.log(publishLine(p)); });
      };
    },
  };
}

const LAB_MAX_BODY = 256 * 1024;

// Only the lab page on this dev server may post (SL-76): browsers mark a
// cross-site fetch with Sec-Fetch-Site and Origin, and requiring a JSON body
// means a cross-site fetch must pass a CORS preflight first.
function labSameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function labReply(res, status, text) {
  res.statusCode = status;
  res.end(text);
}

// The slide lab (lab.html) posts verdicts and notes here; the agent reads
// them from .lab/feedback.json. Dev server only, so the build never sees it.
function labFeedback() {
  return {
    name: 'lab-feedback',
    apply: 'serve',
    configureServer(server) {
      const dir = path.resolve(server.config.root, '.lab');
      server.middlewares.use('/__lab/feedback', (req, res) => {
        if (req.method !== 'POST') return labReply(res, 405, '');
        if (!labSameOrigin(req)) return labReply(res, 403, 'cross-site request');
        const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
        if (type !== 'application/json') return labReply(res, 415, 'expected application/json');
        if (Number(req.headers['content-length']) > LAB_MAX_BODY) {
          res.setHeader('Connection', 'close');
          return labReply(res, 413, 'too large');
        }
        const chunks = [];
        let size = 0;
        let tooLarge = false;
        req.on('data', (chunk) => {
          if (tooLarge) return;
          size += chunk.length;
          if (size > LAB_MAX_BODY) {
            tooLarge = true;
            chunks.length = 0;
            res.setHeader('Connection', 'close');
            labReply(res, 413, 'too large');
            return;
          }
          chunks.push(chunk);
        });
        req.on('end', () => {
          if (tooLarge) return;
          let data;
          try {
            data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            return labReply(res, 400, 'bad json');
          }
          const round = data?.round;
          if (!Number.isInteger(round) || round < 0 || round > 9999) {
            return labReply(res, 400, 'round must be an integer from 0 to 9999');
          }
          const text = `${JSON.stringify(data, null, 2)}\n`;
          try {
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'feedback.json'), text);
            // One file per send as well, so earlier rounds stay readable.
            fs.writeFileSync(path.join(dir, `feedback-r${round}-${Date.now()}.json`), text);
          } catch (err) {
            return labReply(res, 500, `could not write .lab: ${err.code ?? err.message}`);
          }
          labReply(res, 200, 'ok');
        });
      });
    },
  };
}

// base './' keeps dist/ origin-agnostic so scripts/pdf.sh can print it from a
// throwaway localhost server without absolute-path 404s.
export default defineConfig({
  base: './',
  plugins: [react(), slIde(), labFeedback(), slideShot()],
  server: { watch: { ignored: ['**/.lab/**', '**/output/**'] } },
});
