import { test, expect } from '@playwright/test';
import { cp, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));

// One Playwright file per format (editor-*.spec.js), so the two run in
// parallel workers.
export function editorSuite(format) {
  test.describe(format, () => {
    let dir, dev, built, devUrl, builtUrl, pdf;
    test.beforeAll(async ({ browser }) => {
      dir = await mkdtemp(path.join(tmpdir(), 'sl-ide-smoke-'));
      await cp(root, dir, { recursive: true, filter: (src) => {
        const rel = path.relative(root, src);
        return !/^(node_modules|\.git|dist|output|\.agents|\.claude)(\/|$)/.test(rel);
      } });
      await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
      if (format === 'memo') {
        await promisify(execFile)(process.execPath, ['scripts/use-format.mjs', 'memo'], { cwd: dir });
        expect((await readdir(path.join(dir, 'src/deck/pages'))).sort()).toEqual(['files.js', 'memo.js']);
      }
      // The runner loader avoids writing Vite's bundled config through the
      // node_modules symlink. Mutable files stay in this disposable project.
      dev = await createServer({ root: dir, configLoader: 'runner', server: { host: '127.0.0.1', port: 0 } });
      await dev.listen();
      devUrl = `http://127.0.0.1:${dev.httpServer.address().port}`;
      // createServer sets NODE_ENV=development in this process. Build in a
      // separate production process so import.meta.env.DEV is compiled false.
      await promisify(execFile)(process.execPath, [
        path.join(root, 'node_modules/vite/bin/vite.js'),
        'build', '--configLoader', 'runner', '--logLevel', 'warn',
      ], { cwd: dir, env: { ...process.env, NODE_ENV: 'production' } });
      built = await preview({ root: dir, configLoader: 'runner', preview: { host: '127.0.0.1', port: 0 } });
      builtUrl = `http://127.0.0.1:${built.httpServer.address().port}`;
      const page = await browser.newPage();
      try {
        await page.goto(`${builtUrl}/#print`);
        await expect(page.locator('#root > .slide').first()).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        await writeFile(path.join(dir, 'dist/deck.pdf'), pdf);
      } finally { await page.close(); }
    });
    test.afterAll(async () => {
      await dev?.close();
      if (built) {
        built.httpServer.closeAllConnections();
        await new Promise((resolve, reject) => built.httpServer.close((e) => e ? reject(e) : resolve()));
      }
      if (dir) await rm(dir, { recursive: true, force: true });
    });

    test('editor navigation, comment clipboard and real PNG capture', async ({ page, context }) => {
      await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: devUrl });
      await page.goto(devUrl);
      const cells = page.locator('.rail-cell');
      await expect(cells.first()).toBeVisible();
      expect(await cells.count()).toBeGreaterThan(1);
      await cells.nth(1).click();
      await expect(cells.nth(1)).toHaveClass(/is-on/);
      await page.keyboard.press('k');
      await expect(cells.first()).toHaveClass(/is-on/);
      await page.keyboard.press('s');
      await expect(page.locator('.sorter-cell').first()).toBeVisible();
      await page.locator('.sorter-cell').first().click();
      await expect(cells.first()).toBeVisible();
      await page.keyboard.press('c');
      const heading = page.locator('#root > .slide').first().locator('h1, h2').first();
      const text = await heading.innerText();
      await heading.click();
      await page.locator('.inspector-pop textarea').fill('Smoke check: clarify this heading.');
      await page.getByRole('button', { name: /^Copy/ }).click();
      const note = await page.evaluate(() => navigator.clipboard.readText());
      expect(note).toContain('Element:');
      expect(note).toContain(text);
      expect(note).toContain('Comment: Smoke check: clarify this heading.');
      await page.keyboard.press('Escape');
      await expect(page.locator('body')).not.toHaveClass(/is-commenting/);
      await cells.first().click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Copy slide as image' }).click();
      await expect(page.getByRole('menuitem', { name: 'Copied', exact: true })).toBeVisible({ timeout: 30_000 });
      const image = await page.evaluate(async () => {
        const items = await navigator.clipboard.read();
        const blob = await items[0].getType('image/png');
        const bitmap = await createImageBitmap(blob);
        return { type: blob.type, size: blob.size, width: bitmap.width, height: bitmap.height };
      });
      expect(image.type).toBe('image/png');
      expect(image.size).toBeGreaterThan(1000);
      expect([image.width, image.height]).toEqual(format === 'slides' ? [2560, 1440] : [1632, 2112]);
    });

    test('viewer navigation, page-preserving live reload and built PDF download', async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${devUrl}/#view/2`);
      await expect(page.locator('.vw-count')).toContainText('2 /');
      // A memo lays its pages out again once the fonts load; a key pressed
      // before then turns to a page that then moves.
      await page.evaluate(() => document.fonts.ready);
      await page.keyboard.press('ArrowRight');
      await expect(page).toHaveURL(/#view\/3$/);
      await page.keyboard.press('Home');
      await expect(page).toHaveURL(/#view\/1$/);
      await page.getByRole('button', { name: 'Next page (→)', exact: true }).click();
      await expect(page).toHaveURL(/#view\/2$/);
      await page.keyboard.press('g');
      await page.locator('.vw-cell').nth(2).click();
      await expect(page).toHaveURL(/#view\/3$/);
      // A number then Enter jumps to that page.
      await page.keyboard.type('1');
      await expect(page.locator('.vw-count')).toContainText('Go to 1');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#view\/1$/);
      await page.keyboard.type('3');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/#view\/3$/);
      // Page copy lives outside content.js. Editing that module must update
      // the visible page without losing the viewer's position.
      const module = path.join(dir, 'src/deck/pages', format === 'slides' ? 'anatomy.js' : 'files.js');
      const copy = await readFile(module, 'utf8');
      await writeFile(module, copy.replace(/title:\s*(['"])(.*?)\1/, "title: 'Page module reload verified'"));
      try {
        await expect(page.locator('.vw-stage').getByRole('heading', { name: 'Page module reload verified', exact: true })).toBeVisible();
        await expect(page).toHaveURL(/#view\/3$/);
      } finally { await writeFile(module, copy); }
      // Change a source file, then require a fresh load of the changed deck.
      const content = path.join(dir, 'src/deck/content.js');
      const original = await readFile(content, 'utf8');
      await writeFile(content, original.replace(/deckTitle:\s*(['"])(.*?)\1/, "deckTitle: 'Smoke reload verified'"));
      try {
        await expect(page).toHaveTitle('Smoke reload verified');
        await expect(page).toHaveURL(/#view\/3$/);
        const html = path.join(dir, 'index.html');
        const navigation = page.waitForEvent('load');
        await writeFile(html, (await readFile(html, 'utf8')) + '\n<!-- smoke full reload -->\n');
        await navigation;
        await expect(page).toHaveTitle('Smoke reload verified');
        await expect(page.locator('.vw-count')).toContainText('3 /');
        await expect(page).toHaveURL(/#view\/3$/);
      } finally { await writeFile(content, original); }
      await page.goto(builtUrl);
      await expect(page.locator('.viewer')).toBeVisible();
      await expect(page.locator('.devbar')).toHaveCount(0);
      const downloaded = page.waitForEvent('download');
      await page.getByRole('link', { name: 'Download PDF' }).click();
      const download = await downloaded;
      expect(download.suggestedFilename()).toMatch(/\.pdf$/);
      expect(await readFile(await download.path())).toEqual(pdf);
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(errors).toEqual([]);
    });
  });
}
