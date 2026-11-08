import { MoneyError } from './errors.ts';
import type { RoundingMode } from './types.ts';

/**
 * Integer division with an explicit rounding rule. The only place in the platform where
 * rounding happens, so every screen, report and conversion rounds the same way.
 *
 * - half-up   : ties go away from zero (2.5 -> 3, -2.5 -> -3)
 * - half-even : ties go to the even neighbour (2.5 -> 2, 3.5 -> 4)
 * - down      : toward zero (truncate)
 * - up        : away from zero
 */
export function divRound(numerator: bigint, denominator: bigint, mode: RoundingMode): bigint {
  if (denominator === 0n) {
    throw new MoneyError('division_by_zero', 'division by zero');
  }
  let n = numerator;
  let d = denominator;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const negative = n < 0n;
  const magnitude = negative ? -n : n;
  let quotient = magnitude / d;
  const remainder = magnitude % d;
  if (remainder !== 0n) {
    const twice = remainder * 2n;
    switch (mode) {
      case 'down':
        break;
      case 'up':
        quotient += 1n;
        break;
      case 'half-up':
        if (twice >= d) quotient += 1n;
        break;
      case 'half-even':
        if (twice > d || (twice === d && quotient % 2n === 1n)) quotient += 1n;
        break;
    }
  }
  return negative ? -quotient : quotient;
}

/** The rounding rule used for conversions unless a caller states another one. */
export const DEFAULT_ROUNDING: RoundingMode = 'half-up';
