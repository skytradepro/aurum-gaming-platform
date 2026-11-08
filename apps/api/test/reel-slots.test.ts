import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BIG_BASS_CONFIG, BIG_BASS_FISH, CHILLI_HEAT_CONFIG, GAME_MAX_MULTIPLIER, RS_CELLS, ULTIMATE_STRIKER_CONFIG, reelSlotLineWins, reelSlotRound } from '@aurum/shared';
import type { ReelSlotConfig, RsRand } from '@aurum/shared';

/** Grid from 3 rows of 5 symbols (index = row * 5 + reel). */
const g = (rows: number[][]): number[] => rows.flat();

/** A random source that replays fixed numbers, then zeros. */
function seq(values: number[]): RsRand {
  let i = 0;
  return (n) => (values[i++] ?? 0) % n;
}

/** Weighted cell: the first random number that lands on `symbol`. */
function pick(cfg: ReelSlotConfig, symbol: number): number {
  const w = cfg.weights ?? [];
  return w.slice(0, symbol).reduce((a, b) => a + b, 0);
}

test('line wins: left to right, WILD stands in, scatter stops the line', () => {
  const c = CHILLI_HEAT_CONFIG;
  const W = c.wild;
  const S = c.scatter;
  // middle line: pepper, WILD, pepper, fox, ... = 3 peppers
  const wins = reelSlotLineWins(c, g([[1, 2, 3, 4, 5], [0, W, 0, 1, 2], [3, 4, 5, 1, 2]]));
  const mid = wins.find((w) => w.line === 0);
  assert.ok(mid);
  assert.equal(mid.symbol, 0);
  assert.equal(mid.count, 3);
  assert.equal(mid.milli, c.pays[0]?.[0]);
  assert.deepEqual(mid.cells, [5, 6, 7]);
  // a scatter in the run ends it
  const cut = reelSlotLineWins(c, g([[1, 2, 3, 4, 5], [0, 0, S, 0, 0], [3, 4, 5, 1, 2]]));
  assert.equal(cut.find((w) => w.line === 0), undefined);
  // Chilli: a line of WILDs pays nothing; Striker: it pays the WILD
  const allWild = g([[1, 2, 3, 4, 5], [W, W, W, W, W], [3, 4, 5, 1, 2]]);
  assert.equal(reelSlotLineWins(c, allWild).find((w) => w.line === 0), undefined);
  const s = ULTIMATE_STRIKER_CONFIG;
  const sw = reelSlotLineWins(s, g([[1, 2, 3, 4, 5], [s.wild, s.wild, s.wild, s.wild, s.wild], [3, 4, 5, 1, 2]])).find((w) => w.line === 0);
  assert.equal(sw?.milli, s.pays[s.wild]?.[2]);
  // multiplier
  const doubled = reelSlotLineWins(c, g([[1, 2, 3, 4, 5], [0, W, 0, 1, 2], [3, 4, 5, 1, 2]]), 3).find((w) => w.line === 0);
  assert.equal(doubled?.milli, (c.pays[0]?.[0] ?? 0) * 3);
});

test('Big Bass: a line that shows a scatter pays nothing; a line of WILDs pays as the fisherman', () => {
  const b = BIG_BASS_CONFIG;
  const W = b.wild;
  const blocked = reelSlotLineWins(b, g([[6, 7, 8, 9, 10], [2, 2, 2, 2, b.scatter], [6, 7, 8, 9, 10]]));
  assert.equal(blocked.find((w) => w.line === 0), undefined);
  const wilds = reelSlotLineWins(b, g([[6, 7, 8, 9, 10], [W, W, W, 3, 4], [6, 7, 8, 9, 10]])).find((w) => w.line === 0);
  assert.equal(wilds?.symbol, 3);
  const pure = reelSlotLineWins(b, g([[6, 7, 8, 9, 10], [W, W, W, W, W], [6, 7, 8, 9, 10]])).find((w) => w.line === 0);
  assert.equal(pure?.symbol, 0);
  assert.equal(pure?.milli, b.pays[0]?.[2]);
});

test('Chilli Hot Wins: 3 trumpets give nothing, 4 or 5 give 5 free spins without a stake', () => {
  const c = CHILLI_HEAT_CONFIG;
  const sc = pick(c, c.scatter);
  const lo = pick(c, 5); // sun
  const three = reelSlotRound(c, (spin) => (spin === 0 ? seq([sc, sc, sc, ...new Array<number>(12).fill(lo)]) : seq([])));
  assert.equal(three.base.scatters.length, 3);
  assert.equal(three.free.length, 0);
  for (const n of [4, 5]) {
    const r = reelSlotRound(c, (spin) => (spin === 0 ? seq([...new Array<number>(n).fill(sc), ...new Array<number>(RS_CELLS - n).fill(lo)]) : seq([])));
    assert.equal(r.base.scatters.length, n);
    assert.equal(r.base.award, 5);
    assert.equal(r.free.length, 5);
    assert.equal(r.free.at(-1)?.left, 0);
  }
});

test('Ultimate Striker: free spins start at x2, new stadiums add spins and raise the multiplier, 2 WILDs double', () => {
  const s = ULTIMATE_STRIKER_CONFIG;
  const sc = pick(s, s.scatter);
  const wild = pick(s, s.wild);
  const ball = pick(s, 0);
  const crown = pick(s, 5);
  // free spin 1: 3 stadiums again (retrigger); free spin 2: balls on the middle line and 2 WILDs elsewhere
  const r = reelSlotRound(s, (spin) => {
    if (spin === 0) return seq([sc, sc, sc, ...new Array<number>(12).fill(crown)]);
    if (spin === 1) return seq([sc, sc, sc, ...new Array<number>(12).fill(crown)]);
    if (spin === 2) return seq([crown, crown, crown, crown, crown, ball, ball, ball, crown, crown, wild, wild, crown, crown, crown]);
    return seq(new Array<number>(RS_CELLS).fill(ball));
  });
  assert.equal(r.base.award, 5);
  assert.equal(r.free[0]?.mult, 2);
  assert.equal(r.free[0]?.award, 5);
  assert.equal(r.free.length, 10);
  const second = r.free[1];
  assert.ok(second);
  assert.equal(second.mult, 3);
  assert.equal(second.boost, 2);
  const lines = second.wins.reduce((a, w) => a + w.milli, 0);
  assert.equal(second.milli, lines * 2);
});

test('Big Bass: 2 scatters give nothing, 3 or more give 10 free spins without a stake', () => {
  const b = BIG_BASS_CONFIG;
  const strips = b.strips ?? [];
  const at = (reel: number, symbol: number, row = 0) => {
    const strip = strips[reel] ?? [];
    return (strip.indexOf(symbol) - row + strip.length) % strip.length;
  };
  const sc = b.scatter;
  const two = reelSlotRound(b, (spin) => (spin === 0 ? seq([at(0, sc), at(1, sc), at(2, 2), at(3, 3), at(4, 1), 0]) : seq([])));
  assert.equal(two.base.scatters.length, 2);
  assert.equal(two.free.length, 0);
  const three = reelSlotRound(b, (spin) => (spin === 0 ? seq([at(0, sc), at(1, sc), at(2, sc), at(3, 3), at(4, 2), 0]) : seq(new Array<number>(RS_CELLS).fill(0))));
  assert.equal(three.base.scatters.length, 3);
  assert.ok(three.base.award >= 10);
  assert.ok(three.free.length >= 10);
  // every cash fish on the reels shows a prize
  assert.equal(three.base.values.length, three.base.grid.filter((s) => s === 1).length);
});

test('Big Bass: the fisherman collects the cash fish in the free spins; levels add spins and a multiplier', () => {
  const b = BIG_BASS_CONFIG;
  const strips = b.strips ?? [];
  const at = (reel: number, symbol: number, row = 0) => {
    const strip = strips[reel] ?? [];
    return (strip.indexOf(symbol) - row + strip.length) % strip.length;
  };
  // paid spin: 4 scatters on reels 1-4 (fisherman on reel 5 row 0, cash fish elsewhere)
  const base = [at(0, b.scatter), at(1, b.scatter), at(2, b.scatter), at(3, b.scatter), at(4, 0)];
  const r = reelSlotRound(b, (spin) => (spin === 0 ? seq([...base, 0]) : seq([1, 1, 1, 1, 1, 0, 0, 0])));
  assert.equal(r.base.award >= 15, true); // 4 scatters: 15 free spins
  assert.equal(r.base.fishermen.length >= 1, true);
  assert.equal(r.base.fish.length >= 1, true);
  assert.equal(r.base.fish[0]?.milli, BIG_BASS_FISH[0]); // first prize of the list, x1
  assert.equal(r.base.collected, r.base.fishermen.length);
  assert.equal(r.free.length >= 5, true);
  // the whole round never pays more than the game's highest win
  assert.equal(r.milli <= b.capX * 1000, true);
  assert.equal(GAME_MAX_MULTIPLIER.bigbass, b.capX);
});

test('rounds are fixed by their random numbers', () => {
  for (const cfg of [CHILLI_HEAT_CONFIG, ULTIMATE_STRIKER_CONFIG, BIG_BASS_CONFIG]) {
    const make = () => {
      let x = 7;
      return reelSlotRound(cfg, (spin) => (n) => {
        x = (x * 1103515245 + 12345 + spin) % 2147483648;
        return x % n;
      });
    };
    assert.deepEqual(make(), make());
  }
});
