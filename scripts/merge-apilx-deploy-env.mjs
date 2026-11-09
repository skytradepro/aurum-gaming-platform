import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, '.env'), 'utf8');
const destPath = resolve(root, 'deploy/.env');
let dest = readFileSync(destPath, 'utf8');

const keys = [
  'FOOTBALL_API_KEY',
  'FOOTBALL_LIVE_CACHE_SECONDS',
  'FOOTBALL_ODDS_MARGIN_PERCENT',
  'FOOTBALL_BOOKMAKER_ID',
  'FOOTBALL_ODDS_MAX_PAGES',
  'APILX_AGENT_ID',
  'APILX_PRAGMATIC_API_URL',
  'APILX_PRAGMATIC_TOKEN',
  'APILX_PRAGMATIC_SECRET',
  'APILX_AMATIC_API_URL',
  'APILX_AMATIC_TOKEN',
  'APILX_AMATIC_SECRET',
  'APILX_PGSOFT_API_URL',
  'APILX_PGSOFT_TOKEN',
  'APILX_PGSOFT_SECRET',
  'APILX_AMUSNET_API_URL',
  'APILX_AMUSNET_TOKEN',
  'APILX_AMUSNET_SECRET',
];

const lines = [];
for (const k of keys) {
  const m = src.match(new RegExp(`^${k}=(.*)$`, 'm'));
  if (!m) {
    if (k.startsWith('FOOTBALL_')) continue;
    throw new Error(`Missing ${k} in root .env`);
  }
  const v = m[1].trim();
  if (k === 'FOOTBALL_API_KEY' && !v) continue;
  lines.push(`${k}=${v}`);
}

for (const line of lines) {
  const k = line.split('=')[0];
  const re = new RegExp(`^${k}=.*$`, 'm');
  if (re.test(dest)) dest = dest.replace(re, line);
  else dest = `${dest.trimEnd()}\n${line}\n`;
}

if (!/^\n# API LX staging/m.test(dest)) {
  dest = dest.replace(/\n(APILX_AGENT_ID=)/, '\n# API LX staging (callbacks on https://hannibalgamer.fr/api/v1/apilx/wallet)\n$1');
}

writeFileSync(destPath, dest.endsWith('\n') ? dest : `${dest}\n`);
console.log('Updated deploy/.env with APILX_* (no values printed).');
