import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import slideShot from './scripts/slide-shot.js';
import { banner, linkSkills, status } from './scripts/doctor.js';

// The getting-started banner under Vite's URLs on every `pnpm dev`: the full
// guide until setup is done (skills, PRODUCT.md, DESIGN.md), one line after.
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
      const printUrls = server.printUrls.bind(server);
      server.printUrls = () => {
        printUrls();
        const url = server.resolvedUrls?.local?.[0];
        console.log(banner(status(root), url));
      };
    },
  };
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
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'feedback.json'), `${JSON.stringify(data, null, 2)}\n`);
            // One file per send as well, so earlier rounds stay readable.
            fs.writeFileSync(path.join(dir, `feedback-r${data.round}-${Date.now()}.json`), `${JSON.stringify(data, null, 2)}\n`);
            res.end('ok');
          } catch {
            res.statusCode = 400;
            res.end('bad json');
          }
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
