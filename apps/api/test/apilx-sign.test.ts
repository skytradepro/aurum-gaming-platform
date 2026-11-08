import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { APILX_SIGN, apilxSign } from '../src/services/apilx-sign.ts';

describe('API LX sign', () => {
  it('matches the Pragmatic Postman sample', () => {
    const body = {
      agentID: 'Partner01',
      userID: 'Player01',
      amount: 12.3,
      transactionID: '474e1a293c2f4e7ab122c52d68423fcb',
      roundID: 'ab9c15f2efdd46278e4a56b303127234',
    };
    const msg = APILX_SIGN.withdraw(body);
    assert.equal(msg, 'Partner01Player0112.30474e1a293c2f4e7ab122c52d68423fcbab9c15f2efdd46278e4a56b303127234');
    const sign = apilxSign('1234567890', msg);
    assert.equal(sign, '475D834ACC3AB61D7DF4EA42751C6275387BC1787A098D2D0E091698D9BF2043');
  });
});
