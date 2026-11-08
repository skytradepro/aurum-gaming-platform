// --- Feature reel slots: Chilli Hot Wins, Ultimate Striker, Hannibal Big Bass ---------------------------------------
// Three original HANNIBAL 5 x 3 payline slots with their own free spins. Wins are paid left to right on fixed paylines;
// the WILD stands in for every paying symbol; scatters count anywhere on the reels.
// - Chilli Hot Wins: 20 lines. 4 or 5 trumpets (scatters) give 5 free spins at the same bet (no stake); 4 or more in
//   the free spins give 5 more.
// - Ultimate Striker: 10 lines, the WILD pays on its own. 3 or more stadiums give 5 free spins with a x2 multiplier;
//   every new 3 stadiums in the free spins give 5 more and raise the multiplier by 1 (up to x10); 2 or more WILDs on
//   a free spin double that spin's win.
// - Hannibal Big Bass: 20 lines on reel strips. Every cash fish shows its prize on the reels. 3, 4 or 5 scatters give
//   10, 15 or 20 free spins. In the free spins the fisherman is also WILD, and every fisherman on the reels collects
//   all the cash fish prizes; fishermen are counted: every 4 give +10 spins and the multiplier x2, then x3, then x10
//   (multiplier on line wins and fish). The fisherman also collects on the spin that won the free spins.
// One round (the paid spin and all its free spins) never pays more than capX times the stake.

export const RS_REELS = 5;
export const RS_ROWS = 3;
export const RS_CELLS = RS_REELS * RS_ROWS;

export const REEL_SLOT_IDS = ['chilliheat', 'ultimatestriker', 'bigbass'] as const;
export type ReelSlotId = (typeof REEL_SLOT_IDS)[number];

export interface ReelSlotConfig {
  id: ReelSlotId;
  /** Symbol codes, index = symbol id. */
  symbols: readonly string[];
  /** Every cell drawn on its own with these weights... */
  weights?: readonly number[];
  weightTotal?: number;
  /** ...or one stop per reel on these strips (Big Bass). */
  strips?: readonly (readonly number[])[];
  /** Strips of the free spins (Big Bass). */
  freeStrips?: readonly (readonly number[])[];
  /** Row of each reel, one array per payline. */
  lines: readonly (readonly number[])[];
  /** Pay for 3, 4 and 5 on a line, in thousandths of the total bet (index = symbol). */
  pays: readonly (readonly number[])[];
  wild: number;
  scatter: number;
  /** A line of WILDs only pays as this symbol (-1: it pays nothing). */
  allWildAs: number;
  /** Big Bass: a line that shows a scatter pays nothing. */
  scatterBlocksLine: boolean;
  /** Scatters needed for the free spins, and how many free spins. */
  freeMin: number;
  freeCount: number;
  /** Free spins for freeMin, freeMin + 1... scatters (Big Bass: 3, 4, 5 = 10, 15, 20); freeCount when missing. */
  freeCounts?: readonly number[];
  /** Most free spins one round can play. */
  freeMax: number;
  capX: number;
  /** Theoretical RTP in percent (simulation). */
  rtp: number;
}

export interface RsLineWin {
  line: number;
  symbol: number;
  count: number;
  /** Thousandths of the bet, multiplier included. */
  milli: number;
  cells: number[];
}

export interface RsFish {
  cell: number;
  /** Thousandths of the bet, multiplier included. */
  milli: number;
}

export interface RsSpin {
  /** 15 cells, index = row * 5 + reel. */
  grid: number[];
  wins: RsLineWin[];
  /** Cells of the scatters. */
  scatters: number[];
  /** Multiplier of this spin (free spins). */
  mult: number;
  /** Ultimate Striker: 2 when 2 or more WILDs doubled this free spin. */
  boost: number;
  /** Big Bass: the prize of every cash fish on the reels (thousandths of the bet, before the multiplier). */
  values: RsFish[];
  /** Big Bass: fish collected on this spin (multiplier included) and the fishermen that collected them. */
  fish: RsFish[];
  fishermen: number[];
  /** Big Bass: fishermen counted so far in the free spins. */
  collected: number;
  /** Free spins won on this spin. */
  award: number;
  /** Free spins left after this spin. */
  left: number;
  /** Win of this spin in thousandths of the bet. */
  milli: number;
}

export interface RsRound {
  base: RsSpin;
  free: RsSpin[];
  /** Whole round in thousandths of the bet (capped). */
  milli: number;
  capped: boolean;
}

// ------------------------------------------------------------------------------------------------ tables

const LINES_20: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [1, 0, 1, 2, 1], [1, 2, 1, 0, 1], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
];

/**
 * Chilli Hot Wins: chilli, fox, lime, hot sauce, guitar, sun, WILD (fire), scatter (trumpet). Simulated RTP about
 * 95.7% (6 million rounds): free spins about 1 round in 217.
 */
export const CHILLI_HEAT_CONFIG: ReelSlotConfig = {
  id: 'chilliheat',
  symbols: ['pepper', 'fox', 'lime', 'bottle', 'guitar', 'sun', 'wild', 'scatter'],
  weights: [22, 20, 18, 16, 13, 8, 3, 5],
  weightTotal: 105,
  lines: [...LINES_20, [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 2, 1, 2, 0]],
  pays: [
    [1000, 2500, 6000],
    [800, 2000, 4500],
    [600, 1600, 3500],
    [500, 1300, 3000],
    [420, 1000, 2000],
    [300, 750, 1500],
    [0, 0, 0],
    [0, 0, 0],
  ],
  wild: 6,
  scatter: 7,
  allWildAs: -1,
  scatterBlocksLine: false,
  freeMin: 4,
  freeCount: 5,
  freeMax: 50,
  capX: 1000,
  rtp: 95.7,
};

/**
 * Ultimate Striker: football, golden boot, whistle, glove, trophy, crown, WILD (star), scatter (stadium). Simulated RTP
 * about 95.8% (6 million rounds): free spins about 1 round in 347.
 */
export const ULTIMATE_STRIKER_CONFIG: ReelSlotConfig = {
  id: 'ultimatestriker',
  symbols: ['ball', 'boot', 'whistle', 'glove', 'trophy', 'crown', 'wild', 'scatter'],
  weights: [25, 22, 18, 15, 10, 7, 3, 2],
  weightTotal: 102,
  lines: [
    [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 2],
  ],
  pays: [
    [870, 2200, 5200],
    [870, 2600, 6500],
    [1250, 3500, 8600],
    [1700, 4300, 10800],
    [2200, 6500, 17000],
    [3500, 10800, 30000],
    [4300, 21500, 108000],
    [0, 0, 0],
  ],
  wild: 6,
  scatter: 7,
  allWildAs: 6,
  scatterBlocksLine: false,
  freeMin: 3,
  freeCount: 5,
  freeMax: 50,
  capX: 2000,
  rtp: 95.8,
};

/** Big Bass symbols. */
const BB = { fisherman: 0, fish: 1, rod: 2, tackle: 3, float: 4, dragonfly: 5, a: 6, k: 7, q: 8, j: 9, ten: 10, wild: 11, scatter: 12 } as const;
const BB_CODES = ['fisherman', 'fish', 'rod', 'tackle', 'float', 'dragonfly', 'a', 'k', 'q', 'j', 'ten', 'wild', 'scatter'] as const;
const bbStrip = (s: string): number[] => s.split(' ').map((c) => BB_CODES.indexOf(c as (typeof BB_CODES)[number]));

/** Reel strips of the paid spins: the original 20 stops, then 6 more card and fishing symbols (1 scatter in 26). */
const BB_STRIPS: readonly (readonly number[])[] = [
  bbStrip('fisherman fish rod float a k q j ten wild scatter tackle dragonfly fish fisherman rod a k float q a k q j ten rod'),
  bbStrip('fish fisherman float rod k a j q ten wild scatter tackle dragonfly fish rod fisherman q k a float k a j q ten float'),
  bbStrip('rod fish fisherman a float k q j ten wild scatter dragonfly tackle fish rod fisherman j q k a q j a k ten rod'),
  bbStrip('float fisherman rod fish q a k j ten wild scatter dragonfly tackle fisherman fish rod a q k j j q k a ten float'),
  bbStrip('fisherman rod fish float j q a k ten wild scatter tackle dragonfly fisherman fish rod q k a j a q k j ten rod'),
];

/** Cash fish prizes in thousandths of the bet (one is drawn for every cash fish on the reels; repeats = more often). */
export const BIG_BASS_FISH: readonly number[] = [500, 500, 1000, 1000, 1500, 1500, 1500, 2500, 2500, 3000, 5000, 5000, 8000, 10000, 12500, 25000];
/** Fishermen counted in the free spins: every 4 give +10 spins and the new multiplier. */
export const BIG_BASS_LEVELS: readonly { at: number; spins: number; mult: number }[] = [
  { at: 4, spins: 10, mult: 2 },
  { at: 8, spins: 10, mult: 3 },
  { at: 12, spins: 10, mult: 10 },
];

/**
 * Hannibal Big Bass. Simulated RTP about 95.3% (3 runs of 3 million rounds: 95.52%, 95.08%, 95.42%): free spins about
 * 1 round in 78 (3 or more scatters), 12.3 free spins on average.
 */
export const BIG_BASS_CONFIG: ReelSlotConfig = {
  id: 'bigbass',
  symbols: [...BB_CODES],
  strips: BB_STRIPS,
  // free spins: no scatters; one fisherman on reels 2 and 4 only (the other fishermen become cash fish), 11 more symbols
  freeStrips: BB_STRIPS.map((strip, reel) => [
    ...strip.map((s, i) => (s === BB.scatter ? BB.a : s === BB.fisherman && ((reel !== 1 && reel !== 3) || strip.indexOf(BB.fisherman) !== i) ? BB.fish : s)),
    ...bbStrip('a q k j ten float rod tackle dragonfly a q'),
  ]),
  lines: [...LINES_20, [0, 2, 0, 2, 0], [2, 0, 2, 0, 2], [0, 2, 2, 2, 0], [2, 0, 0, 0, 2], [1, 1, 0, 1, 1]],
  pays: [
    [2500, 10000, 25000],
    [2000, 6000, 18000],
    [1500, 5000, 12000],
    [1200, 3500, 10000],
    [1000, 3000, 7500],
    [750, 2500, 6000],
    [650, 1800, 5000],
    [650, 1800, 5000],
    [500, 1500, 3500],
    [500, 1500, 3500],
    [500, 1200, 3000],
    [0, 0, 0],
    [0, 0, 0],
  ],
  wild: BB.wild,
  scatter: BB.scatter,
  allWildAs: BB.fisherman,
  scatterBlocksLine: true,
  freeMin: 3,
  freeCount: 10,
  freeCounts: [10, 15, 20],
  freeMax: 60,
  capX: 2000,
  rtp: 95.3,
};

export const REEL_SLOT_CONFIGS: Readonly<Record<ReelSlotId, ReelSlotConfig>> = {
  chilliheat: CHILLI_HEAT_CONFIG,
  ultimatestriker: ULTIMATE_STRIKER_CONFIG,
  bigbass: BIG_BASS_CONFIG,
};

// ------------------------------------------------------------------------------------------------ engine

/** A random whole number in [0, n). */
export type RsRand = (n: number) => number;

function drawGrid(cfg: ReelSlotConfig, rand: RsRand, free: boolean): number[] {
  const grid = new Array<number>(RS_CELLS).fill(0);
  const strips = free && cfg.freeStrips ? cfg.freeStrips : cfg.strips;
  if (strips) {
    for (let reel = 0; reel < RS_REELS; reel += 1) {
      const strip = strips[reel] as readonly number[];
      const stop = rand(strip.length);
      for (let row = 0; row < RS_ROWS; row += 1) grid[row * RS_REELS + reel] = strip[(stop + row) % strip.length] as number;
    }
    return grid;
  }
  const weights = cfg.weights ?? [];
  const total = cfg.weightTotal ?? 1;
  for (let i = 0; i < RS_CELLS; i += 1) {
    const r = rand(total);
    let acc = 0;
    let sym = weights.length - 1;
    for (let s = 0; s < weights.length; s += 1) {
      acc += weights[s] as number;
      if (r < acc) {
        sym = s;
        break;
      }
    }
    grid[i] = sym;
  }
  return grid;
}

/** Line wins of a grid (left to right), each multiplied by `mult`. */
export function reelSlotLineWins(cfg: ReelSlotConfig, grid: readonly number[], mult = 1, extraWild = -1): RsLineWin[] {
  const wins: RsLineWin[] = [];
  cfg.lines.forEach((rows, line) => {
    const syms = rows.map((row, reel) => grid[row * RS_REELS + reel] as number);
    if (cfg.scatterBlocksLine && syms.includes(cfg.scatter)) return;
    let lead = -1;
    let count = 0;
    for (const s of syms) {
      if (s === cfg.scatter) break;
      if (s === cfg.wild || s === extraWild) {
        count += 1;
        continue;
      }
      if (lead === -1) lead = s;
      if (s !== lead) break;
      count += 1;
    }
    const symbol = lead === -1 ? cfg.allWildAs : lead;
    if (count < 3 || symbol < 0) return;
    const pay = cfg.pays[symbol]?.[count - 3] ?? 0;
    if (pay > 0) wins.push({ line, symbol, count, milli: pay * mult, cells: rows.slice(0, count).map((row, reel) => row * RS_REELS + reel) });
  });
  return wins;
}

function cellsOf(grid: readonly number[], symbol: number): number[] {
  const out: number[] = [];
  grid.forEach((s, i) => {
    if (s === symbol) out.push(i);
  });
  return out;
}

function spinOf(cfg: ReelSlotConfig, grid: number[], mult: number, extraWild = -1): RsSpin {
  const wins = reelSlotLineWins(cfg, grid, mult, extraWild);
  return { grid, wins, scatters: cellsOf(grid, cfg.scatter), mult, boost: 1, values: [], fish: [], fishermen: [], collected: 0, award: 0, left: 0, milli: wins.reduce((a, w) => a + w.milli, 0) };
}

function freeCountFor(cfg: ReelSlotConfig, scatters: number): number {
  if (scatters < cfg.freeMin) return 0;
  const list = cfg.freeCounts ?? [];
  return list[Math.min(scatters - cfg.freeMin, list.length - 1)] ?? cfg.freeCount;
}

/**
 * One round: the paid spin and all its free spins. `randFor(n)` gives the random numbers of spin n (0 = the paid
 * spin, 1... = the free spins), so every spin keeps its own numbers.
 */
export function reelSlotRound(cfg: ReelSlotConfig, randFor: (spin: number) => RsRand): RsRound {
  const r0 = randFor(0);
  const base = spinOf(cfg, drawGrid(cfg, r0, false), 1);
  const free: RsSpin[] = [];
  let left = freeCountFor(cfg, base.scatters.length);
  base.award = left;

  if (cfg.id === 'bigbass') {
    // every cash fish shows its prize; the fisherman collects them in the free spins (and on the spin that won them)
    const prizes = (spin: RsSpin, rand: RsRand) => {
      spin.values = cellsOf(spin.grid, BB.fish).map((cell) => ({ cell, milli: BIG_BASS_FISH[rand(BIG_BASS_FISH.length)] as number }));
    };
    prizes(base, r0);
    let mult = 1;
    let collected = 0;
    const collect = (spin: RsSpin) => {
      spin.fishermen = cellsOf(spin.grid, BB.fisherman);
      if (spin.fishermen.length === 0) return;
      for (const v of spin.values) {
        const milli = v.milli * spin.mult;
        spin.fish.push({ cell: v.cell, milli });
        spin.milli += milli;
      }
      const before = collected;
      collected += spin.fishermen.length;
      for (const level of BIG_BASS_LEVELS) {
        if (before < level.at && collected >= level.at) {
          spin.award += level.spins;
          mult = level.mult;
        }
      }
    };
    if (left > 0) {
      collect(base);
      base.collected = collected;
      left = base.award;
    }
    base.left = left;
    while (left > 0 && free.length < cfg.freeMax) {
      const rand = randFor(free.length + 1);
      // in the free spins the fisherman is also WILD
      const spin = spinOf(cfg, drawGrid(cfg, rand, true), mult, BB.fisherman);
      prizes(spin, rand);
      left -= 1;
      spin.award += freeCountFor(cfg, spin.scatters.length);
      collect(spin);
      spin.collected = collected;
      left = Math.min(left + spin.award, cfg.freeMax - free.length - 1);
      spin.left = left;
      free.push(spin);
    }
  } else {
    base.left = left;
    let mult = cfg.id === 'ultimatestriker' ? 2 : 1;
    while (left > 0 && free.length < cfg.freeMax) {
      const rand = randFor(free.length + 1);
      const grid = drawGrid(cfg, rand, true);
      const spin = spinOf(cfg, grid, mult);
      left -= 1;
      spin.award = freeCountFor(cfg, spin.scatters.length);
      if (cfg.id === 'ultimatestriker') {
        if (cellsOf(grid, cfg.wild).length >= 2 && spin.milli > 0) {
          spin.boost = 2;
          spin.milli *= 2;
        }
        if (spin.award > 0) mult = Math.min(10, mult + 1);
      }
      left = Math.min(left + spin.award, cfg.freeMax - free.length - 1);
      spin.left = left;
      free.push(spin);
    }
  }

  const total = base.milli + free.reduce((a, s) => a + s.milli, 0);
  const cap = cfg.capX * 1000;
  return { base, free, milli: Math.min(total, cap), capped: total > cap };
}
