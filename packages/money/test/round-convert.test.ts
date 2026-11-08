import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAX_MINOR_UNITS, MoneyError, convertMinor, divRound, parseRate } from '../src/index.ts';
import type { RoundingMode } from '../src/index.ts';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyError) return error.code;
    throw error;
  }
  return 'no-error';
}

describe('divRound', () => {
  const table: Array<[bigint, bigint, Record<RoundingMode, bigint>]> = [
    [5n, 2n, { 'half-up': 3n, 'half-even': 2n, down: 2n, up: 3n }], //  2.5
    [7n, 2n, { 'half-up': 4n, 'half-even': 4n, down: 3n, up: 4n }], //  3.5
    [-5n, 2n, { 'half-up': -3n, 'half-even': -2n, down: -2n, up: -3n }], // -2.5
    [-7n, 2n, { 'half-up': -4n, 'half-even': -4n, down: -3n, up: -4n }], // -3.5
    [4n, 3n, { 'half-up': 1n, 'half-even': 1n, down: 1n, up: 2n }], //  1.33
    [5n, 3n, { 'half-up': 2n, 'half-even': 2n, down: 1n, up: 2n }], //  1.67
    [6n, 3n, { 'half-up': 2n, 'half-even': 2n, down: 2n, up: 2n }], //  exact
    [0n, 7n, { 'half-up': 0n, 'half-even': 0n, down: 0n, up: 0n }],
  ];

  for (const [numerator, denominator, expected] of table) {
    it(`${numerator} / ${denominator}`, () => {
      for (const mode of Object.keys(expected) as RoundingMode[]) {
        assert.equal(divRound(numerator, denominator, mode), expected[mode], `${numerator}/${denominator} ${mode}`);
      }
    });
  }

  it('normalises a negative denominator', () => {
    assert.equal(divRound(5n, -2n, 'down'), -2n);
    assert.equal(divRound(-5n, -2n, 'half-up'), 3n);
  });

  it('refuses to divide by zero', () => {
    assert.equal(codeOf(() => divRound(1n, 0n, 'down')), 'division_by_zero');
  });
});

describe('parseRate', () => {
  it('parses decimal rates into exact fractions', () => {
    assert.deepEqual(parseRate('3.4'), { numerator: 34n, denominator: 10n });
    assert.deepEqual(parseRate('1'), { numerator: 1n, denominator: 1n });
    assert.deepEqual(parseRate('0.000000000001'), { numerator: 1n, denominator: 1000000000000n });
  });

  it('rejects anything that is not a positive decimal with at most 12 decimals', () => {
    for (const bad of ['', '0', '0.0', '-1', '1e3', '1,5', '.5', '5.', 'abc', '1.1234567890123', ' 1']) {
      assert.equal(codeOf(() => parseRate(bad)), 'invalid_rate', `should reject ${JSON.stringify(bad)}`);
    }
    assert.equal(codeOf(() => parseRate(3.4 as unknown as string)), 'invalid_rate');
  });
});

describe('convertMinor', () => {
  it('converts exactly when the result has no remainder (100.00 EUR at 3.4 = 340.000 TND)', () => {
    assert.equal(convertMinor({ amountMinor: 10000n, fromDecimals: 2, toDecimals: 3, rate: '3.4' }), 340000n);
  });

  it('rounds once, with the stated rule (12.34 EUR at 3.45678 = 42.6566652 TND)', () => {
    const base = { amountMinor: 1234n, fromDecimals: 2, toDecimals: 3, rate: '3.45678' };
    assert.equal(convertMinor(base), 42657n); // default half-up
    assert.equal(convertMinor({ ...base, rounding: 'down' }), 42656n);
    assert.equal(convertMinor({ ...base, rounding: 'up' }), 42657n);
    assert.equal(convertMinor({ ...base, rounding: 'half-even' }), 42657n);
  });

  it('handles exact ties according to the rule (5 JPY at 0.005 = 0.025 EUR)', () => {
    const base = { amountMinor: 5n, fromDecimals: 0, toDecimals: 2, rate: '0.005' };
    assert.equal(convertMinor({ ...base, rounding: 'half-up' }), 3n);
    assert.equal(convertMinor({ ...base, rounding: 'half-even' }), 2n);
    assert.equal(convertMinor({ ...base, rounding: 'down' }), 2n);
    assert.equal(convertMinor({ ...base, rounding: 'up' }), 3n);
  });

  it('is symmetric for negative amounts', () => {
    const base = { fromDecimals: 0, toDecimals: 2, rate: '0.005' };
    assert.equal(convertMinor({ ...base, amountMinor: -5n }), -3n);
    assert.equal(convertMinor({ ...base, amountMinor: 5n }), 3n);
  });

  it('works between currencies with different precisions in both directions', () => {
    // 1.000 TND -> JPY (0 decimals) at 47.5 = 47.5 JPY -> 48 (half-up)
    assert.equal(convertMinor({ amountMinor: 1000n, fromDecimals: 3, toDecimals: 0, rate: '47.5' }), 48n);
    // 0.00000001 BTC (1 sat) at 65000.5 EUR/BTC = 0.000650005 EUR -> 0.00 EUR (half-up at 2 decimals)
    assert.equal(convertMinor({ amountMinor: 1n, fromDecimals: 8, toDecimals: 2, rate: '65000.5' }), 0n);
  });

  it('rejects results outside the supported range and bad rates', () => {
    assert.equal(codeOf(() => convertMinor({ amountMinor: MAX_MINOR_UNITS, fromDecimals: 0, toDecimals: 0, rate: '1000' })), 'out_of_range');
    assert.equal(codeOf(() => convertMinor({ amountMinor: 1n, fromDecimals: 2, toDecimals: 2, rate: '0' })), 'invalid_rate');
    assert.equal(codeOf(() => convertMinor({ amountMinor: 1n, fromDecimals: 2, toDecimals: 9, rate: '1' })), 'invalid_decimals');
  });
});
