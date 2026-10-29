import { test, expect } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));

// The slide lab board (SL-98, SL-99): takes load one module each, so a broken
// one shows its error without taking the others down; Focus flips through
// them by key; Send to agent writes .lab/feedback.json.
const TAKE_A = `import SlideShell from '../../components/SlideShell.jsx';
import { box } from '../../components/geometry.js';
import './ta.css';

const c = { title: 'Three checks catch layout faults before the PDF prints.' };

export default function TakeA({ pageNumber }) {
  return (
    <SlideShell title={c.title} pageNumber={pageNumber}>
      <div className="region ta-lead" style={box([0.5, 1.6, 12.33, 2])}>Clipped, spill, overlap.</div>
    </SlideShell>
  );
}
`;
const SESSION = `import * as Checks from '../../slides/ChecksSlide.jsx';

export default {
  slug: 'smoke', round: 1,
  brief: { title: 'Checks page', ask: 'make it bolder' },
  identity: 'Paper surface, ink text, one table.',
  mode: 'default',
  takes: [
    { id: 'ta', key: 'A', name: 'One line', axis: 'hierarchy', idea: 'The three names lead.', load: () => import('./TakeA.jsx') },
    { id: 'tb', key: 'B', name: 'Half written', axis: 'layout', idea: 'Not finished.', load: () => import('./TakeB.jsx') },
  ],
  reference: [{ id: 'now4', label: '4', name: 'Checks', Component: Checks.default }],
};
`;

test.describe('slide lab', () => {
  let dir, dev, url;
  test.beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'sl-ide-lab-'));
    await cp(root, dir, { recursive: true, filter: (src) => {
      const rel = path.relative(root, src);
      return !/^(node_modules|\.git|dist|output|\.lab|\.agents|\.claude)(\/|$)/.test(rel);
    } });
    await symlink(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
    const takes = path.join(dir, 'src/lab/takes');
    await writeFile(path.join(takes, 'index.js'), SESSION);
    await writeFile(path.join(takes, 'TakeA.jsx'), TAKE_A);
    await writeFile(path.join(takes, 'ta.css'), '.ta-lead { font-size: var(--title); font-weight: 700; }\n');
    await writeFile(path.join(takes, 'TakeB.jsx'), 'export default function TakeB() { return <div>\n');
    // Silent: the broken take's transform error is expected.
    dev = await createServer({ root: dir, configLoader: 'runner', logLevel: 'silent', server: { host: '127.0.0.1', port: 0 } });
    await dev.listen();
    url = `http://127.0.0.1:${dev.httpServer.address().port}/lab.html`;
  });
  test.afterAll(async () => {
    await dev?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  test('Focus flips through takes by key, isolates a broken take, and sends verdicts', async ({ page }) => {
    await page.goto(url);
    const side = page.locator('.lab-side');
    await expect(side.locator('h2')).toContainText('One line');
    await expect(side.locator('.lab-axis')).toHaveText('hierarchy');
    await expect(side.locator('.lab-health')).toContainText('fits');
    await expect(page.locator('.lab-identity')).toContainText('Holding: Paper surface');
    await expect(page.locator('.lab-stage .slide')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(side.locator('h2')).toContainText('Half written');
    await expect(page.locator('.lab-stage .lab-broken')).toContainText('TakeB.jsx');
    await expect(side.locator('.lab-health')).toContainText('BROKEN');
    // Its error shows in its place; Vite's overlay doesn't cover the board.
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);

    await page.keyboard.press('r');
    await expect(side.locator('h2')).toContainText('Today: Checks');
    await expect(page.locator('.lab-stage .slide')).toBeVisible();

    await page.keyboard.press('1');
    await page.keyboard.press('p');
    await expect(side.getByRole('button', { name: 'Pick' })).toHaveClass(/is-on/);
    await side.getByLabel('Notes on take A').fill('Keep the lead, add the table back.');
    // Typing in a note doesn't switch takes.
    await expect(side.locator('h2')).toContainText('One line');

    await page.locator('.lab-stage').click();
    await page.keyboard.press('g');
    await expect(page.locator('.lab-row')).toHaveCount(3);
    await expect(page.locator('.lab-row.is-pick')).toHaveCount(1);

    await page.getByRole('button', { name: 'Send to agent' }).click();
    await expect(page.locator('.lab-status')).toContainText('Sent');
    const fb = JSON.parse(await readFile(path.join(dir, '.lab/feedback.json'), 'utf8'));
    expect(fb.takes.map((t) => [t.id, t.axis, t.verdict])).toEqual([['ta', 'hierarchy', 'pick'], ['tb', 'layout', '']]);
    expect(fb.takes[0].note).toBe('Keep the lead, add the table back.');
    expect(fb.takes[1].health.flags[0]).toMatch(/^BROKEN\(/);
  });

  test('#audit=<id> loads only the named take, so a broken neighbour is no failure', async ({ page }) => {
    await page.goto(`${url}#audit=ta`);
    await expect(page.locator('#lab-audit')).toContainText(/ta\s+\d+\s+ok/);
    await expect(page.locator('#lab-audit')).not.toContainText('tb');
    await page.goto(`${url}#audit=zz`);
    await page.reload();
    await expect(page.locator('#lab-audit')).toContainText('UNKNOWN');
  });
});
