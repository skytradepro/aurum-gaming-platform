import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseApilxGamelistResponse } from '../src/services/apilx-gamelist.ts';

describe('API LX gamelist parse', () => {
  it('reads gamelist array with mixed field names', () => {
    const json = {
      code: 0,
      data: [
        { gameid: 101, name: 'Sweet Bonanza', iconurl3: 'https://cdn.example/a.webp' },
        { gameID: 202, name: 'Gates of Olympus' },
      ],
    };
    const games = parseApilxGamelistResponse(json, 'pragmatic');
    assert.equal(games.length, 2);
    assert.equal(games[0]?.externalId, '101');
    assert.equal(games[0]?.image, 'https://cdn.example/a.webp');
    assert.equal(games[1]?.externalId, '202');
  });

  it('rejects non-zero provider codes', () => {
    assert.throws(() => parseApilxGamelistResponse({ code: 7, message: 'Invalid API Token' }, 'pragmatic'), /Invalid API Token/);
  });
});
