// --- Crazy Time Hannibal: money wheel with a top slot and four bonus games -------------------------------------------
// A 54-segment wheel: numbers 1, 2, 5, 10 and four bonus games (Coin Flip, Pachinko, Cash Hunt, Crazy Time). The
// player picks one or more spots; the stake is shared equally between them. Before the wheel stops, the top slot may
// put a multiplier on one spot. A number pays its value to 1 (stake back); a bonus pays its result to 1. The top slot
// multiplies the number or the bonus result. Bonus results come from fixed pools (the boards shown are drawn from
// the same pools). One round never pays more than CT_CAP_X times the stake.

export const CT_SPOTS = ['1', '2', '5', '10', 'coinflip', 'pachinko', 'cashhunt', 'crazytime'] as const;
export type CtSpot = (typeof CT_SPOTS)[number];
export type CtBonus = 'coinflip' | 'pachinko' | 'cashhunt' | 'crazytime';

export const CT_NUMBER: Readonly<Record<'1' | '2' | '5' | '10', number>> = { '1': 1, '2': 2, '5': 5, '10': 10 };
export function ctIsBonus(s: CtSpot): s is CtBonus {
  return !(s in CT_NUMBER);
}

/** The wheel, clockwise from the top: 21 × 1, 13 × 2, 7 × 5, 4 × 10, 4 Coin Flip, 2 Pachinko, 2 Cash Hunt, 1 Crazy Time. */
export const CT_WHEEL: readonly CtSpot[] = [
  'crazytime', '1', '2', '1', '5', '1', '2', '1', 'coinflip', '1', '2', '5', '1', '10', '2', '1', 'pachinko', '1',
  '2', '1', '5', '1', 'coinflip', '2', '1', '10', '1', '2', 'cashhunt', '1', '5', '2', '1', '2', '1', 'coinflip',
  '1', '10', '2', '1', '5', '1', 'pachinko', '2', '1', '5', '2', 'coinflip', '1', '10', '2', '5', 'cashhunt', '1',
];

/** Where the top slot lands (weights out of 1000; 'none' = no multiplier this round). */
export const CT_TOP_SPOT: readonly { spot: CtSpot | 'none'; w: number }[] = [
  { spot: '1', w: 159 }, { spot: '2', w: 167 }, { spot: '5', w: 95 }, { spot: '10', w: 66 },
  { spot: 'coinflip', w: 140 }, { spot: 'pachinko', w: 120 }, { spot: 'cashhunt', w: 120 }, { spot: 'crazytime', w: 100 },
  { spot: 'none', w: 33 },
];
/** Top slot multipliers on a number and on a bonus (weights). */
export const CT_TOP_MULT_NUMBER: readonly { m: number; w: number }[] = [{ m: 2, w: 50 }, { m: 3, w: 25 }, { m: 5, w: 15 }, { m: 10, w: 7 }, { m: 25, w: 3 }];
export const CT_TOP_MULT_BONUS: readonly { m: number; w: number }[] = [{ m: 2, w: 40 }, { m: 3, w: 25 }, { m: 5, w: 15 }, { m: 10, w: 12 }, { m: 25, w: 6 }, { m: 50, w: 2 }];

/** Result pools of the bonus games (value to 1, weight). */
export const CT_POOLS: Readonly<Record<CtBonus, readonly { v: number; w: number }[]>> = {
  coinflip: [{ v: 2, w: 300 }, { v: 3, w: 260 }, { v: 4, w: 180 }, { v: 5, w: 150 }, { v: 7, w: 120 }, { v: 10, w: 138 }, { v: 15, w: 83 }, { v: 20, w: 55 }, { v: 25, w: 28 }, { v: 50, w: 14 }, { v: 100, w: 6 }],
  pachinko: [{ v: 2, w: 100 }, { v: 3, w: 120 }, { v: 5, w: 160 }, { v: 7, w: 140 }, { v: 10, w: 150 }, { v: 15, w: 115 }, { v: 20, w: 92 }, { v: 25, w: 69 }, { v: 50, w: 58 }, { v: 100, w: 23 }, { v: 200, w: 11 }],
  cashhunt: [{ v: 2, w: 80 }, { v: 3, w: 100 }, { v: 5, w: 160 }, { v: 7, w: 140 }, { v: 10, w: 142 }, { v: 15, w: 108 }, { v: 20, w: 89 }, { v: 25, w: 68 }, { v: 50, w: 50 }, { v: 75, w: 20 }, { v: 100, w: 15 }, { v: 200, w: 6 }],
  crazytime: [{ v: 5, w: 130 }, { v: 10, w: 156 }, { v: 15, w: 140 }, { v: 20, w: 130 }, { v: 25, w: 110 }, { v: 50, w: 100 }, { v: 75, w: 60 }, { v: 100, w: 55 }, { v: 200, w: 22 }, { v: 500, w: 6 }],
};
/** Board sizes of the bonus games. */
export const CT_PACHINKO_SLOTS = 16;
export const CT_PACHINKO_ROWS = CT_PACHINKO_SLOTS - 1;
export const CT_CASHHUNT_TILES = 108;
export const CT_CRAZY_SEGMENTS = 32;

export const CT_CAP_X = 2500;
/** Theoretical RTP of every spot: 95.9% to 96.2% (exact calculation, max win cap included). */
export const CT_RTP = 96;

export type CtBonusDetail =
  | { kind: 'coinflip'; red: number; blue: number; side: 'red' | 'blue'; value: number }
  | { kind: 'pachinko'; slots: number[]; path: number[]; slot: number; value: number }
  | { kind: 'cashhunt'; tiles: number[]; pick: number; value: number }
  | { kind: 'crazytime'; segments: number[]; pick: number; value: number };

export interface CtResult {
  /** Index of the winning wheel segment and its spot. */
  segment: number;
  landed: CtSpot;
  top: { spot: CtSpot; mult: number } | null;
  /** Played only when the player had a bet on the bonus that landed. */
  bonus: CtBonusDetail | null;
  /** Value to 1 of the landed spot before the top slot (number value or bonus result). */
  value: number;
  /** Payout as num / den of the total stake (already capped). */
  num: number;
  den: number;
  capped: boolean;
}

function pickWeighted<T extends { w: number }>(list: readonly T[], next: (n: number) => number): T {
  const total = list.reduce((a, x) => a + x.w, 0);
  let r = next(total);
  for (const x of list) {
    if (r < x.w) return x;
    r -= x.w;
  }
  return list[list.length - 1] as T;
}
const poolValue = (kind: CtBonus, next: (n: number) => number) => pickWeighted(CT_POOLS[kind], next).v;

function playBonus(kind: CtBonus, next: (n: number) => number): CtBonusDetail {
  if (kind === 'coinflip') {
    const red = poolValue(kind, next);
    const blue = poolValue(kind, next);
    const side = next(2) === 0 ? 'red' : 'blue';
    return { kind, red, blue, side, value: side === 'red' ? red : blue };
  }
  if (kind === 'pachinko') {
    const slots = Array.from({ length: CT_PACHINKO_SLOTS }, () => poolValue(kind, next));
    const path = Array.from({ length: CT_PACHINKO_ROWS }, () => next(2));
    const slot = path.reduce((a, b) => a + b, 0);
    return { kind, slots, path, slot, value: slots[slot] as number };
  }
  if (kind === 'cashhunt') {
    const tiles = Array.from({ length: CT_CASHHUNT_TILES }, () => poolValue(kind, next));
    const pick = next(CT_CASHHUNT_TILES);
    return { kind, tiles, pick, value: tiles[pick] as number };
  }
  const segments = Array.from({ length: CT_CRAZY_SEGMENTS }, () => poolValue(kind, next));
  const pick = next(CT_CRAZY_SEGMENTS);
  return { kind, segments, pick, value: segments[pick] as number };
}

/** One round. next(n) must return a uniform integer in [0, n). `spots`: the chosen spots (1 to 8, no repeats). */
export function crazyTimePlay(spots: readonly CtSpot[], next: (n: number) => number): CtResult {
  const segment = next(CT_WHEEL.length);
  const landed = CT_WHEEL[segment] as CtSpot;
  const t = pickWeighted(CT_TOP_SPOT, next);
  let top: CtResult['top'] = null;
  if (t.spot !== 'none') top = { spot: t.spot, mult: pickWeighted(ctIsBonus(t.spot) ? CT_TOP_MULT_BONUS : CT_TOP_MULT_NUMBER, next).m };
  const bet = spots.includes(landed);
  let bonus: CtBonusDetail | null = null;
  let value = 0;
  if (ctIsBonus(landed)) {
    if (bet) {
      bonus = playBonus(landed, next);
      value = bonus.value;
    }
  } else {
    value = CT_NUMBER[landed];
  }
  const den = Math.max(1, spots.length);
  let num = 0;
  if (bet) num = value * (top && top.spot === landed ? top.mult : 1) + 1;
  const capped = num > CT_CAP_X * den;
  if (capped) num = CT_CAP_X * den;
  return { segment, landed, top, bonus, value, num, den, capped };
}
