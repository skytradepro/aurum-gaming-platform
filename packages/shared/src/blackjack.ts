/**
 * HANNIBAL Blackjack: classic rules, played over several requests (deal, then hit / stand / double / split).
 *
 * 6-deck shoe, shuffled once per hand from the server's random numbers. Dealer stands on all 17s and checks for
 * blackjack when his up card is an Ace or a 10. Blackjack pays 3 to 2, other wins 1 to 1, a tie gives the bet back.
 * Double on any first two cards (also after a split). One split per hand (two hands); split Aces get one card each.
 * A 21 made after a split is not a blackjack. No insurance, no surrender.
 *
 * Cards are numbers 0..51 (rank = cardRank, suit = cardSuit), the same as the other card games.
 */
/** Rank 1 (Ace) .. 13 (King) of a card 0..51, as cardRank in games.ts (kept here so the two files do not import each other). */
const rankOf = (card: number): number => (card % 13) + 1;

export const BJ_DECKS = 6;
export const BJ_SHOE_SIZE = BJ_DECKS * 52;
/** Return to player with the best play (simulated, see the test). */
export const BJ_RTP = 99.4;
/** Highest return of a hand for each unit of the first bet: split, both hands doubled and won (4 units back twice). */
export const BJ_CAP_X = 8;

export type BjAction = 'hit' | 'stand' | 'double' | 'split';
export const BJ_ACTIONS: readonly BjAction[] = ['hit', 'stand', 'double', 'split'];
export type BjOutcome = 'blackjack' | 'win' | 'push' | 'lose' | 'bust';

export interface BjHand {
  cards: number[];
  /** 1, or 2 after a double. */
  units: 1 | 2;
  done: boolean;
  /** Made by a split (a 21 is then not a blackjack). */
  split: boolean;
}

export interface BjState {
  /** Next card of the shoe. */
  pos: number;
  dealer: number[];
  hands: BjHand[];
  /** Hand being played. */
  active: number;
  phase: 'player' | 'done';
  /** Number of moves so far: a request for an older step is a repeat and changes nothing. */
  step: number;
}

export interface BjHandResult {
  outcome: BjOutcome;
  /** What the hand pays back, in halves of the first bet (blackjack on 1 unit = 5, win on 2 units = 8). */
  halves: number;
}

/** Value of one card: Ace 1 (or 11, see bjPoints), 2-10 face value, J Q K 10. */
export function bjCardValue(card: number): number {
  const r = rankOf(card);
  return r >= 10 ? 10 : r;
}

/** Best total of a hand; soft = an Ace still counts 11. */
export function bjPoints(cards: readonly number[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    const v = bjCardValue(c);
    total += v;
    if (v === 1) aces += 1;
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

export function bjIsBlackjack(cards: readonly number[], split = false): boolean {
  return !split && cards.length === 2 && bjPoints(cards).total === 21;
}

/**
 * The shoe of one hand: 6 decks shuffled (Fisher-Yates) with the round's random numbers.
 * draw(n, i) must give a fair number 0..n-1 for each index i.
 */
export function bjShoe(draw: (n: number, index: number) => number): number[] {
  const shoe = Array.from({ length: BJ_SHOE_SIZE }, (_, i) => i % 52);
  for (let i = BJ_SHOE_SIZE - 1; i > 0; i -= 1) {
    const j = draw(i + 1, BJ_SHOE_SIZE - 1 - i);
    const t = shoe[i] as number;
    shoe[i] = shoe[j] as number;
    shoe[j] = t;
  }
  return shoe;
}

const clone = (s: BjState): BjState => ({ ...s, dealer: [...s.dealer], hands: s.hands.map((h) => ({ ...h, cards: [...h.cards] })) });

function take(s: BjState, shoe: readonly number[]): number {
  const c = shoe[s.pos % shoe.length] as number;
  s.pos += 1;
  return c;
}

/** Dealer draws to 17 (stands on soft 17). */
function dealerPlays(s: BjState, shoe: readonly number[]): void {
  while (bjPoints(s.dealer).total < 17) s.dealer.push(take(s, shoe));
}

/** After the player's last hand: the dealer plays when a hand is still alive, then the hand is over. */
function finish(s: BjState, shoe: readonly number[]): void {
  const alive = s.hands.some((h) => bjPoints(h.cards).total <= 21 && !bjIsBlackjack(h.cards, h.split));
  if (alive) dealerPlays(s, shoe);
  s.phase = 'done';
}

/** Moves to the next hand that still needs a decision, or ends the player's turn. */
function advance(s: BjState, shoe: readonly number[]): void {
  while (s.active < s.hands.length && (s.hands[s.active] as BjHand).done) s.active += 1;
  if (s.active >= s.hands.length) {
    s.active = s.hands.length - 1;
    finish(s, shoe);
  }
}

/** Deals a new hand: player, dealer, player, dealer (hole card). Blackjacks end the hand at once. */
export function bjStart(shoe: readonly number[]): BjState {
  const s: BjState = { pos: 0, dealer: [], hands: [{ cards: [], units: 1, done: false, split: false }], active: 0, phase: 'player', step: 0 };
  const hand = s.hands[0] as BjHand;
  hand.cards.push(take(s, shoe));
  s.dealer.push(take(s, shoe));
  hand.cards.push(take(s, shoe));
  s.dealer.push(take(s, shoe));
  const upTen = bjCardValue(s.dealer[0] as number) === 10 || bjCardValue(s.dealer[0] as number) === 1;
  const dealerBj = upTen && bjIsBlackjack(s.dealer);
  if (dealerBj || bjIsBlackjack(hand.cards)) {
    hand.done = true;
    s.phase = 'done';
  }
  return s;
}

/** What the player may do now. */
export function bjActions(s: BjState): BjAction[] {
  if (s.phase !== 'player') return [];
  const h = s.hands[s.active];
  if (!h || h.done) return [];
  const out: BjAction[] = ['hit', 'stand'];
  const two = h.cards.length === 2;
  const splitAces = h.split && bjCardValue(h.cards[0] as number) === 1;
  if (two && !splitAces) out.push('double');
  if (two && s.hands.length === 1 && bjCardValue(h.cards[0] as number) === bjCardValue(h.cards[1] as number)) out.push('split');
  return out;
}

/** Plays one move. Throws when the move is not allowed now. */
export function bjApply(state: BjState, action: BjAction, shoe: readonly number[]): BjState {
  if (!bjActions(state).includes(action)) throw new Error(`blackjack: ${action} not allowed`);
  const s = clone(state);
  s.step += 1;
  const h = s.hands[s.active] as BjHand;
  if (action === 'hit') {
    h.cards.push(take(s, shoe));
    if (bjPoints(h.cards).total >= 21) h.done = true;
  } else if (action === 'stand') {
    h.done = true;
  } else if (action === 'double') {
    h.units = 2;
    h.cards.push(take(s, shoe));
    h.done = true;
  } else {
    const second: BjHand = { cards: [h.cards.pop() as number], units: 1, done: false, split: true };
    h.split = true;
    s.hands.push(second);
    h.cards.push(take(s, shoe));
    second.cards.push(take(s, shoe));
    // split Aces: one card each, nothing more
    if (bjCardValue(h.cards[0] as number) === 1) {
      h.done = true;
      second.done = true;
    }
    for (const x of s.hands) if (bjPoints(x.cards).total === 21) x.done = true;
  }
  advance(s, shoe);
  return s;
}

/** Result of every hand once the round is over. */
export function bjSettle(s: BjState): BjHandResult[] {
  const d = bjPoints(s.dealer).total;
  const dealerBj = bjIsBlackjack(s.dealer);
  return s.hands.map((h) => {
    const p = bjPoints(h.cards).total;
    const natural = bjIsBlackjack(h.cards, h.split);
    if (p > 21) return { outcome: 'bust', halves: 0 };
    if (natural && dealerBj) return { outcome: 'push', halves: 2 * h.units };
    if (natural) return { outcome: 'blackjack', halves: 5 };
    if (dealerBj) return { outcome: 'lose', halves: 0 };
    if (d > 21 || p > d) return { outcome: 'win', halves: 4 * h.units };
    if (p === d) return { outcome: 'push', halves: 2 * h.units };
    return { outcome: 'lose', halves: 0 };
  });
}

/** Units of the first bet on the table (1, 2 after a double or a split, up to 4). */
export function bjUnits(s: BjState): number {
  return s.hands.reduce((a, h) => a + h.units, 0);
}
