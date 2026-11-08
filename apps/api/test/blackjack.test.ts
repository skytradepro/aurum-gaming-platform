import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BJ_SHOE_SIZE, GAME_MAX_MULTIPLIER, bjActions, bjApply, bjPoints, bjSettle, bjShoe, bjStart } from '@aurum/shared';

/** Card ids: rank r (1 = Ace .. 13 = King) of spades is r - 1. */
const A = 0;
const TWO = 1;
const FIVE = 4;
const SIX = 5;
const SEVEN = 6;
const EIGHT = 7;
const NINE = 8;
const TEN = 9;
const KING = 12;

/** A shoe that deals these cards first (player, dealer, player, dealer, then the next ones). */
const shoeOf = (...cards: number[]): number[] => [...cards, ...new Array<number>(40).fill(TWO)];

test('points: Aces count 11 when they can, J Q K count 10', () => {
  assert.deepEqual(bjPoints([A, SIX]), { total: 17, soft: true });
  assert.deepEqual(bjPoints([A, SIX, TEN]), { total: 17, soft: false });
  assert.deepEqual(bjPoints([A, A, NINE]), { total: 21, soft: true });
  assert.deepEqual(bjPoints([KING, 11, 10]), { total: 30, soft: false });
});

test('the shoe holds 6 full decks, shuffled the same way for the same numbers', () => {
  let x = 9;
  const rand = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x;
  };
  const shoe = bjShoe((n) => rand() % n);
  assert.equal(shoe.length, BJ_SHOE_SIZE);
  for (let c = 0; c < 52; c += 1) assert.equal(shoe.filter((s) => s === c).length, 6);
  x = 9;
  assert.deepEqual(bjShoe((n) => rand() % n), shoe);
});

test('a blackjack pays 3 to 2 at once; against a dealer blackjack it is a push', () => {
  const bj = bjStart(shoeOf(A, NINE, KING, SEVEN));
  assert.equal(bj.phase, 'done');
  assert.deepEqual(bjSettle(bj), [{ outcome: 'blackjack', halves: 5 }]);
  const both = bjStart(shoeOf(A, A, KING, KING));
  assert.equal(both.phase, 'done');
  assert.deepEqual(bjSettle(both), [{ outcome: 'push', halves: 2 }]);
  // dealer blackjack (Ace up) ends the hand: the player loses his bet only
  const lose = bjStart(shoeOf(TEN, A, NINE, KING));
  assert.equal(lose.phase, 'done');
  assert.deepEqual(bjSettle(lose), [{ outcome: 'lose', halves: 0 }]);
});

test('hit, stand, bust; the dealer draws to 17 and stands on soft 17', () => {
  // player 10+6, dealer 9 + 7 (16): player stands, dealer draws a 2 -> 18, player loses
  const shoe = shoeOf(TEN, NINE, SIX, SEVEN);
  let s = bjStart(shoe);
  assert.deepEqual(bjActions(s), ['hit', 'stand', 'double']);
  s = bjApply(s, 'stand', shoe);
  assert.equal(s.phase, 'done');
  assert.equal(bjPoints(s.dealer).total, 18);
  assert.deepEqual(bjSettle(s), [{ outcome: 'lose', halves: 0 }]);
  // a bust ends the hand and the dealer does not draw
  const shoe2 = [TEN, NINE, SIX, SEVEN, KING, TWO];
  let b = bjStart(shoe2);
  b = bjApply(b, 'hit', shoe2);
  assert.equal(b.phase, 'done');
  assert.equal(b.dealer.length, 2);
  assert.deepEqual(bjSettle(b), [{ outcome: 'bust', halves: 0 }]);
  // dealer soft 17 (A + 6) stands
  const shoe3 = [TEN, A, NINE, SIX];
  const st = bjApply(bjStart(shoe3), 'stand', shoe3);
  assert.deepEqual(st.dealer, [A, SIX]);
  assert.deepEqual(bjSettle(st), [{ outcome: 'win', halves: 4 }]);
});

test('double: one card, two bets; split: two hands, split Aces get one card each', () => {
  // 6+5 = 11, double, draws a 10 -> 21; dealer 9+7 draws 2 -> 18; win on 2 units = 8 halves
  const shoe = [SIX, NINE, FIVE, SEVEN, TEN, TWO];
  const d = bjApply(bjStart(shoe), 'double', shoe);
  assert.equal(d.phase, 'done');
  assert.equal(d.hands[0]?.units, 2);
  assert.deepEqual(bjSettle(d), [{ outcome: 'win', halves: 8 }]);
  // 8 8 split: each hand gets a card and is played on its own
  const shoe2 = [EIGHT, TEN, EIGHT, SEVEN, TEN, NINE];
  let s = bjApply(bjStart(shoe2), 'split', shoe2);
  assert.equal(s.hands.length, 2);
  assert.equal(s.active, 0);
  assert.deepEqual(bjActions(s), ['hit', 'stand', 'double']);
  s = bjApply(s, 'stand', shoe2);
  assert.equal(s.active, 1);
  s = bjApply(s, 'stand', shoe2);
  assert.equal(s.phase, 'done');
  // 18 and 17 against the dealer's 17
  assert.deepEqual(bjSettle(s).map((r) => r.outcome), ['win', 'push']);
  // split Aces: one card each, an Ace + 10 after a split is 21, not a blackjack
  const shoe3 = [A, NINE, A, SEVEN, KING, FIVE, TEN];
  const sa = bjApply(bjStart(shoe3), 'split', shoe3);
  assert.equal(sa.phase, 'done');
  // the dealer's 16 draws a 10 and busts: both hands win 1 to 1 (the A + K pays 4 halves, not a blackjack's 5)
  assert.deepEqual(bjSettle(sa), [
    { outcome: 'win', halves: 4 },
    { outcome: 'win', halves: 4 },
  ]);
  assert.equal(GAME_MAX_MULTIPLIER.blackjack, 8);
});

test('moves that are not allowed are refused', () => {
  const shoe = shoeOf(TEN, NINE, SIX, SEVEN);
  const s = bjStart(shoe);
  assert.throws(() => bjApply(s, 'split', shoe));
  const done = bjApply(s, 'stand', shoe);
  assert.deepEqual(bjActions(done), []);
  assert.throws(() => bjApply(done, 'hit', shoe));
});
