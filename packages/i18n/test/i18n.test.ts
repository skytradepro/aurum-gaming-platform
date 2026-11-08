import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_META,
  SLOT,
  formatDateTime,
  getDirection,
  interpolate,
  isLocale,
  negotiateLocale,
  splitAround,
} from '../src/index.ts';
import { checkCatalogs, flatten, loadCatalogs } from '../src/check.ts';
import type { Messages } from '../src/check.ts';

const messagesDir = fileURLToPath(new URL('../messages', import.meta.url));

describe('locales', () => {
  it('supports exactly English, French and Arabic, with English as the default', () => {
    assert.deepEqual([...LOCALES], ['en', 'fr', 'ar']);
    assert.equal(DEFAULT_LOCALE, 'en');
  });

  it('marks only Arabic as right-to-left', () => {
    assert.equal(getDirection('ar'), 'rtl');
    assert.equal(getDirection('en'), 'ltr');
    assert.equal(getDirection('fr'), 'ltr');
    for (const code of LOCALES) assert.equal(LOCALE_META[code].code, code);
  });

  it('validates locale codes', () => {
    assert.equal(isLocale('ar'), true);
    assert.equal(isLocale('de'), false);
    assert.equal(isLocale(undefined), false);
    assert.equal(isLocale('AR'), false);
  });
});

describe('negotiateLocale', () => {
  it('honours quality values and regional tags', () => {
    assert.equal(negotiateLocale('fr-CH, fr;q=0.9, en;q=0.8'), 'fr');
    assert.equal(negotiateLocale('ar-TN,ar;q=0.9,fr;q=0.8'), 'ar');
    assert.equal(negotiateLocale('de;q=0.9, fr;q=0.8, en;q=0.7'), 'fr');
  });

  it('skips unsupported and q=0 languages, falling back to the default', () => {
    assert.equal(negotiateLocale('de, es;q=0.9'), 'en');
    assert.equal(negotiateLocale('en;q=0, fr'), 'fr');
    assert.equal(negotiateLocale('*;q=0.5'), 'en');
    assert.equal(negotiateLocale(''), 'en');
    assert.equal(negotiateLocale(null), 'en');
    assert.equal(negotiateLocale(undefined, 'fr'), 'fr');
  });

  it('keeps header order when weights are equal', () => {
    assert.equal(negotiateLocale('ar, fr'), 'ar');
    assert.equal(negotiateLocale('fr, ar'), 'fr');
  });
});

describe('interpolate / splitAround', () => {
  it('replaces known placeholders and leaves unknown ones untouched', () => {
    assert.equal(interpolate('Showing {shown} of {total}', { shown: 32, total: 288 }), 'Showing 32 of 288');
    assert.equal(interpolate('Hello {name}'), 'Hello {name}');
    assert.equal(interpolate('{a}{a}', { a: 'x' }), 'xx');
  });

  it('splits a sentence around a slot so links work in any word order', () => {
    assert.deepEqual(splitAround(interpolate('I accept {terms}.', { terms: SLOT })), ['I accept ', '.']);
    assert.deepEqual(splitAround(interpolate('أوافق على {terms}.', { terms: SLOT })), ['أوافق على ', '.']);
    assert.deepEqual(splitAround('no slot here'), ['no slot here', '']);
  });
});

describe('formatDateTime', () => {
  const instant = new Date('2026-10-22T23:30:00Z');

  it('respects the time zone and prints Latin digits in every language', () => {
    for (const locale of LOCALES) {
      const utc = formatDateTime(instant, locale, { timeZone: 'UTC' });
      assert.match(utc, /2026/);
      assert.match(utc, /23:30/);
      assert.doesNotMatch(utc, /[٠-٩]/, `Arabic-Indic digits found for ${locale}: ${utc}`);
    }
    assert.match(formatDateTime(instant, 'en', { timeZone: 'Asia/Tokyo' }), /08:30/);
  });

  it('can omit the time and tolerates invalid input', () => {
    assert.doesNotMatch(formatDateTime(instant, 'en', { timeZone: 'UTC', withTime: false }), /:/);
    assert.equal(formatDateTime('not a date', 'en'), '');
  });
});

describe('message catalogs', () => {
  const catalogs = loadCatalogs(messagesDir);

  it('has one catalog per supported locale and nothing else', () => {
    const files = readdirSync(messagesDir).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')).sort();
    assert.deepEqual(files, [...LOCALES].sort());
  });

  it('is complete and consistent in every language', () => {
    const problems = checkCatalogs(catalogs);
    const errors = problems.filter((p) => p.severity === 'error');
    assert.deepEqual(errors, [], errors.map((p) => `[${p.locale}] ${p.key}: ${p.message}`).join('\n'));
    const warnings = problems.filter((p) => p.severity === 'warning');
    assert.deepEqual(warnings, [], warnings.map((p) => `[${p.locale}] ${p.key}: ${p.message}`).join('\n'));
  });

  it('covers the core interface areas with a healthy number of messages', () => {
    const en = flatten(catalogs.en as Messages);
    assert.ok(en.size >= 200, `expected at least 200 messages, found ${en.size}`);
    for (const prefix of ['nav.', 'auth.', 'errors.', 'home.', 'casino.', 'promotions.', 'footer.', 'account.', 'wallet.']) {
      assert.ok([...en.keys()].some((k) => k.startsWith(prefix)), `missing namespace ${prefix}`);
    }
  });
});

describe('checker (self-test with synthetic catalogs)', () => {
  const good: Record<string, Messages> = {
    en: { a: 'Hello {name}', b: 'Plain' },
    fr: { a: 'Bonjour {name}', b: 'Simple' },
    ar: { a: 'مرحبًا {name}', b: 'عادي' },
  };

  it('accepts a correct set', () => {
    assert.deepEqual(checkCatalogs(good), []);
  });

  it('reports missing, extra and empty keys', () => {
    const bad = structuredClone(good);
    delete (bad.fr as Messages).b;
    (bad.ar as Messages).extra = 'زائد';
    (bad.en as Messages).b = '  ';
    const messages = checkCatalogs(bad).map((p) => `${p.locale}:${p.key}:${p.message}`);
    assert.ok(messages.includes('fr:b:missing key'));
    assert.ok(messages.includes('ar:extra:extra key not present in en'));
    assert.ok(messages.some((m) => m.startsWith('en:b:empty')));
  });

  it('reports placeholder mismatches and ICU syntax', () => {
    const bad = structuredClone(good);
    (bad.fr as Messages).a = 'Bonjour {nom}';
    (bad.ar as Messages).b = '{count, plural, one {واحد} other {كثير}}';
    const messages = checkCatalogs(bad).map((p) => `${p.locale}:${p.key}:${p.message}`);
    assert.ok(messages.some((m) => m.startsWith('fr:a:placeholders differ')));
    assert.ok(messages.some((m) => m.startsWith('ar:b:ICU')));
  });

  it('reports untranslated Arabic and stray Arabic script in other languages', () => {
    const bad = structuredClone(good);
    (bad.ar as Messages).b = 'Plain';
    (bad.fr as Messages).b = 'عادي';
    const messages = checkCatalogs(bad).map((p) => `${p.locale}:${p.key}:${p.message}`);
    assert.ok(messages.some((m) => m.startsWith('ar:b:Arabic text must contain Arabic script')));
    assert.ok(messages.some((m) => m.startsWith('fr:b:unexpected Arabic script')));
  });
});
