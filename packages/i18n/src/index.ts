/**
 * Supported interface languages.
 *
 * To add a language later (for example Turkish):
 *   1. add its code to LOCALES and LOCALE_META below,
 *   2. copy messages/en.json to messages/tr.json and translate it,
 *   3. run `npm run i18n:check` - it lists every missing or mismatching key,
 *   4. enable it in the Super Admin "Languages" screen (table `languages`).
 */
export const LOCALES = ['en', 'fr', 'ar', 'ru', 'tr'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

export type Direction = 'ltr' | 'rtl';

export interface LocaleMeta {
  readonly code: Locale;
  readonly englishName: string;
  readonly nativeName: string;
  readonly direction: Direction;
  /** Value for <html lang="..."> */
  readonly htmlLang: string;
  /** BCP-47 tag for Intl date formatting (Latin digits and Gregorian calendar are forced for Arabic). */
  readonly intlTag: string;
}

export const LOCALE_META: Readonly<Record<Locale, LocaleMeta>> = {
  en: { code: 'en', englishName: 'English', nativeName: 'English', direction: 'ltr', htmlLang: 'en', intlTag: 'en-GB' },
  fr: { code: 'fr', englishName: 'French', nativeName: 'Français', direction: 'ltr', htmlLang: 'fr', intlTag: 'fr-FR' },
  ar: { code: 'ar', englishName: 'Arabic', nativeName: 'العربية', direction: 'rtl', htmlLang: 'ar', intlTag: 'ar-u-ca-gregory-nu-latn' },
  ru: { code: 'ru', englishName: 'Russian', nativeName: 'Русский', direction: 'ltr', htmlLang: 'ru', intlTag: 'ru-RU' },
  tr: { code: 'tr', englishName: 'Turkish', nativeName: 'Türkçe', direction: 'ltr', htmlLang: 'tr', intlTag: 'tr-TR' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function getDirection(locale: Locale): Direction {
  return LOCALE_META[locale].direction;
}

/** Pick the best supported locale from an Accept-Language header ("fr-CH, fr;q=0.9, en;q=0.8"). */
export function negotiateLocale(acceptLanguage: string | null | undefined, fallback: Locale = DEFAULT_LOCALE): Locale {
  if (!acceptLanguage) return fallback;
  const candidates = acceptLanguage
    .split(',')
    .map((part, index) => {
      const [tag = '', ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return { base: tag.trim().toLowerCase().split('-')[0] ?? '', weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((c) => c.base && c.weight > 0)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const candidate of candidates) {
    if (isLocale(candidate.base)) return candidate.base;
  }
  return fallback;
}

/** API error codes that have a general-purpose message (everything else lives under errors.codes). */
const GENERAL_ERROR_KEYS: Readonly<Record<string, string>> = {
  unauthenticated: 'unauthenticated',
  forbidden: 'forbidden',
  not_found: 'notFound',
  rate_limited: 'rateLimited',
  validation: 'validation',
  conflict: 'conflict',
  csrf: 'csrf',
};

/** Catalogue key of the message for an API error code ("insufficient_funds" -> "errors.codes.insufficient_funds"). */
export function errorMessageKey(code: string): string {
  const general = GENERAL_ERROR_KEYS[code];
  return general ? `errors.${general}` : `errors.codes.${code}`;
}

/** Catalogue key of the message for a field validation code ("tooShort" -> "validation.tooShort"). */
export function validationMessageKey(code: string): string {
  return `validation.${code}`;
}

/** Replace {name} placeholders. Messages use simple placeholders only (no ICU plural/select). */
export function interpolate(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Split a translated sentence around one placeholder so a component can put a link or a
 * button inside it without breaking word order in any language:
 *   const [before, after] = splitAround(t('acceptTerms', { terms: SLOT }), SLOT)
 */
export const SLOT = '';
export function splitAround(text: string, slot: string = SLOT): [string, string] {
  const index = text.indexOf(slot);
  return index === -1 ? [text, ''] : [text.slice(0, index), text.slice(index + slot.length)];
}

export interface DateTimeOptions {
  readonly timeZone?: string;
  readonly withTime?: boolean;
}

/** Locale-aware date/time with Latin digits in every language, for statements and tables. */
export function formatDateTime(value: Date | string | number, locale: Locale, options: DateTimeOptions = {}): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const base: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric', timeZone: options.timeZone };
  const formatOptions: Intl.DateTimeFormatOptions =
    options.withTime === false ? base : { ...base, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
  return new Intl.DateTimeFormat(LOCALE_META[locale].intlTag, formatOptions).format(date);
}
