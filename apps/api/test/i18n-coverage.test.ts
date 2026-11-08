import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { LOCALES, errorMessageKey, validationMessageKey } from '@aurum/i18n';
import { flatten, loadCatalogs } from '@aurum/i18n/check';
import { ERROR_STATUS } from '@aurum/shared';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const catalogs = loadCatalogs(join(root, 'packages/i18n/messages'));

function sourceFiles(directory: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

describe('every message the API can send a player exists in every language', () => {
  const flat = Object.fromEntries(LOCALES.map((locale) => [locale, flatten(catalogs[locale] ?? {})]));

  it('has a catalogue for each supported language', () => {
    for (const locale of LOCALES) assert.ok(catalogs[locale], `missing catalogue for ${locale}`);
  });

  it('has a message for every API error code', () => {
    const missing: string[] = [];
    for (const code of Object.keys(ERROR_STATUS)) {
      const key = errorMessageKey(code);
      for (const locale of LOCALES) if (!flat[locale]?.has(key)) missing.push(`${locale}: ${key} (for ${code})`);
    }
    assert.deepEqual(missing, []);
  });

  it('has a message for every field validation code used in the source', () => {
    const codes = new Set<string>();
    const files = [...sourceFiles(join(root, 'apps/api/src')), ...sourceFiles(join(root, 'packages/shared/src')), ...sourceFiles(join(root, 'packages/ledger/src'))];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      // fail(errors, path, 'code')
      for (const m of text.matchAll(/fail\(\s*errors\s*,\s*[^,]+,\s*'([A-Za-z]+)'\s*\)/g)) codes.add(m[1] as string);
      // fields: { name: 'code', 'other.name': 'code' }
      for (const block of text.matchAll(/fields:\s*\{([^}]*)\}/g)) {
        for (const m of (block[1] as string).matchAll(/:\s*'([A-Za-z]+)'/g)) codes.add(m[1] as string);
      }
      // functions that return a code, such as passwordProblem()
      if (file.endsWith('shared/src/text.ts')) {
        for (const m of text.matchAll(/return\s+'([A-Za-z]+)'/g)) codes.add(m[1] as string);
      }
    }
    assert.ok(codes.size >= 20, `expected to find the validation codes in the source, found ${codes.size}`);
    const missing: string[] = [];
    for (const code of [...codes].sort()) {
      const key = validationMessageKey(code);
      for (const locale of LOCALES) if (!flat[locale]?.has(key)) missing.push(`${locale}: ${key}`);
    }
    assert.deepEqual(missing, []);
  });

  it('has no validation message that the API never sends (keeps the catalogue honest)', () => {
    const unused: string[] = [];
    const sources = [...sourceFiles(join(root, 'apps/api/src')), ...sourceFiles(join(root, 'packages'))]
      .filter((f) => !f.includes('/node_modules/') && !f.includes('/test/'))
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');
    for (const key of flat.en?.keys() ?? []) {
      if (!key.startsWith('validation.')) continue;
      const code = key.slice('validation.'.length);
      if (!new RegExp(`'${code}'`).test(sources)) unused.push(code);
    }
    assert.deepEqual(unused, []);
  });
});
