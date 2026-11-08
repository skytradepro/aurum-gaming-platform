import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_MINOR_UNITS,
  MoneyError,
  add,
  compare,
  fromDTO,
  isZero,
  money,
  negate,
  sub,
  sum,
  toDTO,
  totalsByCurrency,
  zero,
} from '../src/index.ts';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof MoneyError) return error.code;
    throw error;
  }
  return 'no-error';
}

describe('money()', () => {
  it('creates immutable values', () => {
    const value = money(500n, 'EUR');
    assert.equal(Object.isFrozen(value), true);
    assert.equal(value.amountMinor, 500n);
    assert.equal(value.currency, 'EUR');
  });

  it('rejects JS numbers, bad currency codes and out of range amounts', () => {
    assert.equal(codeOf(() => money(5 as unknown as bigint, 'EUR')), 'invalid_amount');
    assert.equal(codeOf(() => money(0.1 as unknown as bigint, 'EUR')), 'invalid_amount');
    for (const bad of ['eur', 'EURO', 'EU', '', 'E1R']) {
      assert.equal(codeOf(() => money(1n, bad)), 'invalid_currency', `should reject ${JSON.stringify(bad)}`);
    }
    assert.equal(codeOf(() => money(MAX_MINOR_UNITS + 1n, 'EUR')), 'out_of_range');
    assert.equal(money(MAX_MINOR_UNITS, 'EUR').amountMinor, MAX_MINOR_UNITS);
  });
});

describe('arithmetic', () => {
  it('adds, subtracts, negates and compares inside one currency', () => {
    const a = money(1050n, 'USD');
    const b = money(250n, 'USD');
    assert.equal(add(a, b).amountMinor, 1300n);
    assert.equal(sub(b, a).amountMinor, -800n);
    assert.equal(negate(a).amountMinor, -1050n);
    assert.equal(compare(a, b), 1);
    assert.equal(compare(b, a), -1);
    assert.equal(compare(a, money(1050n, 'USD')), 0);
    assert.equal(isZero(zero('USD')), true);
  });

  it('never mixes currencies', () => {
    const eur = money(100n, 'EUR');
    const usd = money(100n, 'USD');
    assert.equal(codeOf(() => add(eur, usd)), 'currency_mismatch');
    assert.equal(codeOf(() => sub(eur, usd)), 'currency_mismatch');
    assert.equal(codeOf(() => compare(eur, usd)), 'currency_mismatch');
    assert.equal(codeOf(() => sum([eur, usd], 'EUR')), 'currency_mismatch');
  });

  it('sums lists exactly, including the empty list', () => {
    const list = Array.from({ length: 1000 }, () => money(1n, 'TND'));
    assert.equal(sum(list, 'TND').amountMinor, 1000n);
    assert.equal(sum([], 'TND').amountMinor, 0n);
  });

  it('refuses sums that could overflow a PostgreSQL BIGINT', () => {
    const big = Array.from({ length: 9001 }, () => money(MAX_MINOR_UNITS, 'TND'));
    assert.equal(codeOf(() => sum(big, 'TND')), 'out_of_range');
  });

  it('totals per currency without merging them', () => {
    const totals = totalsByCurrency([money(100n, 'EUR'), money(250n, 'TND'), money(50n, 'EUR'), money(-10n, 'TND')]);
    assert.equal(totals.size, 2);
    assert.equal(totals.get('EUR'), 150n);
    assert.equal(totals.get('TND'), 240n);
  });
});

describe('DTO (JSON wire format)', () => {
  it('round-trips through JSON without losing precision', () => {
    const original = money(MAX_MINOR_UNITS - 1n, 'TND');
    const json = JSON.stringify(toDTO(original));
    assert.equal(json, '{"amountMinor":"999999999999999","currency":"TND"}');
    const parsed = fromDTO(JSON.parse(json));
    assert.equal(parsed.amountMinor, original.amountMinor);
    assert.equal(parsed.currency, 'TND');
  });

  it('rejects malformed input from the network', () => {
    assert.equal(codeOf(() => fromDTO(null)), 'invalid_amount');
    assert.equal(codeOf(() => fromDTO('5')), 'invalid_amount');
    assert.equal(codeOf(() => fromDTO({ amountMinor: 5, currency: 'EUR' })), 'invalid_amount');
    assert.equal(codeOf(() => fromDTO({ amountMinor: '12.5', currency: 'EUR' })), 'invalid_amount');
    assert.equal(codeOf(() => fromDTO({ amountMinor: '', currency: 'EUR' })), 'invalid_amount');
    assert.equal(codeOf(() => fromDTO({ amountMinor: '99999999999999999999', currency: 'EUR' })), 'invalid_amount');
    assert.equal(codeOf(() => fromDTO({ amountMinor: '10000000000000000', currency: 'EUR' })), 'out_of_range');
    assert.equal(codeOf(() => fromDTO({ amountMinor: '5', currency: 'euro' })), 'invalid_currency');
    assert.equal(codeOf(() => fromDTO({ amountMinor: '5' })), 'invalid_currency');
  });
});
