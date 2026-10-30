#!/usr/bin/env node
// Anonymous harness feedback. No dependencies, shell execution or content imports.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline/promises';
import vocab from './feedback-vocab.json' with { type: 'json' };
import { validateFeedback } from './feedback-schema.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const tokens = s => (s.normalize('NFKC').toLowerCase().match(/\p{L}[\p{L}\p{M}]*/gu) ?? []).filter(w => w.length >= 4);
const read = file => { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } };
const git = (root, args) => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','ignore'] }).trim(); } catch { return ''; } };
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function files(root, relative) {
  const full = path.join(root, relative);
  try {
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) return [];
    return stat.isDirectory() ? fs.readdirSync(full).flatMap(f => files(root, path.join(relative, f))) : [relative];
  } catch { return []; }
}
export function scrub(report, root) {
  validateFeedback(report);
  const common = read(path.join(scriptDir, 'feedback-common-words.txt')).split('\n').filter(w => w && !w.startsWith('#'));
  const chrome = read(path.join(root, 'src/styles.css')).split("sl-ide's own palette for the IDE chrome")[1] ?? '';
  // Only fixed harness names and chrome token names are allowed, never deck tokens.
  const names = vocab.harnessPaths.flatMap(p => [p, path.basename(p)]).join(' ');
  const allowed = new Set([...common, ...tokens(JSON.stringify(vocab)), ...tokens(names), ...tokens((chrome.match(/--[\w-]+/g) ?? []).join(' '))]);
  const sources = ['src/deck','src/slides','src/lab/takes','PRODUCT.md','DESIGN.md','README.md','sl-ide.config.json'];
  const deckWords = new Set(sources.flatMap(p => files(root,p)).flatMap(p => tokens(read(path.join(root,p)))).filter(w => !allowed.has(w)));
  for (const field of ['mechanism','suggestion']) {
    const text = report[field];
    if (!text) continue;
    const bad = tokens(text).filter(w => deckWords.has(w));
    if (bad.length) throw new Error(`Deck words in ${field}: ${[...new Set(bad)].join(', ')}`);
    // Also reject invented proper names that aren't present in the deck sources.
    for (const match of text.matchAll(/\b[A-Z][A-Za-z]+\b/g)) {
      const prefix = text.slice(0, match.index).trimEnd();
      const start = !prefix || /[.!?]$/.test(prefix);
      if ((!start || /^[A-Z]{2,}$/.test(match[0])) && !allowed.has(match[0].toLowerCase())) throw new Error(`Capitalized word in ${field}: ${match[0]}`);
    }
  }
  return report;
}
export function settings(root) {
  const dir = path.join(root,'.sl-ide');
  fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const file = path.join(dir,'feedback.json');
  if (!fs.existsSync(file)) {
    try { fs.writeFileSync(file,JSON.stringify({version:1,auto:false,projectId:`fb_${randomUUID()}`},null,2)+'\n',{mode:0o600,flag:'wx'}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  const value = JSON.parse(read(file));
  if (value.version !== 1 || typeof value.auto !== 'boolean' || !/^fb_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.projectId)) throw new Error('Invalid .sl-ide/feedback.json');
  return value;
}
function baseline(root) {
  return git(root,['merge-base','HEAD','upstream/main']);
}
function base(root, config) {
  const env = process.env;
  const agent = vocab.agent.includes(env.SL_IDE_AGENT) ? env.SL_IDE_AGENT : env.CLAUDECODE ? 'claude-code' : env.CODEX_THREAD_ID ? 'codex' : env.CURSOR_TRACE_ID ? 'cursor' : 'other';
  const content = read(path.join(root,'src/deck/content.js'));
  return {v:1,projectId:config.projectId,harness:baseline(root).slice(0,12)||'unknown',agent,format:/\bformat\s*:\s*['"]memo['"]/.test(content)?'memo':'slides'};
}
export function shipReport(root, auditText, note) {
  const head = /^AUDIT {2}(\d+) pages[^\n]*/m.exec(auditText);
  if (!head || Number(head[1]) < 1) throw new Error('Expected saved, completed audit output');
  const pages = Number(head[1]);
  const lines = auditText.slice(head.index).split('\n');
  const rows = lines.slice(2,2+pages);
  if (rows.length !== pages || rows.some(l => !/^\S+\s+\d+\s+/.test(l))) throw new Error('Incomplete audit rows');
  const audit = Object.fromEntries(vocab.audit.map(code => [code,0]));
  // Do not scan page titles or ragged text: either could contain audit code words.
  for (const row of rows) {
    const status = row.match(/^\S+\s+\d+\s+(.*?)\s{2,}/)?.[1] ?? '';
    for (const code of vocab.audit.slice(0,4)) if (new RegExp(`\\b${code}\\(`).test(status)) audit[code]++;
  }
  audit.LONG = /\bLONG\(/.test(head[0])?1:0;
  for (const row of lines.slice(2+pages)) for (const code of ['RAGGED','RUNT']) if (new RegExp(`^  \\S+\\s+${code}\\(`).test(row)) audit[code]++;
  const ancestor = baseline(root);
  // No baseline means unknown drift, never compare against a guessed deck commit.
  const changed = ancestor ? git(root,['diff','--name-only',ancestor,'--']).split('\n') : [];
  const drift = vocab.harnessPaths.filter(p => p !== 'src/styles.css#part3' && changed.includes(p));
  if (ancestor && changed.includes('src/styles.css')) {
    const marker = "sl-ide's own palette for the IDE chrome";
    const before = git(root,['show',`${ancestor}:src/styles.css`]).split(marker)[1]??'';
    const after = read(path.join(root,'src/styles.css')).split(marker)[1]??'';
    if (before !== after) drift.push('src/styles.css#part3');
  }
  const added = {};
  if (ancestor) {
    const original = new Set(git(root,['ls-tree','-r','--name-only',ancestor]).split('\n'));
    for (const group of vocab.added) for (const file of files(root,group)) {
      if (original.has(file)) continue;
      const suffix = path.extname(file).toLowerCase();
      const ext = vocab.extensions.includes(suffix)?suffix:'.other';
      added[group] ??= {}; added[group][ext] = (added[group][ext]??0)+1;
    }
  }
  return {kind:'ship',size:{pages:pages<=5?'1-5':pages<=15?'6-15':'16+'},audit,drift,added,...(note?{mechanism:note}:{})};
}
function privacyBlock(env) {
  return env.DO_NOT_TRACK === '1' ? 'DO_NOT_TRACK=1 blocks feedback delivery.' : env.SL_IDE_FEEDBACK === '0' ? 'SL_IDE_FEEDBACK=0 blocks feedback delivery.' : null;
}
const queued = root => files(root,'.sl-ide/outbox').filter(p=>p.endsWith('.json')).sort();
export async function flush(root, config, endpoint, env=process.env) {
  const block = privacyBlock(env);
  if (block) { console.error(block); return; }
  for (const file of queued(root)) {
    let report;
    try { report = scrub(JSON.parse(read(path.join(root,file))),root); } catch { continue; }
    if (!config.auto && report.kind !== 'manual') continue;
    if (env.SL_IDE_FEEDBACK_DEBUG === '1') { console.error(JSON.stringify(report,null,2)); continue; }
    try {
      const response = await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(report),signal:AbortSignal.timeout(5000),redirect:'error'});
      if (!response.ok) { if (response.status >= 500 || response.status === 429) break; continue; }
      fs.mkdirSync(path.join(root,'.sl-ide/sent'),{recursive:true});
      fs.renameSync(path.join(root,file),path.join(root,'.sl-ide/sent',path.basename(file)));
    } catch { break; } // Offline: retain the outbox, do not fail the caller.
  }
}
function cleanReport(report,root) {
  // Only scrub rejects count toward text removal; invalid enums never get through.
  const structured = {...report}; delete structured.mechanism; delete structured.suggestion;
  validateFeedback(structured);
  const rejectsFile = path.join(root,'.sl-ide/rejects.json');
  let rejects; try { rejects=JSON.parse(read(rejectsFile)); } catch { rejects={}; }
  const key = digest(structured);
  try { return scrub(report,root); } catch (error) {
    rejects[key]=(rejects[key]??0)+1;
    fs.writeFileSync(rejectsFile,JSON.stringify(rejects),{mode:0o600});
    if (rejects[key]<2) { error.scrub=true; throw error; }
    // Drop only the text fields that fail on their own; a clean field survives.
    const kept={...structured};
    for (const field of ['mechanism','suggestion']) {
      if (report[field]===undefined) continue;
      try { scrub({...structured,[field]:report[field]},root); kept[field]=report[field]; }
      catch { console.error(`Two scrub rejects: dropping ${field}.`); }
    }
    return scrub(kept,root);
  }
}
export async function main(args=process.argv.slice(2),root=process.cwd()) {
  const {positionals,values:o}=parseArgs({args,allowPositionals:true,options:{json:{type:'string'},audit:{type:'string'},note:{type:'string'},'dry-run':{type:'boolean'},auto:{type:'boolean'},confirm:{type:'string'}}});
  const command=positionals[0]??'status';
  if (!['on','off','status','log','send','ship'].includes(command)) throw new Error('Usage: pnpm feedback on|off|status|log|send --json <file>|ship --audit <file>');
  const config=settings(root);
  const endpoint=`${(process.env.SL_IDE_URL??'https://app.sl-ide.com').replace(/\/$/,'')}/api/feedback`;
  if (command==='on'||command==='off') {
    config.auto=command==='on';
    fs.writeFileSync(path.join(root,'.sl-ide/feedback.json'),JSON.stringify(config,null,2)+'\n',{mode:0o600});
    console.log(`Automatic feedback ${config.auto?'on':'off'}.`);
    if (command==='off') return;
  }
  if (command==='status') console.log(`Auto: ${config.auto?'on':'off'}\nProject: ${config.projectId}\nOutbox: ${queued(root).length}\nEndpoint: ${endpoint}`);
  if (command==='log') for (const dir of ['outbox','sent']) for (const file of files(root,`.sl-ide/${dir}`).filter(f=>f.endsWith('.json')).sort()) console.log(`${file}\n${read(path.join(root,file))}`);
  if (command==='send'||command==='ship') {
    if ((command==='ship'||o.auto)&&!config.auto) return;
    let input;
    if (command==='ship') { if (!o.audit) throw new Error('ship needs --audit <file>'); input=shipReport(root,read(path.resolve(root,o.audit)),o.note); }
    else { if (!o.json) throw new Error('send needs --json <file>'); input=JSON.parse(fs.readFileSync(path.resolve(root,o.json),'utf8')); }
    if (o.auto && input.kind !== 'struggle') throw new Error('--auto accepts struggle reports only');
    if (command==='send'&&!o.auto&&input.kind!=='manual') throw new Error('User-started reports must have kind manual');
    const report=cleanReport({...input,...base(root,config)},root);
    if (o['dry-run']) { console.log(JSON.stringify(report,null,2)); console.error(`Preview digest: ${digest(report)}`); return; }
    if (report.kind==='manual') {
      console.log(JSON.stringify(report,null,2));
      if (o.confirm!==digest(report)) {
        if (!process.stdin.isTTY) throw new Error('Preview with --dry-run, ask "Send?", then pass --confirm <preview digest> after approval.');
        const rl=createInterface({input:process.stdin,output:process.stdout});
        try { if (!/^y(?:es)?$/i.test((await rl.question('Send? [y/N] ')).trim())) return; } finally { rl.close(); }
      }
    }
    const dir=path.join(root,'.sl-ide/outbox'); fs.mkdirSync(dir,{recursive:true});
    const file=`${Date.now()}-${randomUUID()}-${report.kind}.json`;
    fs.writeFileSync(path.join(dir,file),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
    for (const stale of queued(root).slice(0,-20)) fs.unlinkSync(path.join(root,stale));
  }
  // One delivery process at a time. A crash only delays retries until this lock
  // is stale; report files are written before the lock is acquired.
  const lock=path.join(root,'.sl-ide/delivery.lock');
  try { if (fs.existsSync(lock)&&Date.now()-fs.statSync(lock).mtimeMs>120000) fs.rmdirSync(lock); fs.mkdirSync(lock); } catch { return; }
  try { await flush(root,config,endpoint); } finally { fs.rmdirSync(lock); }
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{ console.error(error.message); process.exitCode=error.scrub?3:1; });
}
