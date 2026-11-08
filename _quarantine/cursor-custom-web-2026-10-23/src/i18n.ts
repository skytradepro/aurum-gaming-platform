/** Translations for the website, from the shared catalogues in @aurum/i18n. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LOCALE, LOCALES, LOCALE_META, errorMessageKey, interpolate, isLocale, validationMessageKey } from '@aurum/i18n';
import type { Locale } from '@aurum/i18n';

type Messages = { [key: string]: string | Messages };

function flatten(messages: Messages, prefix = '', out = new Map<string, string>()): Map<string, string> {
  for (const [key, value] of Object.entries(messages)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else flatten(value, path, out);
  }
  return out;
}

const catalogs = new Map<Locale, Map<string, string>>();
for (const locale of LOCALES) {
  const file = fileURLToPath(new URL(`../../../packages/i18n/messages/${locale}.json`, import.meta.url));
  catalogs.set(locale, flatten(JSON.parse(readFileSync(file, 'utf8')) as Messages));
}

export type Translate = (key: string, values?: Readonly<Record<string, string | number>>) => string;

/** A translator for one language. A missing key falls back to English, then to the key itself. */
export function translator(locale: Locale): Translate {
  const own = catalogs.get(locale) as Map<string, string>;
  const fallback = catalogs.get(DEFAULT_LOCALE) as Map<string, string>;
  return (key, values) => interpolate(own.get(key) ?? fallback.get(key) ?? key, values);
}

export function hasMessage(key: string, locale: Locale = DEFAULT_LOCALE): boolean {
  return catalogs.get(locale)?.has(key) ?? false;
}

/** The message for an API error code, in the visitor's language. */
export function errorText(t: Translate, code: string): string {
  const key = errorMessageKey(code);
  return hasMessage(key) ? t(key) : t('errors.generic');
}

/** The message for a field validation code ("tooShort" -> "This value is too short."). */
export function fieldText(t: Translate, code: string): string {
  const key = validationMessageKey(code);
  return hasMessage(key) ? t(key) : t('validation.invalidFormat');
}

export { DEFAULT_LOCALE, LOCALES, LOCALE_META, isLocale };
export type { Locale };
