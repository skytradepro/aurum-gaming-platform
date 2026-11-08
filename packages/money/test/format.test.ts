import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MoneyError,
  formatDecimalMinor,
  formatMoney,
  formatMoneyCompact,
  money,
  resolveLocale,
} from '../src/index.ts';
import { BTC, EUR, JPY, TND, USD } from './fixtures.ts';

const NBSP = ' ';
const NNBSP = ' ';

describe('resolveLocale', () => {
  it('maps regional tags to the supported base locale and falls back to en', () => {
    assert.equal(resolveLocale('fr-TN'), 'fr');
    assert.equal(resolveLocale('AR_tn'), 'ar');
    assert.equal(resolveLocale('en-GB'), 'en');
    assert.equal(resolveLocale('de'), 'en');
    assert.equal(resolveLocale(undefined), 'en');
  });
});

describe('formatMoney', () => {
  it('formats EUR per locale with the right separators and symbol placement', () => {
    const amount = money(123456789n, 'EUR');
    assert.equal(formatMoney(amount, EUR, 'en'), '€1,234,567.89');
    assert.equal(formatMoney(amount, EUR, 'fr'), `1${NNBSP}234${NNBSP}567,89${NBSP}€`);
    assert.equal(formatMoney(amount, EUR, 'ar'), `1,234,567.89${NBSP}€`);
  });

  it('uses the locale specific symbol for TND and shows full accounting precision by default', () => {
    const amount = money(12345678n, 'TND'); // 12,345.678
    assert.equal(formatMoney(amount, TND, 'en'), `12,345.678${NBSP}TND`);
    assert.equal(formatMoney(amount, TND, 'fr'), `12${NNBSP}345,678${NBSP}DT`);
    assert.equal(formatMoney(amount, TND, 'ar'), `12,345.678${NBSP}د.ت`);
  });

  it("'display' mode drops decimals for presentation only and never overstates a balance", () => {
    const amount = money(12345678n, 'TND'); // 12,345.678
    assert.equal(formatMoney(amount, TND, 'en', { mode: 'display' }), `12,345.67${NBSP}TND`);
    assert.equal(formatMoney(amount, TND, 'en', { mode: 'display', displayRounding: 'half-up' }), `12,345.68${NBSP}TND`);
    // currencies without displayDecimals are unaffected
    assert.equal(formatMoney(money(123456789n, 'EUR'), EUR, 'en', { mode: 'display' }), '€1,234,567.89');
  });

  it('handles signs without ever printing "-0"', () => {
    assert.equal(formatMoney(money(-5n, 'EUR'), EUR, 'en'), '-€0.05');
    assert.equal(formatMoney(money(-5n, 'EUR'), EUR, 'fr'), `-0,05${NBSP}€`);
    assert.equal(formatMoney(money(-4n, 'TND'), TND, 'en', { mode: 'display' }), `0.00${NBSP}TND`);
    assert.equal(formatMoney(money(500n, 'EUR'), EUR, 'en', { signDisplay: 'always' }), '+€5.00');
    assert.equal(formatMoney(money(0n, 'EUR'), EUR, 'en', { signDisplay: 'always' }), '€0.00');
  });

  it('supports 0 and 8 decimal currencies', () => {
    assert.equal(formatMoney(money(1234n, 'JPY'), JPY, 'en'), '¥1,234');
    assert.equal(formatMoney(money(123456789n, 'BTC'), BTC, 'en'), `1.23456789${NBSP}BTC`);
    assert.equal(formatMoney(money(1n, 'BTC'), BTC, 'fr'), `0.00000001${NBSP}BTC`.replace('.', ','));
  });

  it('can show the ISO code or no symbol at all', () => {
    assert.equal(formatMoney(money(123456n, 'EUR'), EUR, 'en', { symbol: 'code' }), `EUR${NBSP}1,234.56`);
    assert.equal(formatMoney(money(123456n, 'EUR'), EUR, 'en', { symbol: 'none' }), '1,234.56');
    assert.equal(formatMoney(money(123456n, 'USD'), USD, 'fr', { symbol: 'code' }), `1${NNBSP}234,56${NBSP}USD`);
  });

  it('can use Arabic-Indic digits for Arabic only', () => {
    const amount = money(123456789n, 'EUR');
    assert.equal(formatMoney(amount, EUR, 'ar', { digits: 'arab' }), `١٬٢٣٤٬٥٦٧٫٨٩${NBSP}€`);
    assert.equal(formatMoney(amount, EUR, 'en', { digits: 'arab' }), '€1,234,567.89');
  });

  it('refuses to format an amount with the wrong currency configuration', () => {
    assert.throws(
      () => formatMoney(money(1n, 'USD'), EUR, 'en'),
      (error: unknown) => error instanceof MoneyError && error.code === 'currency_mismatch',
    );
  });

  it('falls back to the default display rule when a locale has no override', () => {
    assert.equal(formatMoney(money(500n, 'USD'), USD, 'ar'), '$5.00');
    assert.equal(formatMoney(money(500n, 'USD'), USD, 'fr'), `5,00${NBSP}$`);
  });
});

describe('formatDecimalMinor', () => {
  it('formats plain numbers (counts, odds, percentages) with the locale separators', () => {
    assert.equal(formatDecimalMinor(123456789n, 2, 'en'), '1,234,567.89');
    assert.equal(formatDecimalMinor(123456789n, 2, 'fr'), `1${NNBSP}234${NNBSP}567,89`);
    assert.equal(formatDecimalMinor(123456789n, 2, 'en', { grouping: false }), '1234567.89');
    assert.equal(formatDecimalMinor(999n, 0, 'en'), '999');
    assert.equal(formatDecimalMinor(1000n, 0, 'en'), '1,000');
  });
});

describe('formatMoneyCompact (marketing widgets: always truncates)', () => {
  it('matches the compact style of the reference: 8K, 5.76K, 895.2, 1.25M', () => {
    assert.equal(formatMoneyCompact(money(5760123n, 'TND'), TND, 'en'), `5.76K${NBSP}TND`);
    assert.equal(formatMoneyCompact(money(8000000n, 'TND'), TND, 'en'), `8K${NBSP}TND`);
    assert.equal(formatMoneyCompact(money(895200n, 'TND'), TND, 'en'), `895.2${NBSP}TND`);
    assert.equal(formatMoneyCompact(money(767980n, 'TND'), TND, 'en'), `767.98${NBSP}TND`);
    assert.equal(formatMoneyCompact(money(125000000n, 'EUR'), EUR, 'en'), '€1.25M');
    assert.equal(formatMoneyCompact(money(50n, 'EUR'), EUR, 'en'), '€0.5');
  });

  it('never rounds up (1999.999 stays 1.99K)', () => {
    assert.equal(formatMoneyCompact(money(1999999n, 'TND'), TND, 'en'), `1.99K${NBSP}TND`);
  });

  it('uses locale separators and symbols', () => {
    assert.equal(formatMoneyCompact(money(5760123n, 'TND'), TND, 'fr'), `5,76K${NBSP}DT`);
    assert.equal(formatMoneyCompact(money(5760123n, 'TND'), TND, 'ar'), `5.76K${NBSP}د.ت`);
    assert.equal(formatMoneyCompact(money(5760123n, 'TND'), TND, 'ar', { digits: 'arab' }), `٥٫٧٦K${NBSP}د.ت`);
  });

  it('keeps the sign for real negatives and drops it for amounts that print as zero', () => {
    assert.equal(formatMoneyCompact(money(-5760123n, 'TND'), TND, 'en'), `-5.76K${NBSP}TND`);
    assert.equal(formatMoneyCompact(money(-4n, 'TND'), TND, 'en'), `0${NBSP}TND`);
  });
});
