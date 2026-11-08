import { abs, minorToDecimalString, pow10 } from './decimal.ts';
import { MoneyError } from './errors.ts';
import { divRound } from './round.ts';
import type { CurrencyConfig, CurrencyDisplayRule, FormatLocale, Money, RoundingMode } from './types.ts';

/*
 * Deterministic formatting. Intl is deliberately NOT used for money: its output changes between
 * ICU/CLDR versions, and the same amount must look identical on the website, in the admin
 * panels and in reports. Rules per locale are explicit and covered by tests.
 */

const SEPARATORS: Record<FormatLocale, { group: string; decimal: string }> = {
  en: { group: ',', decimal: '.' },
  fr: { group: ' ', decimal: ',' }, // narrow no-break space, decimal comma
  ar: { group: ',', decimal: '.' }, // Latin digits by default; see `digits: 'arab'`
};

export const NBSP = ' ';
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function resolveLocale(locale: string | undefined): FormatLocale {
  const language = (locale ?? 'en').toLowerCase().split(/[-_]/)[0];
  return language === 'fr' || language === 'ar' ? language : 'en';
}

export function resolveDisplayRule(currency: CurrencyConfig, locale: string | undefined): CurrencyDisplayRule {
  return currency.display[resolveLocale(locale)] ?? currency.display.default;
}

function groupDigits(digits: string, separator: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

function toArabicIndic(text: string): string {
  return text
    .replace(/\d/g, (d) => ARABIC_INDIC_DIGITS[Number(d)] ?? d)
    .replace(/,/g, '٬')
    .replace(/\./g, '٫');
}

export interface NumberOptions {
  readonly grouping?: boolean;
  /** Arabic only: 'latn' (0-9, default) or 'arab' (Arabic-Indic digits). */
  readonly digits?: 'latn' | 'arab';
}

/** Format a non-negative minor-unit amount as a localised number with exactly `decimals` fraction digits. */
export function formatDecimalMinor(minor: bigint, decimals: number, locale: string, options: NumberOptions = {}): string {
  const loc = resolveLocale(locale);
  const { group, decimal } = SEPARATORS[loc];
  const [intPart = '0', fraction = ''] = minorToDecimalString(abs(minor), decimals).split('.');
  const grouped = options.grouping === false ? intPart : groupDigits(intPart, group);
  const text = fraction ? `${grouped}${decimal}${fraction}` : grouped;
  return loc === 'ar' && options.digits === 'arab' ? toArabicIndic(text) : text;
}

export interface FormatMoneyOptions extends NumberOptions {
  /** 'full' (default) = accounting precision. 'display' = player-facing, uses `displayDecimals`. */
  readonly mode?: 'full' | 'display';
  /** 'symbol' (default), 'code' (ISO code) or 'none'. */
  readonly symbol?: 'symbol' | 'code' | 'none';
  readonly signDisplay?: 'auto' | 'always';
  /** Used only when 'display' mode drops decimals. Default 'down' so a balance is never overstated. */
  readonly displayRounding?: RoundingMode;
}

function assertCurrencyMatches(amount: Money, currency: CurrencyConfig): void {
  if (amount.currency !== currency.code) {
    throw new MoneyError('currency_mismatch', `amount is in ${amount.currency} but the currency config is ${currency.code}`);
  }
}

function assemble(sign: string, body: string, rule: CurrencyDisplayRule, code: string, symbolMode: 'symbol' | 'code' | 'none'): string {
  const symbol = symbolMode === 'none' ? '' : symbolMode === 'code' ? code : rule.symbol;
  if (!symbol) return `${sign}${body}`;
  // An ISO code is always separated from the number, whatever the locale rule says for symbols.
  const space = rule.spacing || symbolMode === 'code' ? NBSP : '';
  return rule.placement === 'prefix' ? `${sign}${symbol}${space}${body}` : `${sign}${body}${space}${symbol}`;
}

/**
 * Format an amount for people. Examples (EUR, 123456789 minor units):
 *   en  "€1,234,567.89"      fr  "1 234 567,89 €" (U+202F groups, U+00A0 before the symbol)
 *   ar  "1,234,567.89 €"
 * Wrap the result in <bdi> in HTML so surrounding RTL/LTR text cannot reorder it.
 */
export function formatMoney(amount: Money, currency: CurrencyConfig, locale: string, options: FormatMoneyOptions = {}): string {
  assertCurrencyMatches(amount, currency);
  let minor = amount.amountMinor;
  let decimals = currency.decimals;
  if (options.mode === 'display' && currency.displayDecimals !== undefined && currency.displayDecimals < decimals) {
    minor = divRound(minor, pow10(decimals - currency.displayDecimals), options.displayRounding ?? 'down');
    decimals = currency.displayDecimals;
  }
  const body = formatDecimalMinor(minor, decimals, locale, options);
  const sign = minor < 0n ? '-' : options.signDisplay === 'always' && minor > 0n ? '+' : '';
  return assemble(sign, body, resolveDisplayRule(currency, locale), currency.code, options.symbol ?? 'symbol');
}

function scaled(amount: bigint, unit: bigint, decimalSeparator: string): string {
  const hundredths = divRound(amount * 100n, unit, 'down');
  const whole = hundredths / 100n;
  const fraction = (hundredths % 100n).toString().padStart(2, '0').replace(/0+$/, '');
  return fraction ? `${whole}${decimalSeparator}${fraction}` : whole.toString();
}

/**
 * Short form for marketing widgets such as "Top winners": 1.28K, 8K, 895.2, 1.25M.
 * Always truncates (never rounds up), so a figure shown on the site is never larger than the real one.
 */
export function formatMoneyCompact(
  amount: Money,
  currency: CurrencyConfig,
  locale: string,
  options: Pick<FormatMoneyOptions, 'symbol' | 'digits'> = {},
): string {
  assertCurrencyMatches(amount, currency);
  const loc = resolveLocale(locale);
  const { decimal } = SEPARATORS[loc];
  const unit = pow10(currency.decimals);
  const magnitude = abs(amount.amountMinor);
  let body: string;
  if (magnitude >= unit * 1_000_000n) body = `${scaled(magnitude, unit * 1_000_000n, decimal)}M`;
  else if (magnitude >= unit * 1_000n) body = `${scaled(magnitude, unit * 1_000n, decimal)}K`;
  else body = scaled(magnitude, unit, decimal);
  if (loc === 'ar' && options.digits === 'arab') body = toArabicIndic(body);
  const sign = amount.amountMinor < 0n && magnitude >= unit / 100n ? '-' : '';
  return assemble(sign, body, resolveDisplayRule(currency, locale), currency.code, options.symbol ?? 'symbol');
}
