#!/usr/bin/env node
// A stand-in for `claude -p` and `codex exec` in tests/agent-bench.test.mjs.
// FAKE_AGENT_MODE: good (edits page 2's title), commit, styles, capped, error.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const codex = args[0] === 'exec';
const dir = codex ? args[args.indexOf('-C') + 1] : process.cwd();
const mode = process.env.FAKE_AGENT_MODE ?? 'good';
const file = path.join(dir, 'src/deck/content.js');
const s = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, s.replace("title: 'Three steps take this starter to your first real deck'", "title: 'Three steps to your first real deck'"));
if (mode === 'styles') fs.appendFileSync(path.join(dir, 'src/styles.css'), '\n/* bench */\n');
if (mode === 'commit') execFileSync('git', ['-c', 'user.name=a', '-c', 'user.email=a@b', 'commit', '-qam', 'agent'], { cwd: dir });
const say = (e) => console.log(JSON.stringify(e));
if (codex) {
  say({ type: 'thread.started' });
  say({ type: 'item.completed', item: { type: 'command_execution', command: 'cat src/deck/content.js' } });
  say({ type: 'item.completed', item: { type: 'file_change' } });
  say({ type: 'item.completed', item: { type: 'command_execution', command: 'pnpm run audit' } });
  if (mode === 'error') say({ type: 'turn.failed', error: { message: 'agent execution failed' } });
  else say({ type: 'turn.completed', usage: { input_tokens: 1000, output_tokens: 200 } });
} else {
  say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: {} }, { type: 'tool_use', name: 'Read', input: {} }] } });
  say({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: {} }, { type: 'tool_use', name: 'Bash', input: { command: 'pnpm check 2' } }] } });
  say({ type: 'result', subtype: mode === 'error' ? 'error_during_execution' : mode === 'capped' ? 'error_max_turns' : 'success', is_error: mode === 'capped' || mode === 'error',
    num_turns: 3, total_cost_usd: 0.12, usage: { input_tokens: 900, output_tokens: 100 } });
}
if (mode === 'error') process.exitCode = 1;
