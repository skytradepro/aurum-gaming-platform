import { MAX_AGGREGATE_MINOR, abs, assertInRange } from './decimal.ts';
import { MoneyError, clip } from './errors.ts';
import type { Money, MoneyDTO } from './types.ts';

const CURRENCY_CODE = /^[A-Z]{3}$/;
const INTEGER_STRING = /^-?\d{1,19}$/;

export function isCurrencyCode(value: unknown): value is string {
  return typeof value === 'string' && CURRENCY_CODE.test(value);
}

/** Create a Money value. `amountMinor` must be a bigint: a JS number is rejected on purpose. */
export function money(amountMinor: bigint, currency: string): Money {
  if (typeof amountMinor !== 'bigint') {
    throw new MoneyError('invalid_amount', 'amountMinor must be a bigint (never a floating point number)');
  }
  if (!isCurrencyCode(currency)) {
    throw new MoneyError('invalid_currency', `"${clip(currency)}" is not a 3-letter currency code`);
  }
  assertInRange(amountMinor);
  return Object.freeze({ amountMinor, currency });
}

export function zero(currency: string): Money {
  return money(0n, currency);
}

export function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError('currency_mismatch', `cannot combine ${a.currency} with ${b.currency} without an explicit conversion`);
  }
}

function checked(amountMinor: bigint, currency: string): Money {
  if (abs(amountMinor) > MAX_AGGREGATE_MINOR) {
    throw new MoneyError('out_of_range', 'result exceeds the supported range');
  }
  return Object.freeze({ amountMinor, currency });
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return checked(a.amountMinor + b.amountMinor, a.currency);
}

export function sub(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return checked(a.amountMinor - b.amountMinor, a.currency);
}

export function negate(a: Money): Money {
  return Object.freeze({ amountMinor: -a.amountMinor, currency: a.currency });
}

export function isZero(a: Money): boolean {
  return a.amountMinor === 0n;
}

export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amountMinor === b.amountMinor ? 0 : a.amountMinor < b.amountMinor ? -1 : 1;
}

/** Sum amounts that are already in one currency. An empty list needs the currency stated. */
export function sum(list: readonly Money[], currency: string): Money {
  let total = 0n;
  for (const item of list) {
    if (item.currency !== currency) {
      throw new MoneyError('currency_mismatch', `expected only ${currency} amounts, got ${item.currency}`);
    }
    total += item.amountMinor;
  }
  return checked(total, currency);
}

/**
 * Totals per currency for dashboards and reports. Currencies are NEVER merged:
 * the result keeps one entry per currency.
 */
export function totalsByCurrency(list: readonly Money[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const item of list) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0n) + item.amountMinor);
  }
  return totals;
}

export function toDTO(value: Money): MoneyDTO {
  return { amountMinor: value.amountMinor.toString(), currency: value.currency };
}

export function fromDTO(input: unknown): Money {
  if (typeof input !== 'object' || input === null) {
    throw new MoneyError('invalid_amount', 'money DTO must be an object');
  }
  const { amountMinor, currency } = input as Record<string, unknown>;
  if (typeof amountMinor !== 'string' || !INTEGER_STRING.test(amountMinor)) {
    throw new MoneyError('invalid_amount', 'amountMinor must be an integer string');
  }
  return money(BigInt(amountMinor), currency as string);
}
