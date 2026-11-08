import assert from 'node:assert/strict';
import { test } from 'node:test';
import { payoutOf, totalOdds } from '../src/services/bet-math.ts';
import { decide, parseOdds, parseResults, toOddsX100 } from '../src/services/football-data.ts';

const cfg = { footballOddsMarginPercent: 0, footballBookmakerId: 0 };

test('payout of a single bet is stake x odds, rounded down', () => {
  assert.equal(payoutOf(1000n, [210]), 2100n);
  assert.equal(payoutOf(333n, [150]), 499n);
});

test('payout of an accumulator multiplies every price exactly', () => {
  assert.equal(payoutOf(10_000n, [200, 150, 300]), 90_000n);
  assert.equal(totalOdds([200, 150, 300]), '9.0000');
  assert.equal(totalOdds([210]), '2.1000');
});

test('odds: margin is taken off and the price never drops below 1.01', () => {
  assert.equal(toOddsX100('2.00', 0), 200);
  assert.equal(toOddsX100('2.00', 5), 190);
  assert.equal(toOddsX100('1.02', 30), 101);
  assert.equal(toOddsX100('abc', 0), null);
  assert.equal(toOddsX100('1.00', 0), null);
});

test('odds feed: reads Match Winner and prefers the configured bookmaker', () => {
  const body = {
    response: [
      {
        fixture: { id: 77 },
        bookmakers: [
          { id: 1, bets: [{ id: 1, values: [{ value: 'Home', odd: '2.00' }, { value: 'Draw', odd: '3.00' }, { value: 'Away', odd: '4.00' }] }] },
          { id: 8, bets: [{ id: 1, values: [{ value: 'Home', odd: '2.10' }, { value: 'Draw', odd: '3.10' }, { value: 'Away', odd: '3.90' }] }] },
        ],
      },
      { fixture: { id: 78 }, bookmakers: [{ id: 1, bets: [{ id: 5, values: [] }] }] },
    ],
  };
  assert.deepEqual(parseOdds(body, cfg).get(77), { home: 200, draw: 300, away: 400 });
  assert.deepEqual(parseOdds(body, { ...cfg, footballBookmakerId: 8 }).get(77), { home: 210, draw: 310, away: 390 });
  assert.equal(parseOdds(body, cfg).has(78), false);
});

const result = (status: string, h: number | null, a: number | null, kickoff = '2026-01-01T12:00:00Z') => ({ id: 1, status, kickoff, homeGoals: h, awayGoals: a });

test('settlement: finished matches use the 90 minute score', () => {
  assert.deepEqual(decide(result('FT', 2, 1)), { kind: 'settled', winner: 'home' });
  assert.deepEqual(decide(result('FT', 0, 3)), { kind: 'settled', winner: 'away' });
  assert.deepEqual(decide(result('PEN', 1, 1)), { kind: 'settled', winner: 'draw' });
});

test('settlement: unfinished matches wait, cancelled matches void, old postponed matches void', () => {
  assert.deepEqual(decide(result('2H', 1, 0)), { kind: 'wait' });
  assert.deepEqual(decide(result('NS', null, null)), { kind: 'wait' });
  assert.deepEqual(decide(result('CANC', null, null)), { kind: 'void' });
  const now = Date.parse('2026-01-02T12:00:00Z');
  assert.deepEqual(decide(result('PST', null, null), now), { kind: 'wait' });
  assert.deepEqual(decide(result('PST', null, null), Date.parse('2026-01-05T12:00:00Z')), { kind: 'void' });
});

test('results: the full-time score wins over the live goals', () => {
  const [r] = parseResults({ response: [{ fixture: { id: 5, date: 'x', status: { short: 'AET' } }, goals: { home: 3, away: 2 }, score: { fulltime: { home: 1, away: 1 } } }] });
  assert.deepEqual(r, { id: 5, status: 'AET', kickoff: 'x', homeGoals: 1, awayGoals: 1 });
});
