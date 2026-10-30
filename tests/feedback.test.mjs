import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scrub, settings, shipReport, flush } from '../scripts/feedback.mjs';
import { validateFeedback } from '../scripts/feedback-schema.mjs';
import vocab from '../scripts/feedback-vocab.json' with { type:'json' };
const script=fileURLToPath(new URL('../scripts/feedback.mjs',import.meta.url));
function deck(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'sl-feedback-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const dir of ['src/deck','src/slides','src/lab/takes']) fs.mkdirSync(path.join(root,dir),{recursive:true});
  fs.writeFileSync(path.join(root,'src/deck/content.js'),"export const META = {format: 'slides'}; // Northwind Helios retention ARR");
  fs.writeFileSync(path.join(root,'src/slides/Secret.jsx'),'Marigold turnover');
  fs.writeFileSync(path.join(root,'src/lab/takes/Test.jsx'),'Cobalt');
  fs.writeFileSync(path.join(root,'PRODUCT.md'),'Vanguard');
  fs.writeFileSync(path.join(root,'DESIGN.md'),'Cerulean');
  fs.writeFileSync(path.join(root,'README.md'),'Finchley');
  fs.writeFileSync(path.join(root,'sl-ide.config.json'),'{"slug":"confidential-pitch"}');
  return root;
}
const report=(root,extra={})=>({v:1,projectId:settings(root).projectId,kind:'manual',harness:'unknown',agent:'other',format:'slides',area:'table',element:'table',outcome:'worked_around',workaround:'split_content',touched:[],skill:'sl-ide-ship',mechanism:'Page frame padding leaves too little room for a wide table.',...extra});
const run=(root,args,env={})=>spawnSync(process.execPath,[script,...args],{cwd:root,env:{...process.env,SL_IDE_AGENT:'other',DO_NOT_TRACK:'',SL_IDE_FEEDBACK:'',SL_IDE_FEEDBACK_DEBUG:'1',...env},encoding:'utf8'});
const input=(root,r)=>{const file=path.join(root,'input.json');fs.writeFileSync(file,JSON.stringify(r));return file;};
const names=(root,dir)=>{try{return fs.readdirSync(path.join(root,'.sl-ide',dir));}catch{return[];}};
const hash=r=>createHash('sha256').update(JSON.stringify(r)).digest('hex');

test('missing consent stays off and each clone gets a stable random ID',t=>{
 const root=deck(t),a=settings(root);assert.equal(a.auto,false);assert.deepEqual(settings(root),a);assert.notEqual(settings(deck(t)).projectId,a.projectId);
});
test('harness-only text and fixed harness paths pass',t=>{
 const root=deck(t);assert.doesNotThrow(()=>scrub(report(root),root));
 assert.doesNotThrow(()=>scrub(report(root,{mechanism:'Changed scripts/pdf.sh to check fallback fonts.'}),root));
});
for (const word of ['Northwind','Helios','retention','Marigold','turnover','Cobalt','Vanguard','Cerulean','Finchley','confidential']) test(`scrubs deck word ${word}`,t=>{
 const root=deck(t);assert.throws(()=>scrub(report(root,{mechanism:`${word} needed a table.`}),root),/Deck words/);
 assert.throws(()=>scrub(report(root,{suggestion:`Use ${word} in the table.`}),root));
});
for (const mechanism of ['ARR needs work.','The ARR metric needs work.','Table has ４２ rows.','Table has 18 rows.','Use https://example.com.','Send to name@example.com.','Use /Users/alex/pitch.csv.','Use "launch" text.','Use `launch` text.','Use “launch” text.','Added Novelcorp to the table.','Table\u200b content.']) test(`rejects unsafe text ${mechanism}`,t=>{
 const root=deck(t);assert.throws(()=>scrub(report(root,{mechanism}),root));
});
test('schema rejects extra data at every level',t=>{
 const root=deck(t),r=report(root);
 for(const extra of [{slug:'secret'},{area:'not-real'},{touched:['src/slides/Secret.jsx']},{size:{rows:'18'}},{size:{client:'secret'}},{mechanism:'x'.repeat(281)}])assert.throws(()=>validateFeedback({...r,...extra}));
 const ship={...report(root),...shipReport(root,'AUDIT  1 pages  0 need attention\nPAGE WORDS STATUS TITLE\n1       4  ok                        Private title')};
 for(const key of ['area','element','outcome','workaround','touched','skill'])delete ship[key];
 assert.doesNotThrow(()=>validateFeedback(ship));
 assert.throws(()=>validateFeedback({...ship,added:{scripts:{'.northwind':1}}}));
 assert.throws(()=>validateFeedback({...ship,audit:{...ship.audit,CLIENT:1}}));
});
test('manual CLI requires approval and dry-run never queues or sends',t=>{
 const root=deck(t),r=report(root),file=input(root,r);
 let result=run(root,['send','--json',file,'--dry-run']); assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),r);assert.equal(names(root,'outbox').length,0);
 result=run(root,['send','--json',file]);assert.equal(result.status,1);assert.match(result.stderr,/Send\?/);assert.equal(names(root,'outbox').length,0);
 result=run(root,['send','--json',file,'--confirm',hash(r)]);assert.equal(result.status,0,result.stderr);assert.equal(names(root,'outbox').length,1);
});
test('two rejects remove text before the outbox, but never permit invalid structure',t=>{
 const root=deck(t),r=report(root,{mechanism:'Northwind needs a table.'}),file=input(root,r);
 let result=run(root,['send','--json',file,'--dry-run']);assert.equal(result.status,3);assert.equal(names(root,'outbox').length,0);
 result=run(root,['send','--json',file,'--dry-run']);assert.equal(result.status,0,result.stderr);
 const clean=JSON.parse(result.stdout);assert.equal(clean.mechanism,undefined);
 result=run(root,['send','--json',file,'--confirm',hash(clean)]);assert.equal(result.status,0,result.stderr);
 const body=fs.readFileSync(path.join(root,'.sl-ide/outbox',names(root,'outbox')[0]),'utf8');assert.doesNotMatch(body,/Northwind/);
 fs.writeFileSync(file,JSON.stringify({...r,area:'Northwind'}));
 for(let i=0;i<3;i++)assert.equal(run(root,['send','--json',file,'--dry-run']).status,1);
});
test('two rejects drop only the failing text field',t=>{
 const root=deck(t),suggestion='Give the table more room.',file=input(root,report(root,{mechanism:'Northwind needs a table.',suggestion}));
 assert.equal(run(root,['send','--json',file,'--dry-run']).status,3);
 const result=run(root,['send','--json',file,'--dry-run']);assert.equal(result.status,0,result.stderr);
 const clean=JSON.parse(result.stdout);assert.equal(clean.mechanism,undefined);assert.equal(clean.suggestion,suggestion);
 assert.match(result.stderr,/dropping mechanism/);assert.doesNotMatch(result.stderr,/dropping suggestion/);
});
test('auto off means no ship or struggle report, even when passed --auto',t=>{
 const root=deck(t),file=input(root,report(root,{kind:'struggle'}));
 for(const args of [['send','--auto','--json',file],['ship','--audit','absent']])assert.equal(run(root,args).status,0);
 assert.equal(names(root,'outbox').length,0);
 assert.equal(run(root,['on']).status,0);assert.equal(settings(root).auto,true);
 assert.equal(run(root,['send','--auto','--json',file]).status,0);assert.equal(names(root,'outbox').length,1);
 assert.equal(run(root,['off']).status,0);assert.equal(settings(root).auto,false);
});
test('offline queues, retry moves to sent, privacy overrides block all delivery',async t=>{
 const root=deck(t),config=settings(root),r=report(root);fs.mkdirSync(path.join(root,'.sl-ide/outbox'));
 const file=path.join(root,'.sl-ide/outbox/001-manual.json');fs.writeFileSync(file,JSON.stringify(r));
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 let attempts=0;globalThis.fetch=async()=>{attempts++;throw new Error('offline');};
 await flush(root,config,'http://local/api/feedback',{});assert.equal(attempts,1);assert.ok(fs.existsSync(file));
 globalThis.fetch=async(url,init)=>{attempts++;assert.deepEqual(JSON.parse(init.body),r);assert.equal(init.redirect,'error');return new Response('{"ok":true}');};
 for(const env of [{DO_NOT_TRACK:'1'},{SL_IDE_FEEDBACK:'0'},{SL_IDE_FEEDBACK_DEBUG:'1'}])await flush(root,config,'http://local/api/feedback',env);
 assert.equal(attempts,1);assert.ok(fs.existsSync(file));
 await flush(root,config,'http://local/api/feedback',{});assert.equal(attempts,2);assert.equal(names(root,'sent').length,1);assert.equal(names(root,'outbox').length,0);
});
test('a queued report is scrubbed again if the deck changes before retry',async t=>{
 const root=deck(t),r=report(root,{mechanism:'Frame needs assistance.'});fs.mkdirSync(path.join(root,'.sl-ide/outbox'));fs.writeFileSync(path.join(root,'.sl-ide/outbox/001-manual.json'),JSON.stringify(r));
 fs.appendFileSync(path.join(root,'PRODUCT.md'),' assistance');
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);globalThis.fetch=async()=>assert.fail('must not send');
 await flush(root,settings(root),'http://local',{});assert.equal(names(root,'outbox').length,1);
});
test('outbox drops oldest above twenty and never leaks rejected text',t=>{
 const root=deck(t),r=report(root),file=input(root,r);fs.mkdirSync(path.join(root,'.sl-ide/outbox'));
 for(let i=0;i<20;i++)fs.writeFileSync(path.join(root,`.sl-ide/outbox/000-${String(i).padStart(2,'0')}-manual.json`),JSON.stringify(r));
 const result=run(root,['send','--json',file,'--confirm',hash(r)]);assert.equal(result.status,0,result.stderr);
 assert.equal(names(root,'outbox').length,20);assert.ok(!names(root,'outbox').includes('000-00-manual.json'));
});
test('ship sends only audit flags, fixed drift paths and extension counts',t=>{
 const root=deck(t);const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 git('init','-q','-b','main');git('config','user.name','Test');git('config','user.email','test@example.com');
 fs.mkdirSync(path.join(root,'scripts'));fs.writeFileSync(path.join(root,'scripts/pdf.sh'),'before');
 fs.writeFileSync(path.join(root,'src/styles.css'),"/* sl-ide's own palette for the IDE chrome */\n--ide-ink: black");
 git('add','.');git('commit','-qm','base');git('update-ref','refs/remotes/upstream/main','HEAD');
 fs.writeFileSync(path.join(root,'scripts/pdf.sh'),'after');fs.writeFileSync(path.join(root,'scripts/Northwind.mjs'),'secret content');
 fs.writeFileSync(path.join(root,'scripts/Client.secret'),'secret');
 fs.appendFileSync(path.join(root,'src/styles.css'),'\n--ide-font: serif');
 const text='AUDIT  2 pages  1 need attention\nPAGE   WORDS  STATUS                    TITLE\n1        4  SPILL(+4px) WORDY(8>6)     Northwind OVERLAP(8)\n2        5  ok                        Helios CLIPPED(5)\n  1    RAGGED(3%)    Northwind RAGGED(9)';
 const r=shipReport(root,text);assert.equal(r.audit.SPILL,1);assert.equal(r.audit.WORDY,1);assert.equal(r.audit.OVERLAP,0);assert.equal(r.audit.CLIPPED,0);assert.equal(r.audit.RAGGED,1);
 assert.deepEqual(r.size,{pages:'1-5'});assert.deepEqual(r.added,{scripts:{'.other':1,'.mjs':1}});
 assert.ok(r.drift.includes('scripts/pdf.sh'));assert.ok(r.drift.includes('src/styles.css#part3'));assert.doesNotMatch(JSON.stringify(r),/Northwind|Helios|secret/);
 assert.throws(()=>shipReport(root,'measuring…'));assert.throws(()=>shipReport(root,'AUDIT  2 pages\nPAGE\n1 4 ok  title'));
});
