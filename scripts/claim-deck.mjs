#!/usr/bin/env node
// Claim this deck on sl-ide cloud after its owner's account was deleted
// (.github/workflows/claim-deck.yml). Whoever started the claim at
// <cloud>/claim/<slug> gets the deck: GitHub's OIDC token proves this run is
// in the deck's repo, and CODE, from that page, says who started it.
//
// Reads sl-ide.config.json { "slug" } (and "url" for another server).
// Needs CODE and the job's `id-token: write` permission; SL_IDE_URL
// overrides https://app.sl-ide.com.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const die = (msg) => { console.error(`claim-deck: ${msg}`); process.exit(1); };

const configPath = path.join(ROOT, 'sl-ide.config.json');
if (!fs.existsSync(configPath)) die('no sl-ide.config.json, so this deck has never been published');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { slug } = config;
if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(slug ?? '')) die(`"slug" must be lowercase letters, digits and dashes (got ${JSON.stringify(slug)})`);
const code = process.env.CODE?.trim();
if (!code) die(`CODE is not set; start a claim at <cloud>/claim/${slug} and run this workflow with its code`);
const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
if (!requestUrl || !requestToken) die('no GitHub Actions id-token; run this in the Claim deck workflow (it needs `permissions: id-token: write`)');
const base = (process.env.SL_IDE_URL || config.url || 'https://app.sl-ide.com').replace(/\/$/, '');

const tokenUrl = new URL(requestUrl);
tokenUrl.searchParams.set('audience', new URL(base).origin);
const issued = await fetch(tokenUrl, { headers: { Authorization: `Bearer ${requestToken}` } });
if (!issued.ok) die(`GitHub would not issue an id-token (${issued.status})`);
const { value } = await issued.json();

const res = await fetch(`${base}/api/claim/${slug}`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${value}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ code }),
});
const out = await res.json().catch(() => ({}));
if (!res.ok) die(`${base} refused the claim (${res.status}): ${out.error ?? 'no reason given'}`);
console.log(`claim-deck: "${slug}" now belongs to the account that started the claim. From that account, run \`pnpm create sl-ide token\` here to set a new SL_IDE_PUBLISH_TOKEN.`);
