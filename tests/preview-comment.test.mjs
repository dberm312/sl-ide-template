// scripts/preview-comment.mjs against a fake gh (fake-gh.mjs): branch URLs as
// the cloud encodes them, and one comment per PR through open, publish and
// close. Run with `pnpm test`.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const MARK = '<!-- sl-ide-preview -->';
const REPO = 'acme/deck';
const SLUG = 'my-deck';
const BASE = 'https://app.sl-ide.com';
const nfc = '\u00e9';  // é as one code point
const nfd = 'e\u0301'; // e + combining acute

// Pinned keys shared with cloud src/lib/branches.test.ts (cloud-C): the
// preview link must name the same /r/<key>/ the cloud serves.
const KEYS = [
  ['main', '6d61696e'],
  ['a/B', '612f42'],
  [nfc, 'c3a9'],
  [nfd, '65cc81'],
  ['función/Ñandú', '66756e6369c3b36e2fc391616e64c3ba'],
  ['dependabot/npm_and_yarn/next-16.4.0', Buffer.from('dependabot/npm_and_yarn/next-16.4.0').toString('hex')],
];

let dir;
let stateFile;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sl-ide-preview-'));
  fs.mkdirSync(path.join(dir, 'scripts'));
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.copyFileSync(path.join(root, 'scripts/preview-comment.mjs'), path.join(dir, 'scripts/preview-comment.mjs'));
  fs.writeFileSync(path.join(dir, 'sl-ide.config.json'), JSON.stringify({ slug: SLUG }));
  fs.writeFileSync(path.join(dir, 'bin/gh'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(root, 'tests/fake-gh.mjs')}" "$@"\n`, { mode: 0o755 });
  stateFile = path.join(dir, 'gh.json');
  setState({ prs: [], comments: [] });
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

function setState(s) {
  fs.writeFileSync(stateFile, JSON.stringify({ repo: REPO, nextId: 100, calls: [], ...s }));
}
const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
const marked = (pr) => state().comments.filter((c) => c.pr === pr && c.body.startsWith(MARK));

function run(args, env = {}) {
  return execFileSync(process.execPath, [path.join(dir, 'scripts/preview-comment.mjs'), ...args], {
    encoding: 'utf8',
    env: {
      ...process.env, PATH: `${path.join(dir, 'bin')}:${process.env.PATH}`, FAKE_GH_STATE: stateFile,
      GITHUB_REPOSITORY: REPO, SL_IDE_URL: '', ...env,
    },
  });
}

const version = (sha) => `${BASE}/d/${SLUG}/v/${sha}/`;
const link = (key) => `${BASE}/d/${SLUG}/r/${key}/`;

describe('branch URLs', () => {
  for (const [branch, key] of KEYS) {
    it(`links ${JSON.stringify(branch)} as /r/${key}/`, () => {
      setState({ prs: [{ number: 1, head: branch, state: 'open' }], comments: [] });
      run(['opened', '1']);
      const [comment] = marked(1);
      assert.ok(comment.body.includes(link(key)), comment.body);
      // The key decodes back to the exact branch: no case, slash or Unicode folding.
      assert.equal(Buffer.from(key, 'hex').toString('utf8'), branch);
    });
  }

  it('keeps case, slash and normalization variants on different links', () => {
    const branches = ['feature', 'Feature', 'a/b', 'a-b', 'a%2Fb', `caf${nfc}`, `caf${nfd}`];
    setState({ prs: branches.map((head, i) => ({ number: i + 1, head, state: 'open' })), comments: [] });
    const links = branches.map((b, i) => {
      run(['published', b, version('a'.repeat(40))]);
      return marked(i + 1)[0].body.match(/\*\* (\S+)/)[1];
    });
    assert.equal(new Set(links).size, branches.length);
  });

  it('links to the PDF beside the preview and to the exact version', () => {
    setState({ prs: [{ number: 7, head: 'review/Cover', state: 'open' }], comments: [] });
    const sha = '0123456789abcdef0123456789abcdef01234567';
    run(['published', 'review/Cover', version(sha)]);
    const { body } = marked(7)[0];
    const key = Buffer.from('review/Cover').toString('hex');
    assert.ok(body.includes(`[PDF](${link(key)}deck.pdf)`), body);
    assert.ok(body.includes(`[\`0123456\`](${version(sha)})`), body);
  });

  it('uses SL_IDE_URL, then the config url, without a doubled slash', () => {
    setState({ prs: [{ number: 1, head: 'main', state: 'open' }], comments: [] });
    run(['opened', '1'], { SL_IDE_URL: 'http://localhost:3000/' });
    assert.ok(marked(1)[0].body.includes('http://localhost:3000/d/my-deck/r/6d61696e/'));
    const config = path.join(dir, 'sl-ide.config.json');
    fs.writeFileSync(config, JSON.stringify({ slug: SLUG, url: 'https://cloud.example/' }));
    run(['opened', '1']);
    assert.ok(marked(1)[0].body.includes('https://cloud.example/d/my-deck/r/6d61696e/'));
  });
});

describe('comment lifecycle', () => {
  const branch = 'función/Ñandú';
  const key = '66756e6369c3b36e2fc391616e64c3ba';
  const others = [
    { id: 1, pr: 5, body: 'Looks good to me' },
    { id: 2, pr: 5, body: `Quoting the bot: ${MARK}` },
    { id: 3, pr: 6, body: `${MARK}\nAnother PR's preview` },
  ];

  it('keeps one comment through open, publishes, close and reopen', () => {
    setState({ prs: [{ number: 5, head: branch, state: 'open' }], comments: structuredClone(others) });

    run(['opened', '5']);
    let [c] = marked(5);
    assert.equal(marked(5).length, 1);
    assert.match(c.body, /once CI publishes it/);
    assert.ok(c.body.includes(link(key)));
    const id = c.id;

    for (const sha of ['1'.repeat(40), '2'.repeat(40)]) {
      run(['published', branch, version(sha)]);
      assert.deepEqual(marked(5).map((m) => m.id), [id]);
      assert.ok(marked(5)[0].body.includes(`[\`${sha.slice(0, 7)}\`](${version(sha)})`));
    }

    run(['closed', '5']);
    [c] = marked(5);
    assert.equal(c.id, id);
    assert.match(c.body, /closed, so its sl-ide cloud preview was taken down/);
    assert.ok(!c.body.includes(link(key)));

    run(['opened', '5']);
    assert.deepEqual(marked(5).map((m) => m.id), [id]);
    assert.match(marked(5)[0].body, /once CI publishes it/);

    // Other people's comments and other PRs are untouched throughout.
    assert.deepEqual(state().comments.filter((m) => m.id !== id), others);
  });

  it('posts on the first publish when the PR opened before the workflow existed', () => {
    setState({ prs: [{ number: 5, head: branch, state: 'open' }], comments: [] });
    run(['published', branch, version('3'.repeat(40))]);
    assert.equal(marked(5).length, 1);
  });

  it('does nothing for a branch without an open PR', () => {
    setState({ prs: [{ number: 5, head: branch, state: 'closed' }, { number: 6, head: 'other', state: 'open' }], comments: [] });
    run(['published', branch, version('4'.repeat(40))]);
    assert.deepEqual(state().comments, []);
  });

  it('does not post a taken-down comment on a PR that never had one', () => {
    setState({ prs: [{ number: 5, head: branch, state: 'closed' }], comments: structuredClone(others) });
    run(['closed', '5']);
    assert.deepEqual(state().comments, others);
  });

  it('removes a duplicate from two racing runs, keeping the oldest', () => {
    setState({
      prs: [{ number: 5, head: branch, state: 'open' }],
      comments: [
        { id: 10, pr: 5, body: `${MARK}\nfrom the opened run` },
        { id: 11, pr: 5, body: `${MARK}\nfrom the published run` },
        ...structuredClone(others),
      ],
    });
    run(['published', branch, version('5'.repeat(40))]);
    assert.deepEqual(marked(5).map((m) => m.id), [10]);
    assert.ok(marked(5)[0].body.includes(version('5'.repeat(40))));
    assert.equal(state().comments.length, 1 + others.length);
  });

  it('cleans up when another run posts between its check and its own post', () => {
    setState({ prs: [{ number: 5, head: branch, state: 'open' }], comments: [] });
    // The other run's comment appears as soon as this one has looked.
    const fake = path.join(dir, 'bin/gh');
    const real = fs.readFileSync(fake, 'utf8');
    fs.writeFileSync(fake, `#!/bin/sh
case "$*" in *" comment "*|"pr comment"*) "${process.execPath}" -e '
  const fs = require("fs"); const s = JSON.parse(fs.readFileSync(process.env.FAKE_GH_STATE));
  if (!s.raced) { s.raced = true; s.comments.push({ id: 1, pr: 5, body: "${MARK}\\nfrom the other run" }); fs.writeFileSync(process.env.FAKE_GH_STATE, JSON.stringify(s)); }';;
esac
${real.split('\n').slice(1).join('\n')}`, { mode: 0o755 });
    run(['opened', '5']);
    const left = marked(5);
    assert.deepEqual(left.map((m) => m.id), [1]);
    assert.match(left[0].body, /once CI publishes it/);
  });
});
