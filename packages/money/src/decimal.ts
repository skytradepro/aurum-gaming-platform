import { MoneyError, clip } from './errors.ts';

export const MIN_DECIMALS = 0;
export const MAX_DECIMALS = 8;

/**
 * Largest absolute amount (in minor units) accepted anywhere in the platform: 10^15.
 * Leaves a huge safety margin below PostgreSQL BIGINT (about 9.22 * 10^18) so sums never overflow.
 */
export const MAX_MINOR_UNITS = 10n ** 15n;

/** Ceiling for sums and balances (below 2^63 - 1 so PostgreSQL BIGINT can never overflow). */
export const MAX_AGGREGATE_MINOR = 9_000_000_000_000_000_000n;

export function assertValidDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < MIN_DECIMALS || decimals > MAX_DECIMALS) {
    throw new MoneyError('invalid_decimals', `decimals must be an integer between ${MIN_DECIMALS} and ${MAX_DECIMALS}`);
  }
}

export function pow10(exp: number): bigint {
  return 10n ** BigInt(exp);
}

export function abs(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function assertInRange(minor: bigint): void {
  if (abs(minor) > MAX_MINOR_UNITS) {
    throw new MoneyError('out_of_range', `amount exceeds the maximum of ${MAX_MINOR_UNITS.toString()} minor units`);
  }
}

const CANONICAL = /^(-)?(\d{1,18})(?:\.(\d{1,30}))?$/;

export interface ParseOptions {
  /** Default true. Deposits/withdrawals pass false (the operation type carries the sign). */
  readonly allowNegative?: boolean;
}

/**
 * Strict parser for canonical decimal strings ("12", "12.5", "-0.005") into minor units.
 *
 * It never rounds: more fractional digits than `decimals` is an error, so money can never be
 * silently changed on the way in. No exponent, no thousands separators, no surrounding spaces.
 * Use `parseAmountInput` for text typed by people.
 */
export function parseDecimalToMinor(input: string, decimals: number, options: ParseOptions = {}): bigint {
  assertValidDecimals(decimals);
  if (typeof input !== 'string') {
    throw new MoneyError('invalid_amount', 'amount must be a string');
  }
  const match = CANONICAL.exec(input);
  if (!match) {
    throw new MoneyError('invalid_amount', `"${clip(input)}" is not a valid decimal amount`);
  }
  const negative = match[1] === '-';
  const intPart = match[2] ?? '0';
  const fraction = match[3] ?? '';
  if (fraction.length > decimals) {
    throw new MoneyError('too_many_decimals', `"${clip(input)}" has more than ${decimals} decimal places`);
  }
  if (negative && options.allowNegative === false) {
    throw new MoneyError('negative_not_allowed', 'negative amounts are not allowed here');
  }
  const magnitude = BigInt(intPart + fraction.padEnd(decimals, '0'));
  const value = negative ? -magnitude : magnitude;
  assertInRange(value);
  return value;
}

/** Exact inverse of `parseDecimalToMinor`: always prints exactly `decimals` fractional digits. */
export function minorToDecimalString(minor: bigint, decimals: number): string {
  assertValidDecimals(decimals);
  const negative = minor < 0n;
  const digits = abs(minor).toString().padStart(decimals + 1, '0');
  const intPart = digits.slice(0, digits.length - decimals);
  const fraction = decimals === 0 ? '' : digits.slice(digits.length - decimals);
  return `${negative ? '-' : ''}${intPart}${decimals === 0 ? '' : `.${fraction}`}`;
}

/**
 * Turn text typed by a person into a canonical decimal string.
 *
 * Accepted: Western or Arabic-Indic digits, ONE decimal separator ('.', ',' or Arabic '٫'),
 * optional leading/trailing whitespace, ".5" and "5.".
 * Rejected on purpose: thousands separators of any kind ("1,000.50", "1 000", "1٬000").
 * Money entry must never be ambiguous, so the person has to retype instead of us guessing.
 */
export function normalizeAmountInput(raw: string): string {
  if (typeof raw !== 'string') {
    throw new MoneyError('invalid_amount', 'amount must be a string');
  }
  let text = raw.trim();
  text = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, '.');
  if (/[٬    ]/.test(text)) {
    throw new MoneyError('ambiguous_separator', 'thousands separators are not accepted in amount fields');
  }
  const separators = text.match(/[.,]/g) ?? [];
  if (separators.length > 1) {
    throw new MoneyError('ambiguous_separator', 'use a single decimal separator and no thousands separators');
  }
  text = text.replace(',', '.');
  if (text.startsWith('.')) text = `0${text}`;
  if (text.endsWith('.')) text = text.slice(0, -1);
  return text;
}

/** Person-typed text to minor units (normalise, then strict parse). */
export function parseAmountInput(raw: string, decimals: number, options: ParseOptions = {}): bigint {
  return parseDecimalToMinor(normalizeAmountInput(raw), decimals, options);
}
