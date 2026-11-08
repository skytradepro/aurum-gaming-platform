/** The per-request context every page receives, and the helpers built on it. */
import type { IncomingMessage } from 'node:http';
import { formatDateTime } from '@aurum/i18n';
import { formatMoney, formatMoneyCompact } from '@aurum/money';
import type { CurrencyConfig } from '@aurum/money';
import type { ApiClient } from './api.ts';
import type { WebConfig } from './config.ts';
import { html } from './html.ts';
import type { SafeHtml } from './html.ts';
import type { Locale, Translate } from './i18n.ts';
import type { Logger } from './log.ts';
import type { Currency, Me, PublicConfig } from './types.ts';

export interface Flash {
  kind: 'success' | 'error' | 'info';
  /** A message key, translated when shown. */
  key: string;
  vars?: Record<string, string | number>;
}

export interface PageCtx {
  req: IncomingMessage;
  method: string;
  url: URL;
  /** Path after the locale prefix, always starting with "/". */
  path: string;
  locale: Locale;
  dir: 'ltr' | 'rtl';
  t: Translate;
  config: WebConfig;
  logger: Logger;
  api: ApiClient;
  publicConfig: PublicConfig;
  me: Me | null;
  ip: string;
  requestId: string;
  cookies: Record<string, string>;
  theme: 'dark' | 'light';
  /** Currency chosen in the header (visitors) or the player's display currency. */
  displayCurrency: string | null;
  csrfToken: string;
  flash: Flash | null;
  /** Cookies to send with the response (besides the ones relayed from the API). */
  setCookies: string[];
  /** Parsed form fields (POST). */
  form: URLSearchParams;
  /** Files of a multipart form (POST). */
  files: Map<string, File>;
  now: Date;
}

export type PageResult =
  | { kind: 'html'; status: number; body: SafeHtml; headers?: Record<string, string> }
  | { kind: 'redirect'; location: string; status?: number; flash?: Flash }
  | { kind: 'raw'; status: number; headers: Record<string, string>; body: string | Buffer };

export const htmlPage = (body: SafeHtml, status = 200, headers?: Record<string, string>): PageResult => ({ kind: 'html', status, body, ...(headers ? { headers } : {}) });
export const redirect = (location: string, flash?: Flash, status = 303): PageResult => ({ kind: 'redirect', location, status, ...(flash ? { flash } : {}) });

/** "/casino" -> "/en/casino" in the visitor's language. */
export function href(ctx: Pick<PageCtx, 'locale'>, path: string): string {
  if (path === '/' || path === '') return `/${ctx.locale}/`;
  return `/${ctx.locale}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The same page in another language. */
export function localeHref(ctx: Pick<PageCtx, 'path' | 'url'>, locale: Locale): string {
  const search = ctx.url.search;
  return `/${locale}${ctx.path === '/' ? '/' : ctx.path}${search}`;
}

function currencyConfig(c: Currency): CurrencyConfig {
  return {
    code: c.code,
    decimals: c.decimals,
    ...(c.displayDecimals !== null ? { displayDecimals: c.displayDecimals } : {}),
    display: c.display,
  };
}

export function findCurrency(ctx: Pick<PageCtx, 'publicConfig'>, code: string): Currency | undefined {
  return ctx.publicConfig.currencyFormats.find((c) => c.code === code) ?? ctx.publicConfig.currencies.find((c) => c.code === code);
}

export interface MoneyOptions {
  /** 'full' (default) = accounting precision; 'display' = player-facing short form. */
  mode?: 'full' | 'display';
  sign?: boolean;
  compact?: boolean;
  /** Text only (for attributes, CSV); default wraps the amount in <bdi> so RTL text cannot reorder it. */
  plain?: boolean;
}

export function moneyText(ctx: Pick<PageCtx, 'publicConfig' | 'locale'>, amount: { amountMinor: string; currency: string }, options: MoneyOptions = {}): string {
  const currency = findCurrency(ctx, amount.currency);
  const value = { amountMinor: BigInt(amount.amountMinor), currency: amount.currency };
  if (!currency) return `${amount.amountMinor} ${amount.currency}`;
  const config = currencyConfig(currency);
  if (options.compact) return formatMoneyCompact(value, config, ctx.locale);
  return formatMoney(value, config, ctx.locale, { mode: options.mode ?? 'full', ...(options.sign ? { signDisplay: 'always' as const } : {}) });
}

export function money(ctx: Pick<PageCtx, 'publicConfig' | 'locale'>, amount: { amountMinor: string; currency: string }, options: MoneyOptions = {}): SafeHtml {
  const text = moneyText(ctx, amount, options);
  const negative = amount.amountMinor.startsWith('-');
  return html`<bdi class="${negative ? 'money money-neg' : 'money'}" dir="ltr">${text}</bdi>`;
}

/** A signed amount for statements: +12.500 TND / -3.000 TND. */
export function signedMoney(ctx: Pick<PageCtx, 'publicConfig' | 'locale'>, amount: { amountMinor: string; currency: string }, direction: 1 | -1): SafeHtml {
  const text = moneyText(ctx, amount);
  return html`<bdi class="${direction === 1 ? 'money money-in' : 'money money-out'}" dir="ltr">${direction === 1 ? '+' : '−'}${text}</bdi>`;
}

export function dateText(ctx: Pick<PageCtx, 'locale' | 'config'>, iso: string | null | undefined, withTime = true): string {
  if (!iso) return '';
  return formatDateTime(iso, ctx.locale, { timeZone: ctx.config.timeZone, withTime });
}

export function date(ctx: Pick<PageCtx, 'locale' | 'config'>, iso: string | null | undefined, withTime = true): SafeHtml {
  if (!iso) return html``;
  return html`<time datetime="${iso}">${dateText(ctx, iso, withTime)}</time>`;
}

/** Name of a currency in the visitor's language. */
export function currencyName(ctx: Pick<PageCtx, 'publicConfig' | 'locale'>, code: string): string {
  const c = findCurrency(ctx, code);
  return c?.names[ctx.locale] ?? c?.names.en ?? code;
}

/** Name of a country in the visitor's language (from the Unicode CLDR data in Node). */
export function countryName(locale: Locale, code: string | null | undefined): string {
  if (!code) return '';
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function isStaff(me: Me | null): boolean {
  return me?.role === 'admin' || me?.role === 'super_admin';
}

export function can(me: Me | null, ...permissions: string[]): boolean {
  if (!me) return false;
  if (me.role === 'super_admin') return true;
  if (me.role !== 'admin') return false;
  return permissions.length === 0 || permissions.some((p) => (me.permissions as readonly string[]).includes(p));
}
