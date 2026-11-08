import type { CurrencyConfig } from '../src/types.ts';

export const TND: CurrencyConfig = {
  code: 'TND',
  decimals: 3,
  displayDecimals: 2,
  display: {
    default: { symbol: 'TND', placement: 'suffix', spacing: true },
    fr: { symbol: 'DT', placement: 'suffix', spacing: true },
    ar: { symbol: 'د.ت', placement: 'suffix', spacing: true },
  },
};

export const EUR: CurrencyConfig = {
  code: 'EUR',
  decimals: 2,
  display: {
    default: { symbol: '€', placement: 'prefix', spacing: false },
    fr: { symbol: '€', placement: 'suffix', spacing: true },
    ar: { symbol: '€', placement: 'suffix', spacing: true },
  },
};

export const USD: CurrencyConfig = {
  code: 'USD',
  decimals: 2,
  display: {
    default: { symbol: '$', placement: 'prefix', spacing: false },
    fr: { symbol: '$', placement: 'suffix', spacing: true },
  },
};

export const JPY: CurrencyConfig = {
  code: 'JPY',
  decimals: 0,
  display: { default: { symbol: '¥', placement: 'prefix', spacing: false } },
};

/** 8 decimals, like a crypto asset: proves the engine is not tied to 2 or 3 decimals. */
export const BTC: CurrencyConfig = {
  code: 'BTC',
  decimals: 8,
  display: { default: { symbol: 'BTC', placement: 'suffix', spacing: true } },
};

/** Tiny deterministic PRNG so "random" tests are reproducible. Test data only, never money logic. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomBigInt(next: () => number, bound: bigint): bigint {
  // uniform-enough value in [-bound, bound] built from 32-bit chunks
  const hi = BigInt(Math.floor(next() * 4294967296));
  const lo = BigInt(Math.floor(next() * 4294967296));
  const raw = (hi << 32n) | lo;
  return (raw % (2n * bound + 1n)) - bound;
}
