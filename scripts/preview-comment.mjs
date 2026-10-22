#!/usr/bin/env node
// Keep one comment on a branch's PR with its sl-ide cloud preview link.
//
//   node scripts/preview-comment.mjs opened  <pr>                  PR opened: the branch's link
//   node scripts/preview-comment.mjs published <branch> <version>  after a push publishes
//   node scripts/preview-comment.mjs closed  <pr>                  PR closed: link taken down
//
// CI runs it (publish.yml, unpublish.yml) with GH_TOKEN set; it needs the gh
// CLI. The comment is found by a hidden marker and edited in place, so a PR
// carries one comment however many pushes it gets (a duplicate from two runs
// racing is deleted, keeping the oldest). "published" does nothing
// when the branch has no open PR, and "closed" nothing when there's no
// comment to update.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARK = '<!-- sl-ide-preview -->';
const die = (msg) => { console.error(`preview-comment: ${msg}`); process.exit(1); };
const gh = (...args) => execFileSync('gh', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const repo = process.env.GITHUB_REPOSITORY || die('GITHUB_REPOSITORY is not set (runs in CI)');

const configPath = path.join(ROOT, 'sl-ide.config.json');
if (!fs.existsSync(configPath)) process.exit(0);
const { slug, url } = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const base = (process.env.SL_IDE_URL || url || 'https://app.sl-ide.com').replace(/\/$/, '');
// Same reversible encoding as cloud src/lib/branches.ts; never normalize case or slashes.
const branchKey = (b) => Buffer.from(b, 'utf8').toString('hex');
const branchUrl = (b) => `${base}/d/${slug}/r/${branchKey(b)}/`;

const [mode, arg, version] = process.argv.slice(2);
if (!arg) die(`usage: preview-comment.mjs opened|published|closed <pr|branch> [version]`);

let pr;
let body;
if (mode === 'opened') {
  pr = arg;
  const branch = gh('pr', 'view', pr, '--repo', repo, '--json', 'headRefName', '-q', '.headRefName');
  body = `**Preview on sl-ide cloud:** ${branchUrl(branch)}\n\nIt shows the latest push to \`${branch}\` once CI publishes it.`;
} else if (mode === 'published') {
  pr = gh('pr', 'list', '--repo', repo, '--head', arg, '--state', 'open', '--json', 'number', '-q', '.[0].number');
  if (!pr) process.exit(0);
  const link = branchUrl(arg);
  body = `**Preview on sl-ide cloud:** ${link}\n\n`
    + `Latest push: ${version ? `[\`${version.match(/\/v\/([0-9a-f]{7})/)?.[1] ?? 'this version'}\`](${version})` : 'published'}`
    + ` · [PDF](${link}deck.pdf) · updated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
} else if (mode === 'closed') {
  pr = arg;
  body = 'This PR is closed, so its sl-ide cloud preview was taken down. Its versions stay at their `/v/<sha>/` links for 30 days.';
} else {
  die(`unknown mode ${JSON.stringify(mode)}`);
}

// The PR's marked comments, oldest first. The "opened" and "published" runs
// belong to different workflow runs, so both can find none and each post one:
// keep the oldest and delete the rest, which another run may already have done.
const marked = () => gh('api', '--paginate', `repos/${repo}/issues/${pr}/comments`,
  '-q', `.[] | select(.body | startswith("${MARK}")) | .id`).split('\n').filter(Boolean);
const dedupe = (ids) => {
  for (const extra of ids.slice(1)) {
    try { gh('api', '-X', 'DELETE', `repos/${repo}/issues/comments/${extra}`); } catch { /* already gone */ }
  }
};
const text = `${MARK}\n${body}`;
const ids = marked();
if (ids.length) {
  gh('api', '-X', 'PATCH', `repos/${repo}/issues/comments/${ids[0]}`, '-f', `body=${text}`);
  dedupe(ids);
} else if (mode !== 'closed') {
  gh('pr', 'comment', pr, '--repo', repo, '--body', text);
  const after = marked();
  // Another run posted first: make the oldest comment say what this run says.
  if (after.length > 1) gh('api', '-X', 'PATCH', `repos/${repo}/issues/comments/${after[0]}`, '-f', `body=${text}`);
  dedupe(after);
}
console.log(`preview-comment: ${mode} -> PR #${pr}`);
