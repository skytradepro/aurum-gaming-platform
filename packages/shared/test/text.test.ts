import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ageOn,
  maskUsername,
  normalizeCallingCode,
  normalizeEmail,
  passwordProblem,
  toE164,
  todayUtc,
} from '../src/index.ts';

describe('phone numbers', () => {
  it('normalises calling codes', () => {
    assert.equal(normalizeCallingCode('+216'), '216');
    assert.equal(normalizeCallingCode('00216'), '216');
    assert.equal(normalizeCallingCode(' 33 '), '33');
    assert.equal(normalizeCallingCode('0'), null);
    assert.equal(normalizeCallingCode('abc'), null);
    assert.equal(normalizeCallingCode('12345'), null);
  });

  it('builds E.164 numbers', () => {
    assert.equal(toE164('+216', '20 123 456'), '+21620123456');
    assert.equal(toE164('216', '20-123-456'), '+21620123456');
    assert.equal(toE164('33', '06 12 34 56 78'), '+33612345678');
    assert.equal(toE164('1', '(415) 555-0132'), '+14155550132');
  });

  it('rejects impossible numbers', () => {
    assert.equal(toE164('216', '12'), null);
    assert.equal(toE164('216', 'abcdefgh'), null);
    assert.equal(toE164('216', '1234567890123456'), null);
    assert.equal(toE164('xx', '20123456'), null);
  });
});

describe('maskUsername', () => {
  it('shows only the first and the last character', () => {
    assert.equal(maskUsername('player123'), 'p****3');
    assert.equal(maskUsername('5xyz8'), '5****8');
    assert.equal(maskUsername('abc'), 'a****c');
    assert.equal(maskUsername('ab'), 'a****');
    assert.equal(maskUsername('a'), '****');
    assert.equal(maskUsername('😀x😀'), '😀****😀');
  });
});

describe('ageOn', () => {
  it('counts whole years', () => {
    assert.equal(ageOn('2008-10-23', '2026-10-23'), 18);
    assert.equal(ageOn('2008-10-24', '2026-10-23'), 17);
    assert.equal(ageOn('2000-02-29', '2026-02-28'), 25);
    assert.equal(ageOn('2000-02-29', '2026-03-01'), 26);
    assert.equal(ageOn('1990-12-31', '2026-01-01'), 35);
  });

  it('formats today in UTC', () => {
    assert.equal(todayUtc(new Date('2026-10-23T23:59:59Z')), '2026-10-23');
  });
});

describe('normalizeEmail', () => {
  it('lower-cases and trims', () => {
    assert.equal(normalizeEmail('  Foo.Bar@Example.COM '), 'foo.bar@example.com');
  });
});

describe('passwordProblem', () => {
  it('accepts a reasonable password', () => {
    assert.equal(passwordProblem('Sunny-Day-2026'), null);
    assert.equal(passwordProblem('كلمةسر12345'), null);
  });

  it('applies length and character rules', () => {
    assert.equal(passwordProblem('short1'), 'passwordTooShort');
    assert.equal(passwordProblem('onlyletterspassword'), 'passwordNeedsLetterAndDigit');
    assert.equal(passwordProblem('12345678901234'), 'passwordNeedsLetterAndDigit');
    assert.equal(passwordProblem(`a1${'x'.repeat(130)}`), 'tooLong');
  });

  it('refuses well-known weak passwords, in any case', () => {
    assert.equal(passwordProblem('Password123'), 'passwordTooCommon');
    assert.equal(passwordProblem('QWERTYUIOP1'), 'passwordTooCommon');
    assert.equal(passwordProblem('a'.repeat(9) + '1'), null);
    assert.equal(passwordProblem('1111111111'), 'passwordNeedsLetterAndDigit');
  });

  it('refuses passwords built from the username or the e-mail name', () => {
    assert.equal(passwordProblem('Blue-Falcon-77', { username: 'karim2026' }), null);
    assert.equal(passwordProblem('my-karim2026-pass', { username: 'karim2026' }), 'passwordContainsIdentity');
    assert.equal(passwordProblem('john.smith77', { email: 'john.smith77@example.com' }), 'passwordContainsIdentity');
    // short identities are ignored (too many false positives)
    assert.equal(passwordProblem('abcd-efgh-12', { username: 'abc' }), null);
  });
});
