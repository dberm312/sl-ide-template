// A stand-in for the gh CLI, for preview-comment.test.mjs: just the commands
// scripts/preview-comment.mjs runs, against a JSON file of PRs and comments
// ($FAKE_GH_STATE). `-q` filters go through the real jq, as gh's would.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const file = process.env.FAKE_GH_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const save = () => fs.writeFileSync(file, JSON.stringify(state, null, 2));
const args = process.argv.slice(2);
state.calls.push(args);
save();

const flag = (name) => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
const fail = (msg) => { process.stderr.write(`gh: ${msg}\n`); process.exit(1); };
const out = (data) => {
  const q = flag('-q');
  // gh prints null as an empty line, where jq -r prints "null".
  const filter = `(${q}) | if . == null then "" else . end`;
  process.stdout.write(q ? execFileSync('jq', ['-r', filter], { input: JSON.stringify(data), encoding: 'utf8' }) : JSON.stringify(data));
};
const prOf = (n) => state.prs.find((p) => String(p.number) === String(n)) ?? fail(`no PR ${n}`);

if (flag('--repo') && flag('--repo') !== state.repo) fail(`wrong repo ${flag('--repo')}`);

if (args[0] === 'pr' && args[1] === 'view') {
  out({ headRefName: prOf(args[2]).head });
} else if (args[0] === 'pr' && args[1] === 'list') {
  out(state.prs.filter((p) => p.head === flag('--head') && p.state === flag('--state')).map((p) => ({ number: p.number })));
} else if (args[0] === 'pr' && args[1] === 'comment') {
  prOf(args[2]);
  state.comments.push({ id: state.nextId++, pr: Number(args[2]), body: flag('--body') });
  save();
} else if (args[0] === 'api') {
  const method = flag('-X') ?? 'GET';
  const endpoint = args.find((a) => a.startsWith('repos/'));
  const list = endpoint.match(/^repos\/(.+)\/issues\/(\d+)\/comments$/);
  const one = endpoint.match(/^repos\/(.+)\/issues\/comments\/(\d+)$/);
  if ((list ?? one)[1] !== state.repo) fail(`wrong repo in ${endpoint}`);
  if (method === 'GET' && list) {
    out(state.comments.filter((c) => c.pr === Number(list[2])).map(({ id, body }) => ({ id, body })));
  } else if (one) {
    const i = state.comments.findIndex((c) => c.id === Number(one[2]));
    if (i === -1) fail('HTTP 404: Not Found');
    if (method === 'PATCH') state.comments[i].body = flag('-f').replace(/^body=/, '');
    else if (method === 'DELETE') state.comments.splice(i, 1);
    else fail(`unsupported ${method}`);
    save();
  } else fail(`unsupported api call ${args.join(' ')}`);
} else {
  fail(`unsupported command ${args.join(' ')}`);
}
