import { convertMinor } from '@aurum/money';
import type { CurrencyDTO } from './types';

export interface PublicRate {
  base: string;
  quote: string;
  rate: string;
  source: string;
  asOf: string;
}

/**
 * "About X" for display only. Rounds down so the shown figure never overstates what the player has.
 * Returns null when there is no stored rate for exactly this pair: callers then show the real currency.
 */
export function convertForDisplay(amountMinor: string, from: CurrencyDTO, to: CurrencyDTO, rates: PublicRate[]): string | null {
  if (from.code === to.code) return null;
  return convertAny(amountMinor, from, to, rates, 'down');
}

type Rounding = 'down' | 'up';

/** Rate for `from` → `to`: the stored pair, or the exact inverse of the stored opposite pair. Null when neither exists. */
function rateFor(from: string, to: string, rates: PublicRate[]): string | null {
  const direct = rates.find((x) => x.base === from && x.quote === to);
  if (direct) return direct.rate;
  const back = rates.find((x) => x.base === to && x.quote === from);
  if (!back) return null;
  const [i = '0', f = ''] = back.rate.split('.');
  const scaled = BigInt(`${i}${f.padEnd(12, '0').slice(0, 12)}`);
  if (scaled === 0n) return null;
  const inv = ((10n ** 24n) / scaled).toString().padStart(13, '0');
  return `${inv.slice(0, -12)}.${inv.slice(-12)}`;
}

/** Converts in either direction with one explicit rounding step. Null when no rate exists. */
export function convertAny(amountMinor: string, from: CurrencyDTO, to: CurrencyDTO, rates: PublicRate[], rounding: Rounding): string | null {
  if (from.code === to.code) return amountMinor;
  const rate = rateFor(from.code, to.code, rates);
  if (!rate) return null;
  try {
    return convertMinor({ amountMinor: BigInt(amountMinor), fromDecimals: from.decimals, toDecimals: to.decimals, rate, rounding }).toString();
  } catch {
    return null;
  }
}

/** "12.5" → minor units, or null when the text is not a plain decimal number. */
export function parseDecimalToMinor(text: string, decimals: number): bigint | null {
  const v = text.trim().replace(',', '.');
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(v)) return null;
  const [w = '0', f = ''] = v.split('.');
  return BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, '0').slice(0, decimals) || '0');
}

export function minorToPlain(minor: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const frac = (minor % unit).toString().padStart(decimals, '0');
  return decimals > 0 ? `${minor / unit}.${frac}` : `${minor}`;
}
