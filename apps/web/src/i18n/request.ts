import { DEFAULT_LOCALE, LOCALES, isLocale } from '@aurum/i18n';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

// Static imports: webpack cannot resolve a dynamic template through the package "exports" map.
const loaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import('../../../../packages/i18n/messages/en.json'),
  fr: () => import('../../../../packages/i18n/messages/fr.json'),
  ar: () => import('../../../../packages/i18n/messages/ar.json'),
  ru: () => import('../../../../packages/i18n/messages/ru.json'),
  tr: () => import('../../../../packages/i18n/messages/tr.json'),
};

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !isLocale(locale)) locale = routing.defaultLocale ?? DEFAULT_LOCALE;
  const load = loaders[locale] ?? loaders[DEFAULT_LOCALE]!;
  return {
    locale,
    messages: (await load()).default,
  };
});
