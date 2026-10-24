#!/usr/bin/env node
// Time CI stages without changing their exit status or hiding their output.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const [stage, command, ...args] = process.argv.slice(2);
if (!stage || !command) throw new Error('usage: node scripts/timed.mjs <stage> <command> [args...]');
const start = performance.now();
const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
const ms = Math.round(performance.now() - start);
console.log(JSON.stringify({ event: 'sl-ide.ci', stage, ms, ok: result.status === 0 }));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${stage}: ${(ms / 1000).toFixed(2)} s${result.status === 0 ? '' : ' (failed)'}\n`);
if (result.error) console.error(result.error.message);
if (result.signal) process.kill(process.pid, result.signal);
else process.exitCode = result.status ?? 1;
