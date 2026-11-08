import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_MINOR_UNITS,
  MoneyError,
  minorToDecimalString,
  normalizeAmountInput,
  parseAmountInput,
  parseDecimalToMinor,
} from '../src/index.ts';
import { mulberry32, randomBigInt } from './fixtures.ts';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyError) return error.code;
    throw error;
  }
  return 'no-error';
}

describe('parseDecimalToMinor (strict)', () => {
  it('parses whole and fractional amounts exactly', () => {
    assert.equal(parseDecimalToMinor('12.5', 3), 12500n);
    assert.equal(parseDecimalToMinor('0', 2), 0n);
    assert.equal(parseDecimalToMinor('0.001', 3), 1n);
    assert.equal(parseDecimalToMinor('007.50', 2), 750n);
    assert.equal(parseDecimalToMinor('5', 0), 5n);
    assert.equal(parseDecimalToMinor('-0.05', 2), -5n);
    assert.equal(parseDecimalToMinor('-0', 2), 0n);
    assert.equal(parseDecimalToMinor('1.23456789', 8), 123456789n);
  });

  it('never rounds: extra decimals are an error', () => {
    assert.equal(codeOf(() => parseDecimalToMinor('1.2345', 3)), 'too_many_decimals');
    assert.equal(codeOf(() => parseDecimalToMinor('1.5', 0)), 'too_many_decimals');
    assert.equal(codeOf(() => parseDecimalToMinor('0.001', 2)), 'too_many_decimals');
  });

  it('rejects everything that is not a canonical decimal string', () => {
    for (const bad of ['', ' 1', '1 ', '1e3', '1E3', 'NaN', 'Infinity', '0x10', '1,5', '.5', '5.', '--1', '+1', '1.2.3', '١٢٣', '1_000', '١.٥']) {
      assert.equal(codeOf(() => parseDecimalToMinor(bad, 3)), 'invalid_amount', `should reject ${JSON.stringify(bad)}`);
    }
  });

  it('rejects non-strings and invalid decimals', () => {
    assert.equal(codeOf(() => parseDecimalToMinor(12.5 as unknown as string, 2)), 'invalid_amount');
    assert.equal(codeOf(() => parseDecimalToMinor('1', 9)), 'invalid_decimals');
    assert.equal(codeOf(() => parseDecimalToMinor('1', -1)), 'invalid_decimals');
    assert.equal(codeOf(() => parseDecimalToMinor('1', 2.5)), 'invalid_decimals');
  });

  it('can forbid negatives', () => {
    assert.equal(codeOf(() => parseDecimalToMinor('-1', 2, { allowNegative: false })), 'negative_not_allowed');
    assert.equal(parseDecimalToMinor('1', 2, { allowNegative: false }), 100n);
  });

  it('enforces the 10^15 minor-unit ceiling at the boundary', () => {
    assert.equal(parseDecimalToMinor('1000000000000.000', 3), MAX_MINOR_UNITS);
    assert.equal(codeOf(() => parseDecimalToMinor('1000000000000.001', 3)), 'out_of_range');
    assert.equal(codeOf(() => parseDecimalToMinor('-1000000000000.001', 3)), 'out_of_range');
    assert.equal(codeOf(() => parseDecimalToMinor('9'.repeat(19), 0)), 'invalid_amount');
  });

  it('has no floating point drift (0.1 + 0.2 === 0.3)', () => {
    const sum = parseDecimalToMinor('0.1', 2) + parseDecimalToMinor('0.2', 2);
    assert.equal(sum, parseDecimalToMinor('0.3', 2));
    assert.notEqual(0.1 + 0.2, 0.3); // the JS number trap this package exists to avoid
  });
});

describe('minorToDecimalString', () => {
  it('always prints exactly `decimals` fraction digits', () => {
    assert.equal(minorToDecimalString(0n, 3), '0.000');
    assert.equal(minorToDecimalString(5n, 3), '0.005');
    assert.equal(minorToDecimalString(-5n, 2), '-0.05');
    assert.equal(minorToDecimalString(123456n, 0), '123456');
    assert.equal(minorToDecimalString(0n, 0), '0');
    assert.equal(minorToDecimalString(123456789n, 8), '1.23456789');
    assert.equal(minorToDecimalString(MAX_MINOR_UNITS, 3), '1000000000000.000');
  });

  it('round-trips 20,000 random amounts for every precision from 0 to 8 decimals', () => {
    const next = mulberry32(20261023);
    for (let i = 0; i < 20000; i++) {
      const decimals = i % 9;
      const minor = randomBigInt(next, MAX_MINOR_UNITS);
      const text = minorToDecimalString(minor, decimals);
      assert.equal(parseDecimalToMinor(text, decimals), minor, `${minor} @ ${decimals} -> ${text}`);
    }
  });
});

describe('normalizeAmountInput / parseAmountInput (what people type)', () => {
  it('accepts one decimal separator in any common spelling', () => {
    assert.equal(normalizeAmountInput('12,5'), '12.5');
    assert.equal(normalizeAmountInput('12.5'), '12.5');
    assert.equal(normalizeAmountInput('١٢٫٥'), '12.5');
    assert.equal(normalizeAmountInput('۱۲٫۵'), '12.5');
    assert.equal(normalizeAmountInput(' 7 '), '7');
    assert.equal(normalizeAmountInput('.5'), '0.5');
    assert.equal(normalizeAmountInput('5.'), '5');
  });

  it('refuses ambiguous thousands separators instead of guessing', () => {
    for (const bad of ['1,000.50', '1.000,50', '1 000', '1 000', '1 000', '1٬000', '12.5.1', '1,2,3']) {
      assert.equal(codeOf(() => normalizeAmountInput(bad)), 'ambiguous_separator', `should reject ${JSON.stringify(bad)}`);
    }
  });

  it('turns typed text into exact minor units', () => {
    assert.equal(parseAmountInput('12,500', 3), 12500n);
    assert.equal(parseAmountInput('٣٫٤٥', 2), 345n);
    assert.equal(parseAmountInput('100', 2, { allowNegative: false }), 10000n);
    assert.equal(codeOf(() => parseAmountInput('12,5555', 3)), 'too_many_decimals');
    assert.equal(codeOf(() => parseAmountInput('abc', 2)), 'invalid_amount');
  });
});
