/**
 * Aurum in-house games other than the wheel. The server decides every outcome; the website only animates it.
 * Both sides read these tables, so the picture always matches the result.
 */

// --- Coin Flip -------------------------------------------------------------
export const COIN_SIDES = ['heads', 'tails'] as const;
export type CoinSide = (typeof COIN_SIDES)[number];
/** Pays 1.88× on a correct call: return to player 94%. */
export const COIN_PAYOUT = { num: 47, den: 25 } as const;

// --- Dice ------------------------------------------------------------------
export const DICE_DIRECTIONS = ['under', 'over'] as const;
export type DiceDirection = (typeof DICE_DIRECTIONS)[number];
export const DICE_TARGET_MIN = 2;
export const DICE_TARGET_MAX = 98;
/** Return to player 94%: the payout is stake × 94 / chance(%). */
export const DICE_RTP_PERCENT = 94;

/** Win chance in percent. "under t" wins when the roll (0.00-99.99) is below t; "over t" when it is t or higher. */
export function diceChance(direction: DiceDirection, target: number): number {
  return direction === 'under' ? target : 100 - target;
}

// --- Slots -----------------------------------------------------------------
export const SLOT_SYMBOLS = ['7', 'diamond', 'bell', 'cherry', 'lemon'] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number];

/** One reel, 20 stops: 1 × 7, 2 × diamond, 3 × bell, 5 × cherry, 9 × lemon. All three reels are identical. */
export const SLOT_REEL: readonly SlotSymbol[] = [
  'lemon', 'cherry', 'lemon', 'bell', 'lemon', 'cherry', 'diamond', 'lemon', 'cherry', 'lemon',
  '7', 'lemon', 'bell', 'cherry', 'lemon', 'diamond', 'lemon', 'bell', 'cherry', 'lemon',
];

const THREE: Record<SlotSymbol, readonly [number, number]> = { '7': [175, 1], diamond: [25, 1], bell: [10, 1], cherry: [5, 1], lemon: [2, 1] };
const TWO: Record<SlotSymbol, readonly [number, number]> = { '7': [4, 1], diamond: [2, 1], bell: [3, 2], cherry: [1, 1], lemon: [1, 2] };

/** Three of a kind > exactly two of a kind > a single cherry (0.5×). */
export function slotsPayout(symbols: readonly SlotSymbol[]): { num: number; den: number } {
  const [a, b, c] = symbols;
  if (a !== undefined && a === b && b === c) {
    const [num, den] = THREE[a];
    return { num, den };
  }
  for (const s of SLOT_SYMBOLS) {
    if (symbols.filter((x) => x === s).length === 2) {
      const [num, den] = TWO[s];
      return { num, den };
    }
  }
  if (symbols.includes('cherry')) return { num: 1, den: 2 };
  return { num: 0, den: 1 };
}

function slotsRtp(): number {
  let total = 0;
  for (const x of SLOT_REEL) for (const y of SLOT_REEL) for (const z of SLOT_REEL) {
    const p = slotsPayout([x, y, z]);
    total += p.num / p.den;
  }
  return (total / SLOT_REEL.length ** 3) * 100;
}
export const SLOTS_RTP_PERCENT = slotsRtp();

// --- Crash -----------------------------------------------------------------
/** The player picks a cash-out multiplier before the round (in hundredths: 150 = 1.50×). The server draws the crash point. */
export const CRASH_TARGET_MIN_X100 = 110;
export const CRASH_TARGET_MAX_X100 = 10_000;
/** P(crash point >= m) = 94% / m, so every target returns 94% on average. */
export const CRASH_RTP_PERCENT = 94;
const CRASH_RESOLUTION = 1_000_000;

/** Crash point in hundredths from one random number r in [0, 1_000_000). Below 1.00× the round busts at 1.00×. */
export function crashPointX100(r: number): number {
  const d = CRASH_RESOLUTION - r; // 1..1_000_000
  const x100 = Math.floor((CRASH_RTP_PERCENT * CRASH_RESOLUTION) / d);
  return x100 < 100 ? 100 : Math.min(x100, 100_000_000);
}
export const CRASH_RANDOM_RANGE = CRASH_RESOLUTION;

// --- Roulette (American: 0 and 00) ----------------------------------------
export const ROULETTE_BETS = ['straight', 'red', 'black', 'even', 'odd', 'low', 'high', 'dozen1', 'dozen2', 'dozen3'] as const;
export type RouletteBet = (typeof ROULETTE_BETS)[number];
/** Pockets 0-36 plus 37, which is shown as "00". Every bet returns 94.74% (36 of 38). */
export const ROULETTE_POCKETS = 38;
const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
export function roulettePocketLabel(pocket: number): string {
  return pocket === 37 ? '00' : String(pocket);
}
export function rouletteColor(pocket: number): 'green' | 'red' | 'black' {
  if (pocket === 0 || pocket === 37) return 'green';
  return ROULETTE_RED.has(pocket) ? 'red' : 'black';
}
/** Whole multiplier of the stake returned for a bet (0 when it loses). 0 and 00 lose every outside bet. */
export function rouletteMultiplier(bet: RouletteBet, number: number | undefined, pocket: number): number {
  if (bet === 'straight') return number === pocket ? 36 : 0;
  if (pocket === 0 || pocket === 37) return 0;
  switch (bet) {
    case 'red': return rouletteColor(pocket) === 'red' ? 2 : 0;
    case 'black': return rouletteColor(pocket) === 'black' ? 2 : 0;
    case 'even': return pocket % 2 === 0 ? 2 : 0;
    case 'odd': return pocket % 2 === 1 ? 2 : 0;
    case 'low': return pocket <= 18 ? 2 : 0;
    case 'high': return pocket >= 19 ? 2 : 0;
    case 'dozen1': return pocket <= 12 ? 3 : 0;
    case 'dozen2': return pocket >= 13 && pocket <= 24 ? 3 : 0;
    case 'dozen3': return pocket >= 25 ? 3 : 0;
    default: return 0;
  }
}

// --- Plinko ----------------------------------------------------------------
export const PLINKO_ROWS = 8;
export const PLINKO_RISKS = ['low', 'medium', 'high'] as const;
export type PlinkoRisk = (typeof PLINKO_RISKS)[number];
/** Payout in tenths of the stake for each of the 9 slots (left to right). Slot k = number of right bounces; chances are C(8,k)/256. Every table returns 93.98%. */
export const PLINKO_TABLES: Readonly<Record<PlinkoRisk, readonly number[]>> = {
  low: [60, 16, 10, 10, 5, 10, 10, 16, 60],
  medium: [130, 30, 14, 6, 3, 6, 14, 30, 130],
  high: [250, 50, 10, 3, 3, 3, 10, 50, 250],
};

// --- Keno: pick 1-6 numbers of 40, the house draws 10 -----------------------------------------------------
export const KENO_NUMBERS = 40;
export const KENO_DRAWN = 10;
export const KENO_MAX_PICKS = 6;
/** Multiplier x10 by number of picks and hits (exact RTP 92.5% - 94.0%, highest payout 100x). */
export const KENO_TABLE: Readonly<Record<number, Readonly<Record<number, number>>>> = {
  1: { 1: 37 },
  2: { 1: 13, 2: 76 },
  3: { 2: 34, 3: 391 },
  4: { 3: 180, 4: 1000 },
  5: { 2: 14, 3: 39, 4: 212, 5: 1000 },
  6: { 2: 10, 3: 22, 4: 87, 5: 644, 6: 1000 },
};
export function kenoTenths(picks: number, hits: number): number {
  return KENO_TABLE[picks]?.[hits] ?? 0;
}

// --- Mines: 25 tiles, choose how many are mines and which tiles to open; one safe pick-set wins ---------------
export const MINES_TILES = 25;
export const MINES_COUNTS = [1, 3, 5, 10] as const;
export const MINES_RTP_PERCENT = 94;
export const MINES_MAX_MULTIPLIER = 100;
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i += 1) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
/** Payout fraction for opening `opened` tiles with `mines` mines: 94% / P(all safe). Null when the combination is not allowed. */
export function minesPayout(mines: number, opened: number): { num: number; den: number } | null {
  if (!(MINES_COUNTS as readonly number[]).includes(mines) || opened < 1 || opened > MINES_TILES - mines) return null;
  const num = MINES_RTP_PERCENT * choose(MINES_TILES, opened);
  const den = 100 * choose(MINES_TILES - mines, opened);
  if (num / den > MINES_MAX_MULTIPLIER) return null;
  return { num, den };
}

// --- Dragon Tiger: two cards, the higher wins; a tie loses for Dragon/Tiger -------------------------------
export const DRAGON_TIGER_BETS = ['dragon', 'tiger', 'tie'] as const;
export type DragonTigerBet = (typeof DRAGON_TIGER_BETS)[number];
export function dragonTigerPayout(bet: DragonTigerBet, dragon: number, tiger: number): { num: number; den: number } {
  const winner: DragonTigerBet = dragon > tiger ? 'dragon' : tiger > dragon ? 'tiger' : 'tie';
  if (bet !== winner) return { num: 0, den: 1 };
  return bet === 'tie' ? { num: 122, den: 10 } : { num: 203, den: 100 };
}

// --- Baccarat: standard punto banco rules (infinite deck) ---------------------------------------------------
export const BACCARAT_BETS = ['player', 'banker', 'tie'] as const;
export type BaccaratBet = (typeof BACCARAT_BETS)[number];
export const baccaratValue = (rank: number): number => (rank >= 10 ? 0 : rank);
export interface BaccaratHand {
  player: number[];
  banker: number[];
  playerTotal: number;
  bankerTotal: number;
  winner: BaccaratBet;
}
/** cards = six ranks 1..13 in dealing order: P1, B1, P2, B2, then the possible third cards of Player and Banker. */
export function baccaratDeal(cards: readonly number[]): BaccaratHand {
  const v = (i: number) => baccaratValue(cards[i] ?? 1);
  const player = [cards[0] ?? 1, cards[2] ?? 1];
  const banker = [cards[1] ?? 1, cards[3] ?? 1];
  let pt = (v(0) + v(2)) % 10;
  let bt = (v(1) + v(3)) % 10;
  if (pt < 8 && bt < 8) {
    let p3: number | null = null;
    if (pt <= 5) {
      p3 = v(4);
      player.push(cards[4] ?? 1);
      pt = (pt + p3) % 10;
    }
    let drawBanker: boolean;
    if (p3 === null) drawBanker = bt <= 5;
    else if (bt <= 2) drawBanker = true;
    else if (bt === 3) drawBanker = p3 !== 8;
    else if (bt === 4) drawBanker = p3 >= 2 && p3 <= 7;
    else if (bt === 5) drawBanker = p3 >= 4 && p3 <= 7;
    else if (bt === 6) drawBanker = p3 === 6 || p3 === 7;
    else drawBanker = false;
    if (drawBanker) {
      banker.push(cards[5] ?? 1);
      bt = (bt + v(5)) % 10;
    }
  }
  return { player, banker, playerTotal: pt, bankerTotal: bt, winner: pt > bt ? 'player' : bt > pt ? 'banker' : 'tie' };
}
/** Player pays 2x, Banker 1.95x (5% commission), Tie 9x; Player and Banker bets get their stake back on a tie. */
export function baccaratPayout(bet: BaccaratBet, winner: BaccaratBet): { num: number; den: number } {
  if (winner === 'tie') return bet === 'tie' ? { num: 9, den: 1 } : { num: 1, den: 1 };
  if (bet !== winner) return { num: 0, den: 1 };
  return bet === 'player' ? { num: 2, den: 1 } : { num: 195, den: 100 };
}

// --- Sic Bo: three dice ---------------------------------------------------------------------------------------
export const SICBO_BETS = ['big', 'small', 'single', 'total', 'anytriple', 'triple'] as const;
export type SicBoBet = (typeof SICBO_BETS)[number];
const SICBO_TOTAL_PAYS: Readonly<Record<number, number>> = { 4: 61, 5: 31, 6: 18, 7: 13, 8: 9, 9: 7, 10: 7, 11: 7, 12: 7, 13: 9, 14: 13, 15: 18, 16: 31, 17: 61 };
/** Whole multiplier paid back (stake included) for one bet on three dice. `value` is the number (single/triple) or the total. */
export function sicBoMultiplier(bet: SicBoBet, value: number | undefined, dice: readonly number[]): number {
  const [a = 0, b = 0, c = 0] = dice;
  const total = a + b + c;
  const triple = a === b && b === c;
  switch (bet) {
    case 'big':
      return !triple && total >= 11 ? 2 : 0;
    case 'small':
      return !triple && total <= 10 ? 2 : 0;
    case 'single': {
      const n = dice.filter((d) => d === value).length;
      return n === 0 ? 0 : n + 1;
    }
    case 'total':
      return value !== undefined && total === value ? (SICBO_TOTAL_PAYS[total] ?? 0) : 0;
    case 'anytriple':
      return triple ? 31 : 0;
    case 'triple':
      return triple && a === value ? 181 : 0;
  }
}
export function sicBoValueOk(bet: SicBoBet, value: number | undefined): boolean {
  if (bet === 'single' || bet === 'triple') return value !== undefined && Number.isInteger(value) && value >= 1 && value <= 6;
  if (bet === 'total') return value !== undefined && Number.isInteger(value) && value >= 4 && value <= 17;
  return true;
}

// --- Pair Plus Poker: three cards from a real 52-card deck ------------------------------------------------------
export const CARD_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
/** card id 0..51 -> rank 1..13 (1 = ace) and suit 0..3. */
export const cardRank = (id: number): number => (id % 13) + 1;
export const cardSuit = (id: number): number => Math.floor(id / 13);
export type PairPlusHand = 'straightFlush' | 'threeKind' | 'straight' | 'flush' | 'pair' | 'high';
export const PAIR_PLUS_PAYS: Readonly<Record<PairPlusHand, number>> = { straightFlush: 41, threeKind: 31, straight: 7, flush: 5, pair: 2, high: 0 };
export function pairPlusHand(cards: readonly number[]): PairPlusHand {
  const ranks = cards.map(cardRank).sort((x, y) => x - y);
  const flush = new Set(cards.map(cardSuit)).size === 1;
  const [r1 = 0, r2 = 0, r3 = 0] = ranks;
  const straight = (r2 === r1 + 1 && r3 === r2 + 1) || (r1 === 1 && r2 === 12 && r3 === 13) || (r1 === 1 && r2 === 2 && r3 === 3);
  if (straight && flush) return 'straightFlush';
  if (r1 === r2 && r2 === r3) return 'threeKind';
  if (straight) return 'straight';
  if (flush) return 'flush';
  if (r1 === r2 || r2 === r3) return 'pair';
  return 'high';
}

// --- Scratch card: 3 x 3, three equal symbols win ----------------------------------------------------------------
export const SCRATCH_SYMBOLS = ['cherry', 'lemon', 'bell', 'star', 'diamond', 'crown'] as const;
export type ScratchSymbol = (typeof SCRATCH_SYMBOLS)[number];
export const SCRATCH_RANGE = 1_000_000;
/** Prize table: the card pays `x` times the stake with probability `chance / 1,000,000`. Exact RTP 94.00%. */
export const SCRATCH_PRIZES: readonly { symbol: ScratchSymbol; x: number; chance: number }[] = [
  { symbol: 'cherry', x: 1, chance: 120_000 },
  { symbol: 'lemon', x: 2, chance: 180_000 },
  { symbol: 'bell', x: 5, chance: 40_000 },
  { symbol: 'star', x: 10, chance: 10_000 },
  { symbol: 'diamond', x: 50, chance: 2_000 },
  { symbol: 'crown', x: 200, chance: 300 },
];
/** The prize for a random number 0..999,999, or null for a losing card. */
export function scratchPrize(r: number): { symbol: ScratchSymbol; x: number } | null {
  let from = 0;
  for (const p of SCRATCH_PRIZES) {
    if (r < from + p.chance) return { symbol: p.symbol, x: p.x };
    from += p.chance;
  }
  return null;
}

// --- Gold Rush: 5 reels x 3 rows video slot, 10 paylines, wild ----------------------------------------------------
export const GOLD_SYMBOLS = ['lemon', 'cherry', 'plum', 'bell', 'diamond', 'seven', 'crown', 'wild'] as const;
export type GoldSymbol = (typeof GOLD_SYMBOLS)[number];
/** One reel, 30 stops: 7 lemon, 6 cherry, 5 plum, 4 bell, 3 diamond, 2 seven, 2 wild, 1 crown. All five reels are identical. */
export const GOLD_REEL: readonly GoldSymbol[] = [
  'lemon', 'cherry', 'plum', 'lemon', 'bell', 'cherry', 'lemon', 'wild', 'plum', 'lemon',
  'cherry', 'diamond', 'lemon', 'plum', 'bell', 'cherry', 'seven', 'lemon', 'plum', 'cherry',
  'bell', 'diamond', 'lemon', 'wild', 'plum', 'cherry', 'bell', 'diamond', 'seven', 'crown',
];
/** Row (0 top, 1 middle, 2 bottom) of each reel on each of the 10 lines. */
export const GOLD_LINES: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
];
/** Pay for 3, 4 and 5 symbols in a row from the left, in multiples of the line bet (stake / 10). Wild replaces every symbol. */
export const GOLD_PAYS: Readonly<Record<Exclude<GoldSymbol, 'wild'>, readonly [number, number, number]>> = {
  lemon: [4, 10, 30],
  cherry: [5, 12, 36],
  plum: [5, 13, 45],
  bell: [9, 27, 110],
  diamond: [18, 55, 275],
  seven: [35, 135, 675],
  crown: [70, 350, 1750],
};
/** One spin never pays more than this many times the stake. */
export const GOLD_CAP_X = 250;
/** grid[reel][row] for the stop each reel landed on (the stop is the top row, the next two follow, wrapping round). */
export function goldGrid(stops: readonly number[]): GoldSymbol[][] {
  return stops.map((stop) => [0, 1, 2].map((row) => GOLD_REEL[(stop + row) % GOLD_REEL.length] ?? 'lemon'));
}
export interface GoldWin {
  line: number;
  symbol: GoldSymbol;
  count: number;
  pay: number;
}
export function goldEvaluate(grid: readonly (readonly GoldSymbol[])[]): { wins: GoldWin[]; units: number } {
  const wins: GoldWin[] = [];
  GOLD_LINES.forEach((rows, line) => {
    const symbols = rows.map((row, reel) => grid[reel]?.[row] ?? 'lemon');
    const lead = symbols.find((x) => x !== 'wild') ?? 'crown';
    let count = 0;
    for (const x of symbols) {
      if (x === lead || x === 'wild') count += 1;
      else break;
    }
    if (count >= 3) wins.push({ line, symbol: lead, count, pay: GOLD_PAYS[lead][count - 3] ?? 0 });
  });
  return { wins, units: wins.reduce((n, w) => n + w.pay, 0) };
}
/** Payout as a fraction of the stake: units x stake / 10, capped. */
export function goldPayout(units: number): { num: number; den: number } {
  return { num: Math.min(units, GOLD_CAP_X * 10), den: 10 };
}

// --- Power Strike: a hammer hits the strength tower --------------------------------------------------------------
export const STRIKE_RANGE = 1_000_000;
/** Levels the hammer can reach. `chance` is out of 1,000,000; below the first level the hit is a miss. Exact RTP 94.00%. */
export const STRIKE_LEVELS: readonly { level: number; tenths: number; chance: number }[] = [
  { level: 1, tenths: 15, chance: 280_000 },
  { level: 2, tenths: 30, chance: 90_000 },
  { level: 3, tenths: 60, chance: 25_000 },
  { level: 4, tenths: 150, chance: 4_000 },
  { level: 5, tenths: 500, chance: 800 },
];
/** Level reached for a random number 0..999,999 (0 = miss) and its multiplier in tenths. */
export function strikeResult(r: number): { level: number; tenths: number } {
  let from = 0;
  for (const l of STRIKE_LEVELS) {
    if (r < from + l.chance) return { level: l.level, tenths: l.tenths };
    from += l.chance;
  }
  return { level: 0, tenths: 0 };
}

// --- Raptor Run: jump over a chosen number of obstacles; each one is cleared with probability 4/5 ---------------------
export const RAPTOR_MAX_JUMPS = 15;
export const RAPTOR_RTP_PERCENT = 94;
/** Payout fraction for clearing `jumps` obstacles: 94% / (4/5)^jumps. */
export function raptorPayout(jumps: number): { num: number; den: number } | null {
  if (!Number.isInteger(jumps) || jumps < 1 || jumps > RAPTOR_MAX_JUMPS) return null;
  return { num: RAPTOR_RTP_PERCENT * 5 ** jumps, den: 100 * 4 ** jumps };
}

// --- Scatter pays: 6 x 5 grid, 8 or more of one symbol anywhere pays (themes: candy, thunder, ocean, aztec) -----------
export const SCATTER_CELLS = 30;
/** Weight of each of the 9 symbols out of 100, lowest-paying first. Every cell is drawn independently. */
export const SCATTER_WEIGHTS = [22, 18, 15, 12, 10, 8, 6, 5, 4] as const;
/** Pay in tenths of the stake for 8-9, 10-11 and 12+ matching symbols. */
export const SCATTER_PAYS_TENTHS: readonly (readonly [number, number, number])[] = [
  [10, 20, 41], [12, 25, 51], [16, 33, 61], [20, 41, 82], [31, 61, 123], [51, 102, 205], [82, 164, 328], [164, 328, 656], [307, 615, 1230],
];
export const scatterSymbolOf = (r: number): number => {
  let from = 0;
  for (let i = 0; i < SCATTER_WEIGHTS.length; i += 1) {
    from += SCATTER_WEIGHTS[i] ?? 0;
    if (r < from) return i;
  }
  return SCATTER_WEIGHTS.length - 1;
};
export function scatterPayTenths(symbol: number, count: number): number {
  if (count < 8) return 0;
  return SCATTER_PAYS_TENTHS[symbol]?.[count < 10 ? 0 : count < 12 ? 1 : 2] ?? 0;
}
export interface ScatterWin {
  symbol: number;
  count: number;
  tenths: number;
}
export function scatterEvaluate(cells: readonly number[]): { counts: number[]; wins: ScatterWin[]; tenths: number } {
  const counts = SCATTER_WEIGHTS.map(() => 0);
  for (const c of cells) counts[c] = (counts[c] ?? 0) + 1;
  const wins: ScatterWin[] = [];
  counts.forEach((count, symbol) => {
    const tenths = scatterPayTenths(symbol, count);
    if (tenths > 0) wins.push({ symbol, count, tenths });
  });
  return { counts, wins, tenths: wins.reduce((n, w) => n + w.tenths, 0) };
}
/** Highest possible total pay of one spin, in tenths of the stake (best split of the 30 cells between symbols). */
export const SCATTER_MAX_TENTHS: number = (() => {
  let best: number[] = Array.from({ length: SCATTER_CELLS + 1 }, (_, i) => (i === 0 ? 0 : 0));
  for (let s = 0; s < SCATTER_WEIGHTS.length; s += 1) {
    const next = best.slice();
    for (let used = 0; used <= SCATTER_CELLS; used += 1) {
      for (let c = 8; used + c <= SCATTER_CELLS; c += 1) next[used + c] = Math.max(next[used + c] ?? 0, (best[used] ?? 0) + scatterPayTenths(s, c));
    }
    best = next;
  }
  return Math.max(...best);
})();

// --- Tumble slots: 6 x 5 pay-anywhere with tumbles (Hannibal Candy Burst, Desert Riches) -------------------------
// Each spin: 30 independent symbols. 8 or more of one symbol anywhere pay. The winning symbols burst, the others fall
// down, new symbols drop in from the top and the board is checked again, up to maxTumbles times. With a growing
// multiplier the n-th win of a spin pays n times. One spin never pays more than capX times the stake.
export interface TumbleConfig {
  /** Weight of each symbol, lowest paying first. */
  weights: readonly number[];
  weightTotal: number;
  /** Smallest count of each pay column, e.g. [8, 10, 12] = 8-9, 10-11, 12+. */
  bands: readonly number[];
  /** Pay in tenths of the stake, per symbol and pay column. */
  pays: readonly (readonly number[])[];
  maxTumbles: number;
  capX: number;
  growingMultiplier: boolean;
  /** Theoretical RTP in percent (simulation). */
  rtp: number;
  /** Optional wild: counts as every regular symbol (never wins on its own) and bursts with the wins it helps. */
  wild?: number;
  /** Optional scatter: pays on the first board only, by count (smallest count first); scatters never burst. */
  scatter?: { symbol: number; pays: readonly { min: number; tenths: number }[] };
}
export const TUMBLE_COLS = 6;
export const TUMBLE_ROWS = 5;
export const TUMBLE_CELLS = TUMBLE_COLS * TUMBLE_ROWS;

export interface CandyWin {
  symbol: number;
  count: number;
  tenths: number;
}
export interface CandyStep {
  /** The board before this step's wins burst (index = row * 6 + column, row 0 at the top). */
  grid: number[];
  wins: CandyWin[];
  /** Cells that burst. */
  burst: number[];
  multiplier: number;
  /** Pay of this step in tenths of the stake (already multiplied). */
  tenths: number;
}
export type TumbleWin = CandyWin;
export type TumbleStep = CandyStep;

export function tumbleSymbolOf(cfg: TumbleConfig, r: number): number {
  let from = 0;
  for (let i = 0; i < cfg.weights.length; i += 1) {
    from += cfg.weights[i] ?? 0;
    if (r < from) return i;
  }
  return cfg.weights.length - 1;
}
export function tumblePayTenths(cfg: TumbleConfig, symbol: number, count: number): number {
  let band = -1;
  cfg.bands.forEach((min, i) => {
    if (count >= min) band = i;
  });
  return band < 0 ? 0 : (cfg.pays[symbol]?.[band] ?? 0);
}
/**
 * Plays one spin. next() must return a uniform integer in [0, cfg.weightTotal); it is called for the 30 starting
 * cells first and then once for every new symbol, column by column from the bottom up.
 */
export function tumblePlay(cfg: TumbleConfig, next: () => number): { steps: CandyStep[]; final: number[]; tenths: number; capped: boolean } {
  const grid = Array.from({ length: TUMBLE_CELLS }, () => tumbleSymbolOf(cfg, next()));
  const steps: CandyStep[] = [];
  let total = 0;
  for (let n = 1; n <= cfg.maxTumbles; n += 1) {
    const counts = cfg.weights.map(() => 0);
    for (const c of grid) counts[c] = (counts[c] ?? 0) + 1;
    const wilds = cfg.wild === undefined ? 0 : (counts[cfg.wild] ?? 0);
    const wins: CandyWin[] = [];
    counts.forEach((count, symbol) => {
      if (symbol === cfg.wild || symbol === cfg.scatter?.symbol || count === 0) return;
      const tenths = tumblePayTenths(cfg, symbol, count + wilds);
      if (tenths > 0) wins.push({ symbol, count: count + wilds, tenths });
    });
    let scatterWin: CandyWin | null = null;
    if (n === 1 && cfg.scatter) {
      const sc = counts[cfg.scatter.symbol] ?? 0;
      let pay = 0;
      for (const p of cfg.scatter.pays) if (sc >= p.min) pay = p.tenths;
      if (pay > 0) scatterWin = { symbol: cfg.scatter.symbol, count: sc, tenths: pay };
    }
    if (wins.length === 0 && !scatterWin) break;
    const winning = new Set(wins.map((w) => w.symbol));
    if (wins.length > 0 && cfg.wild !== undefined) winning.add(cfg.wild);
    const burst: number[] = [];
    grid.forEach((c, i) => winning.has(c) && burst.push(i));
    const multiplier = cfg.growingMultiplier ? n : 1;
    const tenths = wins.reduce((a, w) => a + w.tenths, 0) * multiplier + (scatterWin?.tenths ?? 0);
    steps.push({ grid: grid.slice(), wins: scatterWin ? [...wins, scatterWin] : wins, burst, multiplier, tenths });
    total += tenths;
    if (wins.length === 0 || n === cfg.maxTumbles) break;
    for (let col = 0; col < TUMBLE_COLS; col += 1) {
      const keep: number[] = [];
      for (let row = TUMBLE_ROWS - 1; row >= 0; row -= 1) {
        const v = grid[row * TUMBLE_COLS + col] as number;
        if (!winning.has(v)) keep.push(v);
      }
      while (keep.length < TUMBLE_ROWS) keep.push(tumbleSymbolOf(cfg, next()));
      for (let row = TUMBLE_ROWS - 1, k = 0; row >= 0; row -= 1, k += 1) grid[row * TUMBLE_COLS + col] = keep[k] as number;
    }
  }
  const cap = cfg.capX * 10;
  return { steps, final: grid.slice(), tenths: Math.min(total, cap), capped: total > cap };
}

/** Hannibal Candy Burst: 9 candies, growing multiplier x1, x2, x3 ... Simulated RTP about 95.6% (20 million spins). */
export const CANDY_CONFIG: TumbleConfig = {
  weights: [15, 14, 13, 12, 12, 11, 9, 8, 6],
  weightTotal: 100,
  bands: [8, 10, 12],
  pays: [[10, 20, 40], [12, 24, 50], [16, 32, 60], [20, 40, 80], [30, 60, 120], [50, 100, 200], [80, 160, 320], [160, 320, 640], [300, 600, 1200]],
  maxTumbles: 20,
  capX: 500,
  growingMultiplier: true,
  rtp: 95.6,
};
export const CANDY_COLS = TUMBLE_COLS;
export const CANDY_ROWS = TUMBLE_ROWS;
export const CANDY_CELLS = TUMBLE_CELLS;
export const CANDY_WEIGHTS = CANDY_CONFIG.weights;
export const CANDY_WEIGHT_TOTAL = CANDY_CONFIG.weightTotal;
export const CANDY_PAYS_TENTHS = CANDY_CONFIG.pays;
export const CANDY_MAX_TUMBLES = CANDY_CONFIG.maxTumbles;
export const CANDY_CAP_X = CANDY_CONFIG.capX;
export const CANDY_RTP = CANDY_CONFIG.rtp;
export const candyBurstPlay = (next: () => number) => tumblePlay(CANDY_CONFIG, next);

/**
 * Desert Riches: 8 temple symbols, no multiplier, up to 5 tumbles, bigger pays for 12+ and 15+.
 * Simulated RTP about 95.4% (two runs of 10 million spins: 95.39% and 95.41%).
 */
export const DESERT_CONFIG: TumbleConfig = {
  weights: [15, 14, 13, 13, 12, 12, 11, 10],
  weightTotal: 100,
  bands: [8, 10, 12, 15],
  pays: [[9, 11, 14, 22], [12, 15, 19, 29], [15, 19, 25, 39], [22, 28, 35, 55], [33, 41, 53, 83], [48, 60, 77, 120], [66, 83, 106, 166], [110, 138, 177, 276]],
  maxTumbles: 5,
  capX: 100,
  growingMultiplier: false,
  rtp: 95.4,
};
export const desertRichesPlay = (next: () => number) => tumblePlay(DESERT_CONFIG, next);

/**
 * Hannibal Lion's Roar: 8 lion-temple symbols, up to 5 tumbles, no multiplier, bigger pays for 10+, 12+ and 15+.
 * Simulated RTP about 95.4% (4 runs of 5 million spins: 95.38% to 95.53%).
 */
export const LIONS_ROAR_CONFIG: TumbleConfig = {
  weights: [16, 15, 14, 13, 12, 11, 10, 9],
  weightTotal: 100,
  bands: [8, 10, 12, 15],
  pays: [[8, 10, 14, 23], [11, 14, 19, 32], [15, 20, 27, 46], [21, 28, 38, 64], [30, 40, 55, 91], [46, 59, 82, 137], [76, 99, 137, 228], [152, 198, 274, 457]],
  maxTumbles: 5,
  capX: 250,
  growingMultiplier: false,
  rtp: 95.4,
};
export const lionsRoarPlay = (next: () => number) => tumblePlay(LIONS_ROAR_CONFIG, next);

/**
 * Hannibal Chilli: 10 fiesta symbols, the Hannibal lion is WILD (counts for every symbol), the temple is SCATTER
 * (4 / 5+ on the first board pay 20.4x / 63.8x). 4+ scatters also award 5 free tumble spins (server bonus).
 * Up to 5 tumbles.
 * Simulated RTP about 95.3% (2 runs of 5 million spins: 95.18% and 95.51%).
 */
export const CHILLI_CONFIG: TumbleConfig = {
  weights: [11, 11, 10, 10, 10, 10, 9, 9, 8, 7, 2, 4],
  weightTotal: 100,
  bands: [8, 10, 12, 15],
  pays: [[10, 13, 18, 31], [11, 15, 21, 34], [13, 17, 23, 38], [14, 18, 25, 42], [18, 23, 32, 54], [20, 27, 37, 61], [26, 33, 46, 77], [31, 40, 55, 92], [38, 50, 69, 115], [51, 66, 92, 153], [0, 0, 0, 0], [0, 0, 0, 0]],
  maxTumbles: 5,
  capX: 250,
  growingMultiplier: false,
  rtp: 95.3,
  wild: 10,
  scatter: { symbol: 11, pays: [{ min: 4, tenths: 204 }, { min: 5, tenths: 638 }] },
};
export const CHILLI_SCATTER_FREE_MIN = 4;
export const CHILLI_SCATTER_FREE_COUNT = 5;
export const chilliPlay = (next: () => number) => tumblePlay(CHILLI_CONFIG, next);

/**
 * Tidal Treasure: 7 sea symbols, the treasure chest is SCATTER (4 / 5 / 6+ on the first board pay 2.2x / 7.5x / 22.5x),
 * up to 6 tumbles, no multiplier. Simulated RTP about 95.0% (2 runs of 4 million spins: 95.16% and 94.94%).
 */
export const TIDAL_CONFIG: TumbleConfig = {
  weights: [14, 14, 14, 14, 13, 14, 13, 4],
  weightTotal: 100,
  bands: [8, 10, 12, 15],
  pays: [[4, 5, 7, 11], [5, 7, 10, 16], [8, 10, 14, 23], [10, 14, 19, 31], [15, 19, 27, 45], [24, 31, 43, 72], [45, 58, 81, 135], [0, 0, 0, 0]],
  maxTumbles: 6,
  capX: 300,
  growingMultiplier: false,
  rtp: 95.0,
  scatter: { symbol: 7, pays: [{ min: 4, tenths: 22 }, { min: 5, tenths: 75 }, { min: 6, tenths: 225 }] },
};
export const tidalPlay = (next: () => number) => tumblePlay(TIDAL_CONFIG, next);

/**
 * Olympus Storm: 9 Olympus symbols, the lightning bolt is WILD, the multiplier grows with every win (x1, x2, x3 ...),
 * up to 20 tumbles. Simulated RTP about 95.7% (2 runs of 4 million spins: 95.67% and 95.65%).
 */
export const OLYMPUS_CONFIG: TumbleConfig = {
  weights: [24, 24, 23, 23, 22, 22, 21, 20, 18, 3],
  weightTotal: 200,
  bands: [8, 10, 12],
  pays: [[8, 11, 19], [10, 15, 25], [12, 19, 31], [15, 23, 38], [20, 30, 50], [25, 38, 63], [38, 56, 94], [63, 94, 157], [125, 187, 312], [0, 0, 0]],
  maxTumbles: 20,
  capX: 1000,
  growingMultiplier: true,
  rtp: 95.7,
  wild: 9,
};
export const olympusStormPlay = (next: () => number) => tumblePlay(OLYMPUS_CONFIG, next);

/**
 * Diamond Blitz: 8 gems, the gem crown is SCATTER (4 / 5 / 6+ on the first board pay 3.7x / 12.2x / 36.6x),
 * the multiplier grows with every win, up to 12 tumbles. Simulated RTP about 95.9% (2 runs of 2 million spins: 95.85% and 95.92%).
 */
export const DIAMOND_BLITZ_CONFIG: TumbleConfig = {
  weights: [24, 23, 22, 21, 20, 19, 18, 17, 4],
  weightTotal: 168,
  bands: [8, 10, 12],
  pays: [[10, 15, 24], [12, 18, 31], [15, 22, 37], [18, 27, 46], [24, 37, 61], [31, 46, 76], [46, 68, 115], [73, 110, 183], [0, 0, 0]],
  maxTumbles: 12,
  capX: 500,
  growingMultiplier: true,
  rtp: 95.9,
  scatter: { symbol: 8, pays: [{ min: 4, tenths: 37 }, { min: 5, tenths: 122 }, { min: 6, tenths: 366 }] },
};
export const diamondBlitzPlay = (next: () => number) => tumblePlay(DIAMOND_BLITZ_CONFIG, next);

/**
 * Vesuvius Fury: 8 Roman symbols, the volcano is WILD, up to 8 tumbles, no multiplier.
 * Simulated RTP about 95.9% (2 runs of 3 million spins: 95.87% and 95.98%).
 */
export const VESUVIUS_CONFIG: TumbleConfig = {
  weights: [15, 14, 14, 13, 13, 12, 11, 10, 3],
  weightTotal: 105,
  bands: [8, 10, 12, 15],
  pays: [[4, 5, 7, 12], [5, 6, 9, 15], [6, 8, 12, 19], [8, 10, 15, 25], [11, 14, 20, 34], [16, 20, 29, 48], [25, 33, 47, 78], [47, 62, 86, 148], [0, 0, 0, 0]],
  maxTumbles: 8,
  capX: 150,
  growingMultiplier: false,
  rtp: 95.9,
  wild: 8,
};
export const vesuviusPlay = (next: () => number) => tumblePlay(VESUVIUS_CONFIG, next);

/**
 * Deep Catch: 8 sea symbols, the golden hook is WILD, the multiplier grows with every win, up to 10 tumbles.
 * Simulated RTP about 95.8% (2 runs of 2 million spins: 95.87% and 95.64%).
 */
export const DEEP_CATCH_CONFIG: TumbleConfig = {
  weights: [24, 23, 22, 22, 21, 20, 19, 17, 3],
  weightTotal: 171,
  bands: [8, 10, 12],
  pays: [[4, 6, 10], [5, 8, 13], [6, 10, 16], [8, 12, 20], [10, 16, 26], [13, 20, 33], [20, 29, 49], [33, 49, 81], [0, 0, 0]],
  maxTumbles: 10,
  capX: 500,
  growingMultiplier: true,
  rtp: 95.8,
  wild: 8,
};
export const deepCatchPlay = (next: () => number) => tumblePlay(DEEP_CATCH_CONFIG, next);

/**
 * Lucky Clover: 7 lucky symbols, the pot of gold is SCATTER (4 / 5 / 6+ on the first board pay 3x / 9x / 28x),
 * up to 8 tumbles, no multiplier. Simulated RTP about 95.7% (2 runs of 3 million spins: 95.72% and 95.67%).
 */
export const LUCKY_CLOVER_CONFIG: TumbleConfig = {
  weights: [16, 15, 15, 14, 14, 13, 12, 4],
  weightTotal: 103,
  bands: [8, 10, 12, 15],
  pays: [[4, 5, 8, 12], [5, 7, 11, 18], [9, 11, 15, 25], [12, 15, 21, 34], [17, 22, 31, 51], [27, 35, 49, 81], [50, 66, 92, 152], [0, 0, 0, 0]],
  maxTumbles: 8,
  capX: 100,
  growingMultiplier: false,
  rtp: 95.7,
  scatter: { symbol: 7, pays: [{ min: 4, tenths: 30 }, { min: 5, tenths: 90 }, { min: 6, tenths: 280 }] },
};
export const luckyCloverPlay = (next: () => number) => tumblePlay(LUCKY_CLOVER_CONFIG, next);


// =============================================================================================
// --- Line slots (5 reels): paylines or ways to win, WILD, SCATTER. Pays are in thousandths ("milli") of the total bet.
export interface LineConfig {
  reels: number;
  rows: number;
  weights: readonly number[];
  weightTotal: number;
  mode: 'lines' | 'ways';
  /** Row of every reel, one array per payline (lines mode). */
  lines?: readonly (readonly number[])[];
  /** Per symbol: pay for 3, 4 and 5 of a kind, in thousandths of the total bet (per line, or per way). */
  pays: readonly (readonly number[])[];
  wild?: number;
  scatter?: { symbol: number; pays: readonly { min: number; milli: number }[] };
  capX: number;
  rtp: number;
}
export interface LineWin {
  /** Payline index (lines mode); -1 for ways and scatter wins. */
  line: number;
  symbol: number;
  count: number;
  ways: number;
  milli: number;
  cells: number[];
}
export function lineSymbolOf(cfg: LineConfig, r: number): number {
  let acc = 0;
  for (let i = 0; i < cfg.weights.length; i += 1) {
    acc += cfg.weights[i] as number;
    if (r < acc) return i;
  }
  return cfg.weights.length - 1;
}
/** One spin: every cell uses the next random number (row by row). Cell index = row * reels + reel. */
export function linePlay(cfg: LineConfig, next: () => number): { grid: number[]; wins: LineWin[]; scatter: LineWin | null; milli: number; capped: boolean } {
  const grid = Array.from({ length: cfg.reels * cfg.rows }, () => lineSymbolOf(cfg, next()));
  const at = (reel: number, row: number) => grid[row * cfg.reels + reel] as number;
  const payOf = (symbol: number, count: number) => (count >= 3 ? (cfg.pays[symbol]?.[count - 3] ?? 0) : 0);
  const wins: LineWin[] = [];
  if (cfg.mode === 'lines') {
    (cfg.lines ?? []).forEach((rows, line) => {
      const syms = rows.map((row, reel) => at(reel, row));
      let wildRun = 0;
      while (wildRun < syms.length && syms[wildRun] === cfg.wild) wildRun += 1;
      const lead = syms.find((s) => s !== cfg.wild);
      let best = { symbol: cfg.wild ?? -1, count: wildRun, milli: cfg.wild === undefined ? 0 : payOf(cfg.wild, wildRun) };
      if (lead !== undefined && lead !== cfg.scatter?.symbol) {
        let count = 0;
        while (count < syms.length && (syms[count] === lead || syms[count] === cfg.wild)) count += 1;
        const milli = payOf(lead, count);
        if (milli > best.milli) best = { symbol: lead, count, milli };
      }
      if (best.milli > 0) wins.push({ line, symbol: best.symbol, count: best.count, ways: 1, milli: best.milli, cells: rows.slice(0, best.count).map((row, reel) => row * cfg.reels + reel) });
    });
  } else {
    for (let symbol = 0; symbol < cfg.weights.length; symbol += 1) {
      if (symbol === cfg.wild || symbol === cfg.scatter?.symbol) continue;
      let ways = 1;
      let count = 0;
      const cells: number[] = [];
      for (let reel = 0; reel < cfg.reels; reel += 1) {
        let n = 0;
        for (let row = 0; row < cfg.rows; row += 1) {
          const s = at(reel, row);
          if (s === symbol || s === cfg.wild) {
            n += 1;
            cells.push(row * cfg.reels + reel);
          }
        }
        if (n === 0) break;
        ways *= n;
        count += 1;
      }
      const pay = payOf(symbol, count);
      if (pay > 0) wins.push({ line: -1, symbol, count, ways, milli: pay * ways, cells: cells.filter((c) => c % cfg.reels < count) });
    }
  }
  let scatter: LineWin | null = null;
  if (cfg.scatter) {
    const sc = cfg.scatter;
    const cells = grid.flatMap((s, i) => (s === sc.symbol ? [i] : []));
    let milli = 0;
    for (const p of sc.pays) if (cells.length >= p.min) milli = p.milli;
    if (milli > 0) scatter = { line: -1, symbol: sc.symbol, count: cells.length, ways: 1, milli, cells };
  }
  const total = wins.reduce((a, w) => a + w.milli, 0) + (scatter?.milli ?? 0);
  const cap = cfg.capX * 1000;
  return { grid, wins, scatter, milli: Math.min(total, cap), capped: total > cap };
}

/** Jester's Dice: 5x3, 10 paylines, the joker card is WILD, 3+ stars anywhere pay a SCATTER bonus. Simulated RTP about 95.7% (2 runs of 2 million spins: 95.75% and 95.67%). */
export const JESTERS_DICE_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [32, 30, 28, 26, 12, 10, 8, 6, 5, 3],
  weightTotal: 160,
  mode: 'lines',
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1]],
  pays: [[920, 2780, 9260], [920, 2780, 11120], [1490, 3710, 13900], [1850, 4630, 18540], [2780, 7420, 27800], [3710, 9260, 37070], [4630, 13900, 55610], [7420, 27800, 139010], [9260, 46330, 185350], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 3700 }, { min: 4, milli: 18500 }, { min: 5, milli: 92600 }] },
  capX: 500,
  rtp: 95.7,
};
export const jestersDicePlay = (next: () => number) => linePlay(JESTERS_DICE_CONFIG, next);

/** Pharaoh's Codex: 5x3, 10 paylines, high volatility, the Horus falcon is WILD, the winged sun is SCATTER. Simulated RTP about 96.1% (2 runs of 2 million spins: 96.26% and 95.86%). */
export const PHARAOH_CODEX_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [30, 28, 26, 24, 22, 10, 8, 6, 4, 3, 3],
  weightTotal: 164,
  mode: 'lines',
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1]],
  pays: [[1500, 4490, 14960], [1500, 4490, 14960], [1500, 5980, 22440], [2390, 7480, 29920], [2990, 8980, 37400], [4490, 14960, 59830], [5980, 22440, 89750], [8980, 29920, 149580], [14960, 59830, 299170], [29920, 149580, 747920], [0, 0, 0]],
  wild: 9,
  scatter: { symbol: 10, pays: [{ min: 3, milli: 6000 }, { min: 4, milli: 59800 }, { min: 5, milli: 299200 }] },
  capX: 1000,
  rtp: 96.1,
};
export const pharaohCodexPlay = (next: () => number) => linePlay(PHARAOH_CODEX_CONFIG, next);

/** Treasure Stack: 5x3, 20 paylines, the lion crest is WILD, the treasure chest is SCATTER. Simulated RTP about 95.9% (2 runs of 2 million spins: 95.83% and 96.02%). */
export const TREASURE_STACK_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [30, 28, 26, 24, 12, 10, 8, 6, 6, 3],
  weightTotal: 153,
  mode: 'lines',
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0]],
  pays: [[550, 1080, 4330], [550, 1080, 4330], [550, 1630, 5410], [860, 2170, 8110], [1080, 3250, 10830], [1630, 4330, 16240], [2170, 6500, 27050], [3250, 10830, 43290], [4330, 16240, 64930], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 4400 }, { min: 4, milli: 21700 }, { min: 5, milli: 86600 }] },
  capX: 400,
  rtp: 95.9,
};
export const treasureStackPlay = (next: () => number) => linePlay(TREASURE_STACK_CONFIG, next);

/** Ice Fortune: 5x3, 20 paylines, the snowy hat is WILD, the frozen pot of gold is SCATTER. Simulated RTP about 96.0% (2 runs of 2 million spins: 96.11% and 95.91%). */
export const ICE_FORTUNE_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [30, 28, 26, 24, 12, 10, 8, 6, 5, 4],
  weightTotal: 153,
  mode: 'lines',
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0]],
  pays: [[590, 1170, 4690], [590, 1170, 4690], [590, 1760, 5860], [940, 2340, 8790], [1170, 3510, 11710], [1760, 4690, 17570], [2340, 7030, 29280], [3510, 11710, 46850], [4690, 17570, 70280], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 7000 }, { min: 4, milli: 35100 }, { min: 5, milli: 140600 }] },
  capX: 400,
  rtp: 96.0,
};
export const iceFortunePlay = (next: () => number) => linePlay(ICE_FORTUNE_CONFIG, next);

/** Seven Orchard: 5x4, 40 paylines of fruit, the crown is WILD, the star is SCATTER. Simulated RTP about 95.5% (2 runs of 2 million spins: 95.52% and 95.54%). */
export const SEVEN_ORCHARD_CONFIG: LineConfig = {
  reels: 5,
  rows: 4,
  weights: [24, 24, 22, 22, 18, 16, 12, 8, 5, 4],
  weightTotal: 155,
  mode: 'lines',
  lines: [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [0, 0, 0, 1, 0], [0, 0, 1, 0, 0], [0, 0, 1, 1, 0], [0, 1, 0, 0, 0], [0, 1, 1, 0, 0], [0, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 0, 0, 1, 1], [1, 0, 1, 1, 1], [1, 1, 0, 0, 1], [1, 1, 0, 1, 1], [1, 1, 1, 0, 1], [1, 1, 1, 2, 1], [1, 1, 2, 1, 1], [1, 1, 2, 2, 1], [1, 2, 1, 1, 1], [1, 2, 2, 1, 1], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2], [2, 1, 1, 2, 2], [2, 1, 2, 2, 2], [2, 2, 1, 1, 2], [2, 2, 1, 2, 2], [2, 2, 2, 1, 2], [2, 2, 2, 3, 2], [2, 2, 3, 2, 2], [0, 0, 0, 0, 1], [0, 0, 0, 1, 1], [0, 0, 1, 1, 1], [0, 1, 1, 1, 1], [1, 0, 0, 0, 0], [1, 1, 0, 0, 0], [1, 1, 1, 0, 0], [1, 1, 1, 1, 0], [1, 1, 1, 1, 2], [1, 1, 1, 2, 2]],
  pays: [[270, 810, 2710], [270, 810, 2710], [430, 1080, 3250], [430, 1080, 3250], [540, 1630, 5420], [810, 2170, 8130], [1080, 4060, 13550], [2710, 10840, 54190], [2710, 10840, 54190], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 4300 }, { min: 4, milli: 21700 }, { min: 5, milli: 108400 }] },
  capX: 500,
  rtp: 95.5,
};
export const sevenOrchardPlay = (next: () => number) => linePlay(SEVEN_ORCHARD_CONFIG, next);

/** Savanna Charge: 5x4, 1024 ways to win (left to right, adjacent reels), the rhino is WILD, the sunset is SCATTER. Simulated RTP about 95.7% (2 runs of 2 million spins: 95.77% and 95.67%). */
export const SAVANNA_CHARGE_CONFIG: LineConfig = {
  reels: 5,
  rows: 4,
  weights: [30, 28, 26, 24, 14, 12, 10, 8, 5, 3],
  weightTotal: 160,
  mode: 'ways',
  pays: [[80, 190, 380], [80, 190, 380], [120, 230, 460], [120, 310, 570], [190, 380, 770], [190, 460, 960], [310, 570, 1530], [380, 960, 2300], [0, 0, 0], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 1500 }, { min: 4, milli: 7600 }, { min: 5, milli: 38200 }] },
  capX: 500,
  rtp: 95.7,
};
export const savannaChargePlay = (next: () => number) => linePlay(SAVANNA_CHARGE_CONFIG, next);

/** Vault Heist: 5x3, 25 paylines, the mask is WILD, the vault door is SCATTER. Simulated RTP about 96.0% (2 runs of 2 million spins: 95.86% and 96.14%). */
export const VAULT_HEIST_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [30, 28, 26, 24, 12, 10, 8, 6, 6, 3],
  weightTotal: 153,
  mode: 'lines',
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [1, 0, 2, 0, 1], [1, 2, 0, 2, 1], [0, 2, 2, 2, 0], [2, 0, 0, 0, 2]],
  pays: [[440, 860, 3460], [440, 860, 3460], [440, 1300, 4320], [700, 1730, 6480], [860, 2590, 8640], [1300, 3460, 12960], [1730, 5180, 21610], [2590, 8640, 43200], [3460, 12960, 64810], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 4400 }, { min: 4, milli: 21600 }, { min: 5, milli: 108000 }] },
  capX: 750,
  rtp: 96.0,
};
export const vaultHeistPlay = (next: () => number) => linePlay(VAULT_HEIST_CONFIG, next);

/** Lava Dragon: 5x3, 10 paylines, high volatility, the dragon is WILD, the dragon egg is SCATTER. Simulated RTP about 95.9% (2 runs of 2 million spins: 95.77% and 95.99%). */
export const LAVA_DRAGON_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [32, 30, 28, 26, 10, 8, 6, 5, 4, 3],
  weightTotal: 152,
  mode: 'lines',
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1]],
  pays: [[880, 2620, 8730], [880, 2620, 8730], [1390, 3490, 13090], [1750, 4370, 17460], [3490, 10480, 34910], [4370, 17460, 69830], [6980, 26190, 130930], [13090, 52380, 261860], [17460, 87290, 523710], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 5300 }, { min: 4, milli: 43700 }, { min: 5, milli: 261900 }] },
  capX: 1500,
  rtp: 95.9,
};
export const lavaDragonPlay = (next: () => number) => linePlay(LAVA_DRAGON_CONFIG, next);

/**
 * Forest Howl: 7 forest symbols, the wolf is WILD, the moon is SCATTER (4 / 5 / 6+ on the first board pay 2.3x / 7.7x / 23.1x),
 * up to 10 tumbles, no multiplier. Simulated RTP about 95.8% (2 runs of 3 million spins: 95.78% and 95.79%).
 */
export const FOREST_HOWL_CONFIG: TumbleConfig = {
  weights: [13, 13, 13, 12, 12, 12, 11, 2, 4],
  weightTotal: 92,
  bands: [8, 10, 12, 15],
  pays: [[3, 4, 5, 9], [4, 5, 7, 12], [5, 6, 9, 15], [6, 8, 12, 19], [8, 11, 15, 26], [12, 15, 22, 37], [23, 31, 42, 73], [0, 0, 0, 0], [0, 0, 0, 0]],
  maxTumbles: 10,
  capX: 100,
  growingMultiplier: false,
  rtp: 95.8,
  wild: 7,
  scatter: { symbol: 8, pays: [{ min: 4, tenths: 23 }, { min: 5, tenths: 77 }, { min: 6, tenths: 231 }] },
};
export const forestHowlPlay = (next: () => number) => tumblePlay(FOREST_HOWL_CONFIG, next);

// --- Carthage Cards: one card for the player and one for the dealer from a 32-card deck (7 to A in four suits).
// Higher rank wins and pays 1.9x, equal ranks give the stake back. Card id 0..31: rank = 7 + id % 8 (7..14, A = 14), suit = floor(id / 8).
// RTP = 14/31 x 1.9 + 3/31 x 1 = 95.48%.
export const CARTHAGE_CARDS_RTP = 95.48;
export const CARTHAGE_CARDS_WIN = { num: 19, den: 10 } as const;
export const cardsRank = (id: number): number => 7 + (id % 8);
/** `a` picks the player's card (0..31), `b` the dealer's card among the 31 left (0..30). */
export function carthageCardsDeal(a: number, b: number): { player: number; dealer: number; outcome: 'win' | 'tie' | 'lose'; num: number; den: number } {
  const player = a;
  const dealer = b >= a ? b + 1 : b;
  const p = cardsRank(player);
  const d = cardsRank(dealer);
  if (p > d) return { player, dealer, outcome: 'win', ...CARTHAGE_CARDS_WIN };
  if (p === d) return { player, dealer, outcome: 'tie', num: 1, den: 1 };
  return { player, dealer, outcome: 'lose', num: 0, den: 1 };
}


/** Palace Crown: classic 3x3, 5 paylines, only three of a kind pays, the royal crown is WILD. Exact RTP 95.96% (computed over every line outcome). */
export const PALACE_CROWN_CONFIG: LineConfig = {
  reels: 3,
  rows: 3,
  weights: [30, 24, 20, 16, 12, 8, 5, 4],
  weightTotal: 119,
  mode: 'lines',
  lines: [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]],
  pays: [[1080, 0, 0], [2160, 0, 0], [4060, 0, 0], [6760, 0, 0], [10820, 0, 0], [21640, 0, 0], [54090, 0, 0], [135230, 0, 0]],
  wild: 7,
  capX: 500,
  rtp: 95.96,
};
export const palaceCrownPlay = (next: () => number) => linePlay(PALACE_CROWN_CONFIG, next);

/** Lion Pride: 5x4, 40 paylines, the lion crest is WILD, the sunset rock is SCATTER. Simulated RTP about 96.0% (2 runs of 2 million spins: 95.95% and 96.02%). */
export const LION_PRIDE_CONFIG: LineConfig = {
  reels: 5,
  rows: 4,
  weights: [26, 26, 24, 24, 18, 16, 12, 10, 6, 4, 4],
  weightTotal: 170,
  mode: 'lines',
  lines: [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2], [3, 3, 3, 3, 3], [0, 0, 0, 1, 0], [0, 0, 1, 0, 0], [0, 0, 1, 1, 0], [0, 1, 0, 0, 0], [0, 1, 1, 0, 0], [0, 1, 1, 1, 0], [1, 0, 0, 0, 1], [1, 0, 0, 1, 1], [1, 0, 1, 1, 1], [1, 1, 0, 0, 1], [1, 1, 0, 1, 1], [1, 1, 1, 0, 1], [1, 1, 1, 2, 1], [1, 1, 2, 1, 1], [1, 1, 2, 2, 1], [1, 2, 1, 1, 1], [1, 2, 2, 1, 1], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2], [2, 1, 1, 2, 2], [2, 1, 2, 2, 2], [2, 2, 1, 1, 2], [2, 2, 1, 2, 2], [2, 2, 2, 1, 2], [2, 2, 2, 3, 2], [2, 2, 3, 2, 2], [0, 0, 0, 0, 1], [0, 0, 0, 1, 1], [0, 0, 1, 1, 1], [0, 1, 1, 1, 1], [1, 0, 0, 0, 0], [1, 1, 0, 0, 0], [1, 1, 1, 0, 0], [1, 1, 1, 1, 0], [1, 1, 1, 1, 2], [1, 1, 1, 2, 2]],
  pays: [[360, 1070, 3570], [360, 1070, 3570], [580, 1430, 4290], [580, 1430, 4290], [720, 2140, 7140], [1070, 2850, 10710], [1430, 4290, 14280], [2140, 7140, 28550], [3570, 14280, 71400], [3570, 14280, 71400], [0, 0, 0]],
  wild: 9,
  scatter: { symbol: 10, pays: [{ min: 3, milli: 5800 }, { min: 4, milli: 28500 }, { min: 5, milli: 142800 }] },
  capX: 500,
  rtp: 96.0,
};
export const lionPridePlay = (next: () => number) => linePlay(LION_PRIDE_CONFIG, next);

/** Genie's Lamp: 5x4, 1024 ways to win, the lamp is WILD, the palace is SCATTER. Simulated RTP about 96.2% (2 runs of 2 million spins: 96.11% and 96.36%). */
export const GENIE_LAMP_CONFIG: LineConfig = {
  reels: 5,
  rows: 4,
  weights: [30, 28, 26, 24, 14, 12, 10, 8, 6, 5, 3],
  weightTotal: 166,
  mode: 'ways',
  pays: [[90, 220, 440], [90, 220, 440], [130, 260, 530], [130, 350, 660], [220, 440, 860], [220, 530, 1080], [350, 660, 1730], [440, 1080, 2590], [660, 1730, 4310], [0, 0, 0], [0, 0, 0]],
  wild: 9,
  scatter: { symbol: 10, pays: [{ min: 3, milli: 1800 }, { min: 4, milli: 8600 }, { min: 5, milli: 43100 }] },
  capX: 500,
  rtp: 96.2,
};
export const genieLampPlay = (next: () => number) => linePlay(GENIE_LAMP_CONFIG, next);

/** Lucky Jig: 5x3, 20 paylines, the dancing leprechaun is WILD, the rainbow is SCATTER. Simulated RTP about 96.0% (2 runs of 2 million spins: 96.18% and 95.88%). */
export const LUCKY_JIG_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [30, 28, 26, 24, 12, 10, 8, 6, 6, 4],
  weightTotal: 154,
  mode: 'lines',
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0]],
  pays: [[540, 1080, 4290], [540, 1080, 4290], [540, 1610, 5370], [860, 2150, 8050], [1080, 3220, 10730], [1610, 4290, 16100], [2150, 6430, 26820], [3220, 10730, 42920], [4290, 16100, 64390], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 5400 }, { min: 4, milli: 26800 }, { min: 5, milli: 107300 }] },
  capX: 500,
  rtp: 96.0,
};
export const luckyJigPlay = (next: () => number) => linePlay(LUCKY_JIG_CONFIG, next);

/** Hannibal Triumph: 5x3, 20 paylines — flagship slot (original IP). Lion crest WILD, treasure chest SCATTER. RTP ~96.0%. */
export const HANNIBAL_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [28, 26, 24, 22, 14, 12, 10, 8, 6, 4],
  weightTotal: 154,
  mode: 'lines',
  lines: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0]],
  pays: [[620, 1240, 4960], [620, 1240, 4960], [620, 1860, 6200], [990, 2480, 9300], [1240, 3720, 12400], [1860, 4960, 18600], [2480, 7440, 31000], [3720, 12400, 49600], [4960, 18600, 74400], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 6200 }, { min: 4, milli: 31000 }, { min: 5, milli: 124000 }] },
  capX: 600,
  rtp: 96.0,
};
export const hannibalPlay = (next: () => number) => linePlay(HANNIBAL_CONFIG, next);

const LINES_10: LineConfig['lines'] = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1]];
const LINES_20: LineConfig['lines'] = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0]];
/** 100 unique paylines on a 5×4 grid. */
function lines100(): readonly (readonly number[])[] {
  const out: number[][] = [];
  const seen = new Set<string>();
  const push = (line: number[]) => {
    const key = line.join(',');
    if (seen.has(key) || line.some((r) => r < 0 || r > 3)) return;
    seen.add(key);
    out.push(line);
  };
  for (let r = 0; r < 4; r += 1) push([r, r, r, r, r]);
  const seed: number[][] = [
    [0, 1, 2, 1, 0], [3, 2, 1, 2, 3], [0, 1, 2, 3, 3], [3, 2, 1, 0, 0],
    [1, 0, 0, 0, 1], [2, 3, 3, 3, 2], [0, 0, 1, 2, 3], [3, 3, 2, 1, 0],
    [1, 1, 0, 1, 1], [2, 2, 3, 2, 2], [0, 1, 1, 1, 0], [3, 2, 2, 2, 3],
    [1, 2, 3, 2, 1], [2, 1, 0, 1, 2], [0, 0, 0, 1, 2], [3, 3, 3, 2, 1],
    [0, 1, 0, 1, 0], [3, 2, 3, 2, 3], [1, 0, 1, 0, 1], [2, 3, 2, 3, 2],
    [0, 0, 1, 0, 0], [3, 3, 2, 3, 3], [1, 1, 2, 1, 1], [2, 2, 1, 2, 2],
    [0, 1, 2, 2, 1], [3, 2, 1, 1, 2], [1, 2, 2, 2, 1], [2, 1, 1, 1, 2],
    [0, 2, 0, 2, 0], [3, 1, 3, 1, 3], [1, 3, 1, 3, 1], [2, 0, 2, 0, 2],
    [0, 0, 2, 0, 0], [3, 3, 1, 3, 3], [0, 3, 0, 3, 0], [1, 2, 1, 2, 1],
    [0, 1, 3, 1, 0], [3, 2, 0, 2, 3], [1, 0, 2, 3, 2], [2, 3, 1, 0, 1],
  ];
  for (const line of seed) push(line);
  for (let i = 0; out.length < 100; i += 1) {
    push([i % 4, Math.floor(i / 2) % 4, Math.floor(i / 3) % 4, Math.floor(i / 5) % 4, Math.floor(i / 7) % 4]);
  }
  return out.slice(0, 100);
}
const LINES_100 = lines100();

/** Cherry Party: 5x3, 20 paylines — cherries are the top fruit, cap 100×. RTP ~95.6%. */
export const CHERRY_PARTY_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [28, 26, 24, 22, 16, 12, 8, 6, 5, 4],
  weightTotal: 151,
  mode: 'lines',
  lines: LINES_20,
  pays: [[480, 960, 3840], [480, 960, 3840], [480, 1440, 4800], [720, 1920, 7200], [960, 2880, 9600], [1440, 3840, 14400], [1920, 5760, 24000], [3840, 14400, 48000], [0, 0, 0], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 4800 }, { min: 4, milli: 19200 }, { min: 5, milli: 96000 }] },
  capX: 100,
  rtp: 95.6,
};
export const cherryPartyPlay = (next: () => number) => linePlay(CHERRY_PARTY_CONFIG, next);

/** Lucky Bell: 5x3, 10 paylines — golden bell is WILD (more frequent). RTP ~96.2%. */
export const LUCKY_BELL_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [30, 28, 26, 24, 14, 12, 10, 8, 8, 4],
  weightTotal: 164,
  mode: 'lines',
  lines: LINES_10,
  pays: [[800, 2400, 8000], [800, 2400, 8000], [1200, 3200, 12000], [1600, 4000, 16000], [2400, 6400, 24000], [3200, 8000, 32000], [4000, 12000, 48000], [6400, 24000, 80000], [8000, 40000, 120000], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 4000 }, { min: 4, milli: 20000 }, { min: 5, milli: 100000 }] },
  capX: 250,
  rtp: 96.2,
};
export const luckyBellPlay = (next: () => number) => linePlay(LUCKY_BELL_CONFIG, next);

/** Power Hot Dice Edition: 5x4, 100 paylines, hotter sevens and dice, higher volatility. RTP ~95.7%. */
export const POWER_HOT_CONFIG: LineConfig = {
  reels: 5,
  rows: 4,
  weights: [26, 24, 22, 20, 16, 12, 8, 6, 4, 3],
  weightTotal: 141,
  mode: 'lines',
  lines: LINES_100,
  pays: [[90, 270, 900], [90, 270, 900], [110, 330, 1100], [110, 330, 1100], [150, 450, 1500], [200, 600, 2200], [280, 900, 3600], [400, 1400, 7000], [0, 0, 0], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 1500 }, { min: 4, milli: 8000 }, { min: 5, milli: 40000 }] },
  capX: 800,
  rtp: 95.7,
};
export const powerHotPlay = (next: () => number) => linePlay(POWER_HOT_CONFIG, next);

/** Golden Coins: 5x4, 100 paylines — steadier coin hits, genie lamp WILD. RTP ~96.4%. */
export const GOLDEN_COINS_CONFIG: LineConfig = {
  reels: 5,
  rows: 4,
  weights: [28, 26, 24, 22, 14, 12, 10, 8, 6, 4],
  weightTotal: 154,
  mode: 'lines',
  lines: LINES_100,
  pays: [[70, 210, 700], [70, 210, 700], [90, 260, 900], [90, 320, 1100], [140, 420, 1400], [180, 540, 1800], [240, 720, 2400], [360, 1200, 4000], [0, 0, 0], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 2000 }, { min: 4, milli: 10000 }, { min: 5, milli: 50000 }] },
  capX: 400,
  rtp: 96.4,
};
export const goldenCoinsPlay = (next: () => number) => linePlay(GOLDEN_COINS_CONFIG, next);

/** Extra Crown: 5x3, 20 paylines — volatile royal fruit, fat scatter (buy-bonus flavour). RTP ~95.5%. */
export const EXTRA_CROWN_CONFIG: LineConfig = {
  reels: 5,
  rows: 3,
  weights: [32, 30, 28, 24, 12, 10, 8, 6, 4, 3],
  weightTotal: 157,
  mode: 'lines',
  lines: LINES_20,
  pays: [[700, 2100, 7000], [700, 2100, 7000], [1100, 2800, 10500], [1400, 3500, 14000], [2100, 5600, 21000], [2800, 8400, 35000], [4200, 14000, 70000], [7000, 28000, 140000], [0, 0, 0], [0, 0, 0]],
  wild: 8,
  scatter: { symbol: 9, pays: [{ min: 3, milli: 8000 }, { min: 4, milli: 50000 }, { min: 5, milli: 250000 }] },
  capX: 1000,
  rtp: 95.5,
};
export const extraCrownPlay = (next: () => number) => linePlay(EXTRA_CROWN_CONFIG, next);

// --- Jewel Roulette: European wheel (37 pockets). Each spin lights 1-5 jewel numbers with a boosted straight payout.
export const JEWEL_POCKETS = 37;
/** Straight-up payout (stake included) on a number that is not a jewel. */
export const JEWEL_BASE_STRAIGHT = 30;
export const JEWEL_MULTS = [50, 75, 100, 200, 500] as const;
/** Chance weights (out of 100) for each jewel multiplier. */
export const JEWEL_MULT_WEIGHTS = [40, 25, 20, 10, 5] as const;
/** Exact RTP: straight bets 97.24% (= (3/37 x 103.75 + 34/37 x 30) / 37), outside bets 97.30%. */
export const JEWEL_ROULETTE_RTP = 97.2;
export const JEWEL_BETS = ['straight', 'red', 'black', 'even', 'odd', 'low', 'high', 'dozen1', 'dozen2', 'dozen3'] as const;
export type JewelBet = (typeof JEWEL_BETS)[number];
export interface JewelSpin {
  pocket: number;
  jewels: { number: number; mult: number }[];
}
/** draw(n, i) returns an integer in [0, n) from independent stream index i. */
export function jewelRouletteSpin(draw: (n: number, index: number) => number): JewelSpin {
  const pocket = draw(JEWEL_POCKETS, 0);
  const count = 1 + draw(5, 1);
  const pool = Array.from({ length: JEWEL_POCKETS }, (_, i) => i);
  const jewels: { number: number; mult: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const pick = pool.splice(draw(pool.length, 2 + i), 1)[0] as number;
    let r = draw(100, 10 + i);
    let k = 0;
    while (r >= (JEWEL_MULT_WEIGHTS[k] as number)) {
      r -= JEWEL_MULT_WEIGHTS[k] as number;
      k += 1;
    }
    jewels.push({ number: pick, mult: JEWEL_MULTS[k] as number });
  }
  return { pocket, jewels };
}
export function jewelRouletteMultiplier(bet: JewelBet, number: number | undefined, spin: JewelSpin): number {
  const p = spin.pocket;
  if (bet === 'straight') {
    if (number !== p) return 0;
    return spin.jewels.find((j) => j.number === p)?.mult ?? JEWEL_BASE_STRAIGHT;
  }
  if (p === 0) return 0;
  switch (bet) {
    case 'red': return rouletteColor(p) === 'red' ? 2 : 0;
    case 'black': return rouletteColor(p) === 'black' ? 2 : 0;
    case 'even': return p % 2 === 0 ? 2 : 0;
    case 'odd': return p % 2 === 1 ? 2 : 0;
    case 'low': return p <= 18 ? 2 : 0;
    case 'high': return p >= 19 ? 2 : 0;
    case 'dozen1': return p <= 12 ? 3 : 0;
    case 'dozen2': return p >= 13 && p <= 24 ? 3 : 0;
    case 'dozen3': return p >= 25 ? 3 : 0;
    default: return 0;
  }
}

// --- Lucky 7: one card from a 52-card deck (ids 0..51, see cardRank). Low = A-6, High = 8-K, Seven = exactly 7.
export const LUCKY7_BETS = ['low', 'seven', 'high'] as const;
export type Lucky7Bet = (typeof LUCKY7_BETS)[number];
/** Payout in hundredths of the stake (stake included). Exact RTP: low/high 96.00% (24/52 x 2.08), seven 96.00% (4/52 x 12.48). */
export const LUCKY7_PAYS: Readonly<Record<Lucky7Bet, number>> = { low: 208, seven: 1248, high: 208 };
export const LUCKY7_RTP = 96.0;
export function lucky7Hundredths(bet: Lucky7Bet, card: number): number {
  const r = cardRank(card);
  const kind: Lucky7Bet = r === 7 ? 'seven' : r < 7 ? 'low' : 'high';
  return kind === bet ? LUCKY7_PAYS[bet] : 0;
}

// --- Teen Patti duel: Player A and Player B get 3 cards each from one deck; bet on the stronger hand. Exact tie returns the stake.
// RTP = (1 - tie) / 2 x 1.94 + tie = 97.0% (tie chance about 0.11%).
export const TEEN_PATTI_BETS = ['a', 'b'] as const;
export type TeenPattiBet = (typeof TEEN_PATTI_BETS)[number];
/** Win payout in hundredths of the stake (stake included). */
export const TEEN_PATTI_WIN = 194;
export const TEEN_PATTI_RTP = 97.0;
/** Hand classes, strongest last. */
export const TEEN_PATTI_HANDS = ['high', 'pair', 'color', 'sequence', 'pureSequence', 'trail'] as const;
export type TeenPattiHand = (typeof TEEN_PATTI_HANDS)[number];
/** Score: class * 15^3 + kickers. Ace is high (14); A-2-3 is the second best sequence, A-K-Q the best. */
export function teenPattiScore(cards: readonly number[]): { score: number; hand: TeenPattiHand } {
  const v = cards.map((c) => { const r = cardRank(c); return r === 1 ? 14 : r; }).sort((x, y) => y - x) as [number, number, number];
  const flush = cards.every((c) => cardSuit(c) === cardSuit(cards[0] as number));
  let seqHigh = 0;
  if (v[0] - 1 === v[1] && v[1] - 1 === v[2]) seqHigh = v[0] === 14 ? 16 : v[0];
  else if (v[0] === 14 && v[1] === 3 && v[2] === 2) seqHigh = 15;
  const kick = (a: number, b: number, c: number) => a * 225 + b * 15 + c;
  let cls = 0;
  let k = kick(v[0], v[1], v[2]);
  if (v[0] === v[2]) { cls = 5; k = v[0]; }
  else if (seqHigh && flush) { cls = 4; k = seqHigh; }
  else if (seqHigh) { cls = 3; k = seqHigh; }
  else if (flush) cls = 2;
  else if (v[0] === v[1] || v[1] === v[2]) {
    cls = 1;
    const pair = v[1];
    const single = v[0] === v[1] ? v[2] : v[0];
    k = pair * 15 + single;
  }
  return { score: cls * 4000 + k, hand: TEEN_PATTI_HANDS[cls] as TeenPattiHand };
}
/** Deals 6 distinct cards: A gets the 1st, 3rd, 5th, B the 2nd, 4th, 6th. */
export function teenPattiDeal(draw: (n: number, index: number) => number): { a: number[]; b: number[] } {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const out: number[] = [];
  for (let i = 0; i < 6; i += 1) out.push(deck.splice(draw(deck.length, i), 1)[0] as number);
  return { a: [out[0], out[2], out[4]] as number[], b: [out[1], out[3], out[5]] as number[] };
}
export function teenPattiHundredths(bet: TeenPattiBet, a: readonly number[], b: readonly number[]): number {
  const sa = teenPattiScore(a).score;
  const sb = teenPattiScore(b).score;
  if (sa === sb) return 100;
  return (sa > sb) === (bet === 'a') ? TEEN_PATTI_WIN : 0;
}

// --- Central rules ---------------------------------------------------------
/** Every in-house game. A new game is added here, gets its switch in the site settings and its limits from the central rules. */
// --- Andar Bahar: a joker card, then cards dealt to Andar and Bahar in turn until one matches the joker's rank ---
// Andar is dealt first, so it wins 51.50% of rounds. Pays: Andar 1.83x (RTP 94.25%), Bahar 1.94x (RTP 94.09%).
export const ANDAR_BAHAR_BETS = ['andar', 'bahar'] as const;
export type AndarBaharBet = (typeof ANDAR_BAHAR_BETS)[number];
export const ANDAR_BAHAR_PAYS: Readonly<Record<AndarBaharBet, { num: number; den: number }>> = { andar: { num: 183, den: 100 }, bahar: { num: 194, den: 100 } };
export const ANDAR_BAHAR_RTP: Readonly<Record<AndarBaharBet, number>> = { andar: 94.25, bahar: 94.09 };
/** Deals from a shuffled 52-card deck (ids 0..51). */
export function andarBaharDeal(deck: readonly number[]): { joker: number; andar: number[]; bahar: number[]; winner: AndarBaharBet } {
  const joker = deck[0] as number;
  const rank = cardRank(joker);
  const andar: number[] = [];
  const bahar: number[] = [];
  for (let i = 1; i < deck.length; i += 1) {
    const card = deck[i] as number;
    const side: AndarBaharBet = (i - 1) % 2 === 0 ? 'andar' : 'bahar';
    (side === 'andar' ? andar : bahar).push(card);
    if (cardRank(card) === rank) return { joker, andar, bahar, winner: side };
  }
  throw new Error('andar bahar: the deck has no matching card');
}

// --- Casino War: one card each from a 52-card deck, ace high. Win pays 1.94x, a tie gives half the stake back.
// RTP = 48/51 x 1/2 x 1.94 + 3/51 x 0.5 = 94.24%.
export const WAR_RTP = 94.24;
export const warValue = (id: number): number => (cardRank(id) === 1 ? 14 : cardRank(id));
export function warPayout(player: number, dealer: number): { outcome: 'win' | 'tie' | 'lose'; num: number; den: number } {
  const p = warValue(player);
  const d = warValue(dealer);
  if (p > d) return { outcome: 'win', num: 194, den: 100 };
  if (p === d) return { outcome: 'tie', num: 1, den: 2 };
  return { outcome: 'lose', num: 0, den: 1 };
}

import { BATCH21_SLOT_IDS, batch21SlotById, type Batch21SlotId, type Batch21Template } from './batch21-slots.ts';
import { SUGAR_CONFIG } from './sugar.ts';
import { CT_CAP_X } from './crazytime.ts';
import { REEL_SLOT_CONFIGS } from './reel-slots.ts';
import { BJ_CAP_X } from './blackjack.ts';

const CORE_GAME_IDS = ['wheel', 'coin', 'dice', 'slots', 'crash', 'roulette', 'plinko', 'keno', 'mines', 'dragontiger', 'baccarat', 'sicbo', 'pairplus', 'scratch', 'goldrush', 'strike', 'raptor', 'candy', 'thunder', 'ocean', 'aztec', 'hotfruits', 'ancientbook', 'andarbahar', 'casinowar', 'desert', 'chilli', 'candyburst', 'lionsroar', 'tidal', 'olympusstorm', 'diamondblitz', 'vesuvius', 'deepcatch', 'luckyclover', 'jestersdice', 'pharaohcodex', 'treasurestack', 'icefortune', 'sevenorchard', 'savannacharge', 'vaultheist', 'lavadragon', 'foresthowl', 'carthagecards', 'palacecrown', 'lionpride', 'genielamp', 'luckyjig', 'hannibal', 'cherryparty', 'luckybell', 'powerhot', 'goldencoins', 'extracrown', 'jewelroulette', 'lucky7', 'teenpatti', 'sugarhannibal', 'crazytime', 'thunderroulette', 'chilliheat', 'ultimatestriker', 'bigbass', 'blackjack'] as const;

export const GAME_IDS = [...CORE_GAME_IDS, ...BATCH21_SLOT_IDS] as const;
export type GameId = (typeof GAME_IDS)[number];

const BATCH21_TEMPLATE_CONFIG: Record<Batch21Template, LineConfig> = {
  fruit100: POWER_HOT_CONFIG,
  fruit20: CHERRY_PARTY_CONFIG,
  genie: GENIE_LAMP_CONFIG,
  coins: GOLDEN_COINS_CONFIG,
  hannibal: HANNIBAL_CONFIG,
};

export function batch21LineConfig(id: Batch21SlotId): LineConfig {
  const slot = batch21SlotById(id);
  if (!slot) throw new Error(`Unknown batch21 slot: ${id}`);
  return BATCH21_TEMPLATE_CONFIG[slot.template];
}

const BATCH21_MAX_MULT = Object.fromEntries(
  BATCH21_SLOT_IDS.map((id) => [id, batch21LineConfig(id as Batch21SlotId).capX]),
) as Record<Batch21SlotId, number>;

/** Highest multiplier each game can pay (rounded up). The central max-win rule turns it into a stake limit. */
export const GAME_MAX_MULTIPLIER: Readonly<Record<GameId, number>> = {
  wheel: 10,
  coin: 2,
  dice: Math.ceil(DICE_RTP_PERCENT / 2),
  slots: 175,
  crash: CRASH_TARGET_MAX_X100 / 100,
  roulette: 36,
  plinko: 25,
  keno: 100,
  mines: MINES_MAX_MULTIPLIER,
  dragontiger: 13,
  baccarat: 9,
  sicbo: 181,
  pairplus: 41,
  scratch: 200,
  goldrush: GOLD_CAP_X,
  strike: 50,
  raptor: 27,
  candy: Math.ceil(SCATTER_MAX_TENTHS / 10),
  thunder: Math.ceil(SCATTER_MAX_TENTHS / 10),
  ocean: Math.ceil(SCATTER_MAX_TENTHS / 10),
  aztec: Math.ceil(SCATTER_MAX_TENTHS / 10),
  hotfruits: GOLD_CAP_X,
  ancientbook: GOLD_CAP_X,
  andarbahar: 2,
  casinowar: 2,
  desert: DESERT_CONFIG.capX,
  chilli: CHILLI_CONFIG.capX,
  lionsroar: LIONS_ROAR_CONFIG.capX,
  tidal: TIDAL_CONFIG.capX,
  olympusstorm: OLYMPUS_CONFIG.capX,
  diamondblitz: DIAMOND_BLITZ_CONFIG.capX,
  vesuvius: VESUVIUS_CONFIG.capX,
  deepcatch: DEEP_CATCH_CONFIG.capX,
  luckyclover: LUCKY_CLOVER_CONFIG.capX,
  jestersdice: JESTERS_DICE_CONFIG.capX,
  pharaohcodex: PHARAOH_CODEX_CONFIG.capX,
  treasurestack: TREASURE_STACK_CONFIG.capX,
  icefortune: ICE_FORTUNE_CONFIG.capX,
  sevenorchard: SEVEN_ORCHARD_CONFIG.capX,
  savannacharge: SAVANNA_CHARGE_CONFIG.capX,
  vaultheist: VAULT_HEIST_CONFIG.capX,
  lavadragon: LAVA_DRAGON_CONFIG.capX,
  foresthowl: FOREST_HOWL_CONFIG.capX,
  carthagecards: 2,
  palacecrown: PALACE_CROWN_CONFIG.capX,
  lionpride: LION_PRIDE_CONFIG.capX,
  genielamp: GENIE_LAMP_CONFIG.capX,
  luckyjig: LUCKY_JIG_CONFIG.capX,
  hannibal: HANNIBAL_CONFIG.capX,
  cherryparty: CHERRY_PARTY_CONFIG.capX,
  luckybell: LUCKY_BELL_CONFIG.capX,
  powerhot: POWER_HOT_CONFIG.capX,
  goldencoins: GOLDEN_COINS_CONFIG.capX,
  extracrown: EXTRA_CROWN_CONFIG.capX,
  jewelroulette: 500,
  lucky7: Math.ceil(LUCKY7_PAYS.seven / 100),
  teenpatti: 2,
  candyburst: CANDY_CAP_X,
  sugarhannibal: SUGAR_CONFIG.capX,
  crazytime: CT_CAP_X,
  thunderroulette: 500,
  chilliheat: REEL_SLOT_CONFIGS.chilliheat.capX,
  ultimatestriker: REEL_SLOT_CONFIGS.ultimatestriker.capX,
  bigbass: REEL_SLOT_CONFIGS.bigbass.capX,
  blackjack: BJ_CAP_X,
  ...BATCH21_MAX_MULT,
};
