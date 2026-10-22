import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import slideShot from '../scripts/slide-shot.js';
import { CHROME_PATHS } from '../scripts/doctor.js';

const profiles = () => fs.readdirSync('/tmp').filter((name) => name.startsWith('slide-shot-'));

test('failed CDP setup cleans up, retries capture, and supports stop/restart', {
  skip: !CHROME_PATHS.some((path) => fs.existsSync(path)), timeout: 60000,
}, async () => {
  const originalWs = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  const ownedProfiles = new Set();
  const recordProfiles = () => {
    for (const name of profiles()) if (!before.has(name)) ownedProfiles.add(name);
  };
  const assertClean = () => {
    assert.deepEqual(profiles().filter((name) => !before.has(name)), []);
    const processes = execFileSync('ps', ['-axo', 'args='], { encoding: 'utf8' });
    for (const name of ownedProfiles) assert.equal(processes.includes(`/tmp/${name}`), false);
  };
  const before = new Set(profiles());
  let failSetup = true;
  let warn;
  const warned = new Promise((resolve) => { warn = resolve; });
  globalThis.WebSocket = class extends originalWs {
    send(data) {
      const message = JSON.parse(data);
      if (failSetup && message.method === 'Emulation.setDeviceMetricsOverride') {
        recordProfiles();
        failSetup = false;
        message.method = 'Injected.invalidCommand';
      }
      super.send(JSON.stringify(message));
    }
  };
  let plugin;
  let server;
  const start = async () => {
    plugin = slideShot();
    let shot;
    server = http.createServer((req, res) => {
      if (req.url.startsWith('/__shot')) return shot(req, res);
      res.end('<div id="root"><div class="slide" style="width:1280px;height:720px">Capture fixture</div></div>');
    });
    plugin.configureServer({
      httpServer: server, watcher: new EventEmitter(),
      middlewares: { use(_path, handler) { shot = handler; } },
      config: { logger: { warn, error() {} } },
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  };
  const stop = async () => {
    await plugin.buildEnd();
    await new Promise((resolve) => server.close(resolve));
    assertClean();
  };
  const capture = async () => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/__shot?i=0`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    recordProfiles();
    const png = Buffer.from(await response.arrayBuffer());
    assert.equal(png.readUInt32BE(16), 2560);
    assert.equal(png.readUInt32BE(20), 1440);
  };
  try {
    await start();
    assert.match(await warned, /Injected.invalidCommand/);
    assertClean();
    await capture();
    await stop();
    await start();
    await capture();
    await stop();
    // Hold setup at its HTTP discovery request while the dev server shuts down.
    let discovered;
    const discovery = new Promise((resolve) => { discovered = resolve; });
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    globalThis.fetch = async (...args) => {
      if (String(args[0]).endsWith('/json')) {
        recordProfiles();
        discovered();
        await held;
        return { json: async () => [] };
      }
      return originalFetch(...args);
    };
    await start();
    await discovery;
    const stopping = stop();
    release();
    await stopping;
  } finally {
    globalThis.WebSocket = originalWs;
    globalThis.fetch = originalFetch;
    await plugin?.buildEnd();
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
  }
});
