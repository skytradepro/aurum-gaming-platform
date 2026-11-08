import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Catalog checker (Node only). Keeps translations honest:
 *  - every locale has exactly the keys of the reference locale (en)
 *  - no empty strings
 *  - placeholders ({name}) are identical in every language
 *  - no ICU plural/select syntax (messages stay simple and portable)
 *  - Arabic strings contain Arabic script; English/French strings do not
 *  - long French strings identical to English are reported as warnings (likely untranslated)
 */

export type Messages = { [key: string]: string | Messages };

export interface Problem {
  readonly severity: 'error' | 'warning';
  readonly locale: string;
  readonly key: string;
  readonly message: string;
}

export function flatten(messages: Messages, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? ''))].sort();
}

const ARABIC_LETTER = /[؀-ۿݐ-ݿ]/;
const LATIN_LETTER = /[A-Za-z]/;
const ICU_COMPLEX = /\{\s*\w+\s*,\s*(plural|select|selectordinal)\b/;

/** Keys whose Arabic text may legitimately contain only Latin script (brand names, tier names). */
const LATIN_ALLOWED = [/^meta\.siteName$/, /^home\.tiers\./, /\.brand$/];

export function loadCatalogs(directory: string): Record<string, Messages> {
  const catalogs: Record<string, Messages> = {};
  for (const file of readdirSync(directory).filter((f) => f.endsWith('.json')).sort()) {
    catalogs[file.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(directory, file), 'utf8')) as Messages;
  }
  return catalogs;
}

export function checkCatalogs(catalogs: Record<string, Messages>, reference = 'en'): Problem[] {
  const problems: Problem[] = [];
  const refCatalog = catalogs[reference];
  if (!refCatalog) {
    return [{ severity: 'error', locale: reference, key: '*', message: `reference catalog "${reference}" not found` }];
  }
  const ref = flatten(refCatalog);
  for (const [locale, catalog] of Object.entries(catalogs)) {
    const flat = flatten(catalog);
    for (const key of ref.keys()) {
      if (!flat.has(key)) problems.push({ severity: 'error', locale, key, message: 'missing key' });
    }
    for (const [key, value] of flat) {
      const refValue = ref.get(key);
      if (refValue === undefined) {
        problems.push({ severity: 'error', locale, key, message: `extra key not present in ${reference}` });
        continue;
      }
      if (value.trim() === '') {
        problems.push({ severity: 'error', locale, key, message: 'empty string' });
        continue;
      }
      if (ICU_COMPLEX.test(value)) {
        problems.push({ severity: 'error', locale, key, message: 'ICU plural/select is not allowed; use simple {placeholders}' });
      }
      const expected = placeholders(refValue).join(',');
      const actual = placeholders(value).join(',');
      if (expected !== actual) {
        problems.push({ severity: 'error', locale, key, message: `placeholders differ: expected {${expected}} but found {${actual}}` });
      }
      const latinOk = LATIN_ALLOWED.some((re) => re.test(key));
      if (locale === 'ar' && !latinOk && LATIN_LETTER.test(refValue) && !ARABIC_LETTER.test(value)) {
        problems.push({ severity: 'error', locale, key, message: 'Arabic text must contain Arabic script (untranslated?)' });
      }
      if (locale !== 'ar' && ARABIC_LETTER.test(value) && !ARABIC_LETTER.test(refValue)) {
        problems.push({ severity: 'error', locale, key, message: 'unexpected Arabic script in a non-Arabic catalog' });
      }
      if (locale === 'fr' && value === refValue && value.length > 25 && LATIN_LETTER.test(value)) {
        problems.push({ severity: 'warning', locale, key, message: 'identical to English (untranslated?)' });
      }
    }
  }
  return problems;
}
