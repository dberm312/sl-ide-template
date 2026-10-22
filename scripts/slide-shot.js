import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { CHROME_PATHS } from './doctor.js';

// Dev-server endpoint behind the slide rail's "Copy slide as image":
//   GET /__shot?i=<index>  ->  image/png of that page at 2x
// It renders the #print route in headless Chrome — the same render scripts/pdf.sh
// prints and shots.sh captures — rather than redrawing the page in the
// browser, since DOM-to-canvas libraries drop layout (floats, zoom) and a
// dense page came out overflowing its footer. One Chrome is started with the
// dev server and kept for its life, with #print loaded. A saved edit marks the
// page stale and reloads it in the background, so a copy is just a screenshot.
// Every call to Chrome has a timeout; a failure throws the Chrome away and the
// next copy starts a fresh one, so one bad capture can't block the rest.

const CALL_TIMEOUT_MS = 15000;

const CHROME = CHROME_PATHS.find((p) => fs.existsSync(p));

function startChrome() {
  return new Promise((resolve, reject) => {
    const proc = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0',
      `--user-data-dir=${fs.mkdtempSync('/tmp/slide-shot-')}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m) resolve({ proc, browserWs: m[1] });
    });
    proc.on('exit', () => reject(new Error(`chrome exited: ${err.slice(-300)}`)));
  });
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
  };
  ws.onclose = () => {
    for (const p of pending.values()) p.reject(new Error('chrome connection closed'));
    pending.clear();
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1;
    const mine = id;
    const timer = setTimeout(() => {
      pending.delete(mine);
      reject(new Error(`${method} timed out`));
    }, CALL_TIMEOUT_MS);
    pending.set(mine, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    ws.send(JSON.stringify({ id: mine, method, params }));
  });
  return { ws, send };
}

export default function slideShot() {
  let chrome = null; // { proc, page } once started
  let stale = true; // #print needs (re)loading before the next capture
  let closed = false; // the dev server shut down (or restarted): start nothing
  let shutdown = () => {};
  let queue = Promise.resolve();
  const enqueue = (job) => {
    const run = queue.then(job);
    queue = run.catch(() => {});
    return run;
  };

  function reset() {
    chrome?.proc.kill();
    chrome = null;
    stale = true;
  }

  async function page() {
    if (chrome && chrome.proc.exitCode === null) return chrome.page;
    reset();
    if (closed) throw new Error('dev server closed');
    const { proc, browserWs } = await startChrome();
    if (closed) {
      proc.kill();
      throw new Error('dev server closed');
    }
    const port = new URL(browserWs).port;
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const p = await connect(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await p.send('Emulation.setDeviceMetricsOverride', {
      width: 1280, height: 800, deviceScaleFactor: 2, mobile: false,
    });
    chrome = { proc, page: p };
    return p;
  }

  // Load #print fresh. about:blank first, since navigating to the URL the tab
  // is already on only changes the hash and would not reload anything.
  async function load(origin) {
    const p = await page();
    stale = false;
    await p.send('Page.navigate', { url: 'about:blank' });
    await p.send('Page.navigate', { url: `${origin}/#print` });
  }

  // Wait for the deck to mount and its web fonts to land, then measure the
  // page rather than assuming the stacking arithmetic.
  async function measure(p, index) {
    for (let tries = 0; tries < 200; tries += 1) {
      // Mid-navigation the page's context can vanish under the call; retry.
      const { result } = await p.send('Runtime.evaluate', {
        expression: `document.fonts.ready.then(() => {
          const el = document.querySelectorAll('#root > .slide')[${index}];
          if (!el || location.hash !== '#print') return null;
          const r = el.getBoundingClientRect();
          return JSON.stringify({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height });
        })`,
        awaitPromise: true, returnByValue: true,
      }).catch((err) => {
        if (/timed out|closed/.test(err.message)) throw err;
        return {};
      });
      if (result?.value) return JSON.parse(result.value);
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`page ${index} did not render`);
  }

  async function shoot(origin, index) {
    if (stale) await load(origin);
    const p = await page();
    const rect = await measure(p, index);
    const { data } = await p.send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: rect.x, y: rect.y, width: rect.w, height: rect.h, scale: 1 },
    });
    return Buffer.from(data, 'base64');
  }

  return {
    name: 'slide-shot',
    apply: 'serve',
    configureServer(server) {
      let origin = null;
      let reloadTimer = null;
      const warm = () => enqueue(() => (origin && stale ? load(origin) : null))
        .catch((err) => { reset(); server.config.logger.warn(`[slide-shot] warm-up: ${err.message}`); });

      server.httpServer?.once('listening', () => {
        const { port } = server.httpServer.address();
        origin = `http://localhost:${port}`;
        if (CHROME) warm();
      });
      // A saved edit makes the loaded page stale; reload it once saving settles.
      server.watcher.on('all', (_event, file) => {
        if (file.includes('/node_modules/') || file.includes('/.lab/') || file.includes('/output/')) return;
        stale = true;
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(warm, 400);
      });

      server.middlewares.use('/__shot', (req, res) => {
        const url = new URL(req.url, 'http://x');
        const index = Number(url.searchParams.get('i'));
        if (!CHROME || !Number.isInteger(index) || index < 0) {
          res.statusCode = CHROME ? 400 : 501;
          res.end(CHROME ? 'bad page index' : 'no Chrome found');
          return;
        }
        origin = `http://${req.headers.host}`;
        // One capture at a time: they share the one tab.
        enqueue(() => shoot(origin, index)).then((png) => {
          res.setHeader('Content-Type', 'image/png');
          res.setHeader('Cache-Control', 'no-store');
          res.end(png);
        }, (err) => {
          reset();
          server.config.logger.error(`[slide-shot] ${err.message}`);
          res.statusCode = 500;
          res.end(err.message);
        });
      });
      shutdown = () => {
        closed = true;
        clearTimeout(reloadTimer);
        reset();
      };
    },
    // Runs when the dev server closes or restarts (httpServer's 'close' can
    // wait on open sockets and come too late, leaving a Chrome behind).
    buildEnd() {
      shutdown();
    },
  };
}
