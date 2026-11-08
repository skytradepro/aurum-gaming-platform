#!/usr/bin/env node
/**
 * Copies batch21 cover art and patches API settings + i18n + admin toggles.
 * Run from repo root: node scripts/apply-batch21.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = path.join(process.env.USERPROFILE ?? '', '.cursor', 'projects', 'c-Users-PC-Desktop-aurum-gaming-platform', 'assets');
const mediaDir = path.join(root, 'apps', 'web', 'public', 'media', 'games');

const manifestPath = path.join(root, 'packages', 'shared', 'src', 'batch21-slots.ts');
const manifestSrc = fs.readFileSync(manifestPath, 'utf8');
const idRe = /id: '([^']+)'/g;
const titleRe = /title: (?:"((?:\\"|[^"])*)"|'((?:\\'|[^'])*)')/g;
const assetRe = /assetFile: '([^']+)'/g;
const ids = [...manifestSrc.matchAll(idRe)].map((m) => m[1]);
const titles = [...manifestSrc.matchAll(titleRe)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'"));
const assets = [...manifestSrc.matchAll(assetRe)].map((m) => m[1]);
const slots = ids.map((id, i) => ({ id, title: titles[i], assetFile: assets[i] }));

if (slots.length !== 21) {
  console.error(`Expected 21 slots in manifest, got ${slots.length}`);
  process.exit(1);
}

for (const s of slots) {
  const src = path.join(assetsDir, s.assetFile);
  const dst = path.join(mediaDir, `${s.id}-cover.jpg`);
  if (!fs.existsSync(src)) {
    console.error('Missing asset:', src);
    process.exit(1);
  }
  fs.copyFileSync(src, dst);
  console.log('cover', s.id);
}

function patchSettings() {
  const file = path.join(root, 'apps', 'api', 'src', 'services', 'settings.ts');
  let text = fs.readFileSync(file, 'utf8');
  const marker = '  /** Sports betting on real football matches.';
  const defs = slots.map((s) => `  game_${s.id}_enabled: { type: 'boolean', default: true },`).join('\n');
  if (text.includes('game_amigomonkeys_enabled')) {
    console.log('settings definitions already patched');
  } else {
    text = text.replace(marker, `${defs}\n${marker}`);
  }
  const ifaceMarker = '  sports_enabled: boolean;';
  const ifaceLines = slots.map((s) => `  game_${s.id}_enabled: boolean;`).join('\n');
  if (text.includes('game_amigomonkeys_enabled: boolean')) {
    console.log('settings interface already patched');
  } else {
    text = text.replace(ifaceMarker, `${ifaceLines}\n${ifaceMarker}`);
  }
  fs.writeFileSync(file, text);
}

function patchI18n(locale) {
  const file = path.join(root, 'packages', 'i18n', 'messages', `${locale}.json`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const g = json.games;
  for (const s of slots) {
    if (locale === 'ar') {
      g[`${s.id}Title`] = s.title.replace(/^HANNIBAL /, 'حنبعل · ');
      g[`${s.id}Subtitle`] = 'سلوت خطوط من حنبعل — نفس الرياضيات الموثوقة مع غلاف التصميم الجديد.';
      g[`${s.id}Tile`] = 'حنبعل · أوريجinals';
    } else {
      g[`${s.id}Title`] = s.title;
      g[`${s.id}Subtitle`] = 'Hannibal Originals line slot — same trusted math, branded lobby art.';
      g[`${s.id}Tile`] = 'Hannibal Originals';
    }
  }
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log('i18n', locale);
}

function patchAdminForm() {
  const file = path.join(root, 'apps', 'web', 'src', 'components', 'admin', 'GameRulesForm.tsx');
  let text = fs.readFileSync(file, 'utf8');
  if (text.includes('game_amigomonkeys_enabled')) {
    console.log('admin form already patched');
    return;
  }
  const ifaceMarker = '  game_teenpatti_enabled: boolean;';
  const iface = slots.map((s) => `  game_${s.id}_enabled: boolean;`).join('\n');
  text = text.replace(ifaceMarker, `${ifaceMarker}\n${iface}`);

  const toggleMarker = "  ['game_teenpatti_enabled', 'teenpatti'],\n] as const;";
  const toggles = slots.map((s) => `  ['game_${s.id}_enabled', '${s.id}'],`).join('\n');
  text = text.replace(toggleMarker, `  ['game_teenpatti_enabled', 'teenpatti'],\n${toggles}\n] as const;`);
  fs.writeFileSync(file, text);
}

function patchPushMinimal() {
  const file = path.join(root, 'deploy', 'push-minimal.ps1');
  let text = fs.readFileSync(file, 'utf8');
  const ids = slots.map((s) => `"${s.id}"`).join(', ');
  text = text.replace(
    /\$GameIds = @\([^)]+\)/,
    `$GameIds = @("cherryparty", "luckybell", "powerhot", "goldencoins", "extracrown", "hannibal", ${ids})`,
  );
  fs.writeFileSync(file, text);
  console.log('push-minimal GameIds updated');
}

patchSettings();
for (const loc of ['en', 'fr', 'ar', 'tr', 'ru']) patchI18n(loc);
patchAdminForm();
patchPushMinimal();
console.log('BATCH21_APPLY_DONE');
