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

function startChrome(owner) {
  owner.profile = fs.mkdtempSync('/tmp/slide-shot-');
  return new Promise((resolve, reject) => {
    const proc = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=0',
      `--user-data-dir=${owner.profile}`, 'about:blank',
    ], { stdio: ['ignore', 'ignore', 'pipe'] });
    owner.proc = proc;
    owner.exited = new Promise((done) => {
      proc.once('exit', done);
      proc.once('error', () => {
        if (!proc.pid) done(); // spawn failure: there is no process to wait for
      });
    });
    const timer = setTimeout(() => reject(new Error('chrome startup timed out')), CALL_TIMEOUT_MS);
    const finish = (err, url) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(url);
    };
    let err = '';
    proc.stderr.on('data', (d) => {
      err += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m) finish(null, m[1]);
    });
    proc.once('error', (error) => finish(error));
    proc.once('exit', () => finish(new Error(`chrome exited: ${err.slice(-300)}`)));
  });
}

async function connect(url, owner) {
  const ws = new WebSocket(url);
  owner.ws = ws;
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('chrome connection timed out')), CALL_TIMEOUT_MS);
    ws.onopen = () => { clearTimeout(timer); res(); };
    ws.onerror = () => { clearTimeout(timer); rej(new Error('chrome connection failed')); };
    ws.onclose = () => { clearTimeout(timer); rej(new Error('chrome connection closed')); };
  });
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
    try {
      ws.send(JSON.stringify({ id: mine, method, params }));
    } catch (err) {
      pending.delete(mine);
      clearTimeout(timer);
      reject(err);
    }
  });
  return { ws, send };
}

export default function slideShot() {
  let chrome = null; // { proc, page } once started
  let stale = true; // #print needs (re)loading before the next capture
  let closed = false; // the dev server shut down (or restarted): start nothing
  let shutdown = async () => {};
  let queue = Promise.resolve();
  const enqueue = (job) => {
    const run = queue.then(job).catch(async (err) => {
      await reset();
      throw err;
    });
    queue = run.catch(() => {});
    return run;
  };

  async function reset() {
    const owned = chrome;
    chrome = null;
    stale = true;
    if (!owned) return;
    owned.ws?.close();
    if (owned.proc) {
      owned.proc.kill();
      const force = setTimeout(() => owned.proc.kill('SIGKILL'), 1000);
      await owned.exited;
      clearTimeout(force);
    }
    if (owned.profile) fs.rmSync(owned.profile, { recursive: true, force: true });
  }

  async function page() {
    if (chrome?.page && chrome.proc.exitCode === null) return chrome.page;
    await reset();
    if (closed) throw new Error('dev server closed');
    const owned = {};
    chrome = owned; // Own the process and profile throughout setup, not only after CDP succeeds.
    try {
      const browserWs = await startChrome(owned);
      if (closed) throw new Error('dev server closed');
      const port = new URL(browserWs).port;
      const tabs = await (await fetch(`http://127.0.0.1:${port}/json`, {
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      })).json();
      if (closed) throw new Error('dev server closed');
      const p = await connect(tabs.find((t) => t.type === 'page').webSocketDebuggerUrl, owned);
      if (closed) throw new Error('dev server closed');
      await p.send('Emulation.setDeviceMetricsOverride', {
        width: 1280, height: 800, deviceScaleFactor: 2, mobile: false,
      });
      owned.page = p;
      return p;
    } catch (err) {
      await reset();
      throw err;
    }
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
        .catch((err) => { server.config.logger.warn(`[slide-shot] warm-up: ${err.message}`); });

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
          server.config.logger.error(`[slide-shot] ${err.message}`);
          res.statusCode = 500;
          res.end(err.message);
        });
      });
      shutdown = async () => {
        closed = true;
        clearTimeout(reloadTimer);
        await reset();
        await queue;
      };
    },
    // Runs when the dev server closes or restarts (httpServer's 'close' can
    // wait on open sockets and come too late, leaving a Chrome behind).
    buildEnd() {
      return shutdown();
    },
  };
}
