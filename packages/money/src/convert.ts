import { MoneyError, clip } from './errors.ts';
import { assertInRange, assertValidDecimals, pow10 } from './decimal.ts';
import { DEFAULT_ROUNDING, divRound } from './round.ts';
import type { RoundingMode } from './types.ts';

/** Exchange rates are stored with at most 12 fractional digits (PostgreSQL numeric(30,12)). */
export const MAX_RATE_DECIMALS = 12;

const RATE = /^(\d{1,15})(?:\.(\d{1,12}))?$/;

export interface Rational {
  readonly numerator: bigint;
  readonly denominator: bigint;
}

/** Parse a positive decimal exchange rate ("3.456789") into an exact fraction. */
export function parseRate(rate: string): Rational {
  const match = typeof rate === 'string' ? RATE.exec(rate) : null;
  if (!match) {
    throw new MoneyError('invalid_rate', `"${clip(rate)}" is not a valid exchange rate (max ${MAX_RATE_DECIMALS} decimals)`);
  }
  const fraction = match[2] ?? '';
  const numerator = BigInt((match[1] ?? '0') + fraction);
  if (numerator === 0n) {
    throw new MoneyError('invalid_rate', 'exchange rate must be greater than zero');
  }
  return { numerator, denominator: pow10(fraction.length) };
}

export interface ConvertArgs {
  readonly amountMinor: bigint;
  readonly fromDecimals: number;
  readonly toDecimals: number;
  /** 1 unit of the source currency = `rate` units of the target currency. */
  readonly rate: string;
  readonly rounding?: RoundingMode;
}

/**
 * Convert between currencies with exact integer arithmetic and ONE explicit rounding step.
 *
 * The platform never converts balances on its own: callers must pass a rate that a Super Admin
 * entered (or a reliable provider returned) and must store the original amount, original currency
 * and the rate used next to the converted amount (ledger_entries.original_*, exchange_rate).
 */
export function convertMinor(args: ConvertArgs): bigint {
  assertValidDecimals(args.fromDecimals);
  assertValidDecimals(args.toDecimals);
  const { numerator, denominator } = parseRate(args.rate);
  const result = divRound(
    args.amountMinor * numerator * pow10(args.toDecimals),
    denominator * pow10(args.fromDecimals),
    args.rounding ?? DEFAULT_ROUNDING,
  );
  assertInRange(result);
  return result;
}
