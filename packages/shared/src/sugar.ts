// --- Sugar Hannibal 1000: 7 x 7 cluster pays with tumbles and multiplier spots ------------------------------------
// Each spin: 49 independent symbols. 5 or more of the same candy touching side by side (up, down, left, right) form a
// cluster and pay. Winning candies burst, the others fall down, new candies drop in from the top and the board is
// checked again. Every cell where a candy bursts is marked; when a candy bursts again on a marked cell the cell
// becomes a x2 spot, and every later burst there doubles it (x4, x8 ... up to spotMax). A cluster that covers spots
// is multiplied by the sum of those spots. In the paid spin the spots are cleared after the spin; in the free spins
// they stay for all the free spins. Gold stars (scatters) never burst: 4 or more on the board give free spins.
// One spin never pays more than capX times the stake.

export const SUGAR_COLS = 7;
export const SUGAR_ROWS = 7;
export const SUGAR_CELLS = SUGAR_COLS * SUGAR_ROWS;

export interface SugarConfig {
  /** Weight of each symbol, lowest paying candy first, the scatter last. */
  weights: readonly number[];
  weightTotal: number;
  /** Smallest cluster size of each pay column: 5, 6 ... 14, 15+. */
  bands: readonly number[];
  /** Pay in tenths of the stake, per candy and pay column. */
  pays: readonly (readonly number[])[];
  /** Symbol id of the gold star (scatter). */
  scatter: number;
  /** Free spins won by the number of gold stars on the board (smallest count first). */
  freeSpins: readonly { min: number; count: number }[];
  /** Highest value of one multiplier spot. */
  spotMax: number;
  maxTumbles: number;
  capX: number;
  /** Theoretical RTP in percent (simulation). */
  rtp: number;
}

/**
 * Sugar Hannibal 1000: 7 candies and the gold star. Simulated RTP about 95.6% (paid spins and free spins together,
 * 14 million rounds for the frequencies, 12 million full rounds for the cap): free spins about 1 round in 340.
 */
export const SUGAR_CONFIG: SugarConfig = {
  weights: [320, 230, 160, 110, 75, 50, 45, 10],
  weightTotal: 1000,
  bands: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  pays: [
    [2, 2, 3, 4, 5, 6, 8, 10, 15, 24, 40],
    [2, 3, 4, 5, 6, 8, 10, 14, 20, 30, 50],
    [2, 4, 5, 6, 8, 10, 12, 17, 25, 38, 60],
    [3, 5, 7, 8, 10, 13, 16, 23, 33, 50, 80],
    [4, 6, 8, 10, 12, 16, 20, 30, 40, 60, 100],
    [8, 12, 15, 20, 25, 30, 40, 50, 75, 100, 200],
    [10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 300],
  ],
  scatter: 7,
  freeSpins: [
    { min: 4, count: 10 },
    { min: 5, count: 12 },
    { min: 6, count: 15 },
    { min: 7, count: 20 },
  ],
  spotMax: 128,
  maxTumbles: 40,
  capX: 1000,
  rtp: 95.6,
};

export interface SugarWin {
  symbol: number;
  /** Cells of the cluster (index = row * 7 + column, row 0 at the top). */
  cells: number[];
  /** Sum of the multiplier spots under the cluster (1 when there is none). */
  mult: number;
  /** Pay of the cluster in tenths of the stake (already multiplied). */
  tenths: number;
}
export interface SugarStep {
  /** The board before this step's clusters burst. */
  grid: number[];
  wins: SugarWin[];
  /** Cells that burst. */
  burst: number[];
  /** Pay of this step in tenths of the stake. */
  tenths: number;
}
export interface SugarSpin {
  steps: SugarStep[];
  final: number[];
  tenths: number;
  capped: boolean;
  /** Gold stars on the final board. */
  scatters: number;
}

export function sugarSymbolOf(r: number, cfg: SugarConfig = SUGAR_CONFIG): number {
  let from = 0;
  for (let i = 0; i < cfg.weights.length; i += 1) {
    from += cfg.weights[i] ?? 0;
    if (r < from) return i;
  }
  return cfg.weights.length - 1;
}

export function sugarPayTenths(symbol: number, size: number, cfg: SugarConfig = SUGAR_CONFIG): number {
  let band = -1;
  cfg.bands.forEach((min, i) => {
    if (size >= min) band = i;
  });
  return band < 0 ? 0 : (cfg.pays[symbol]?.[band] ?? 0);
}

/** Clusters of 5 or more touching candies (gold stars never form clusters). */
export function sugarClusters(grid: readonly number[], cfg: SugarConfig = SUGAR_CONFIG): { symbol: number; cells: number[] }[] {
  const seen = new Uint8Array(SUGAR_CELLS);
  const out: { symbol: number; cells: number[] }[] = [];
  const min = cfg.bands[0] ?? 5;
  for (let start = 0; start < SUGAR_CELLS; start += 1) {
    if (seen[start]) continue;
    seen[start] = 1;
    const symbol = grid[start] as number;
    if (symbol === cfg.scatter) continue;
    const cells = [start];
    const stack = [start];
    while (stack.length > 0) {
      const c = stack.pop() as number;
      const row = Math.floor(c / SUGAR_COLS);
      const col = c % SUGAR_COLS;
      const around = [row > 0 ? c - SUGAR_COLS : -1, row < SUGAR_ROWS - 1 ? c + SUGAR_COLS : -1, col > 0 ? c - 1 : -1, col < SUGAR_COLS - 1 ? c + 1 : -1];
      for (const n of around) {
        if (n >= 0 && !seen[n] && grid[n] === symbol) {
          seen[n] = 1;
          cells.push(n);
          stack.push(n);
        }
      }
    }
    if (cells.length >= min) out.push({ symbol, cells: cells.sort((a, b) => a - b) });
  }
  return out;
}

/** Marks the cells that burst: an empty cell becomes marked (1), a marked cell x2, a spot doubles (up to spotMax). */
export function sugarMarkSpots(spots: number[], burst: Iterable<number>, cfg: SugarConfig = SUGAR_CONFIG): void {
  for (const i of burst) {
    const v = spots[i] ?? 0;
    spots[i] = v === 0 ? 1 : Math.min(cfg.spotMax, v * 2);
  }
}

/** Free spins won with this many gold stars (0 = none). */
export function sugarFreeSpinsFor(scatters: number, cfg: SugarConfig = SUGAR_CONFIG): number {
  let count = 0;
  for (const f of cfg.freeSpins) if (scatters >= f.min) count = f.count;
  return count;
}

/**
 * Plays one spin. next() must return a uniform integer in [0, cfg.weightTotal); it is called for the 49 starting
 * cells first and then once for every new symbol, column by column from the bottom up. `spots` (49 values) carries
 * the multiplier spots: a new array for a paid spin, the same array through all the free spins. It is updated.
 */
export function sugarPlay(next: () => number, spots: number[] = new Array<number>(SUGAR_CELLS).fill(0), cfg: SugarConfig = SUGAR_CONFIG): SugarSpin {
  const grid = Array.from({ length: SUGAR_CELLS }, () => sugarSymbolOf(next(), cfg));
  const steps: SugarStep[] = [];
  let total = 0;
  for (let n = 1; n <= cfg.maxTumbles; n += 1) {
    const clusters = sugarClusters(grid, cfg);
    if (clusters.length === 0) break;
    const burstSet = new Set<number>();
    const wins: SugarWin[] = clusters.map(({ symbol, cells }) => {
      let mult = 0;
      for (const i of cells) {
        const s = spots[i] ?? 0;
        if (s >= 2) mult += s;
        burstSet.add(i);
      }
      if (mult === 0) mult = 1;
      return { symbol, cells, mult, tenths: sugarPayTenths(symbol, cells.length, cfg) * mult };
    });
    const burst = [...burstSet].sort((a, b) => a - b);
    const tenths = wins.reduce((a, w) => a + w.tenths, 0);
    steps.push({ grid: grid.slice(), wins, burst, tenths });
    total += tenths;
    sugarMarkSpots(spots, burst, cfg);
    for (let col = 0; col < SUGAR_COLS; col += 1) {
      const keep: number[] = [];
      for (let row = SUGAR_ROWS - 1; row >= 0; row -= 1) {
        const i = row * SUGAR_COLS + col;
        if (!burstSet.has(i)) keep.push(grid[i] as number);
      }
      while (keep.length < SUGAR_ROWS) keep.push(sugarSymbolOf(next(), cfg));
      for (let row = SUGAR_ROWS - 1, k = 0; row >= 0; row -= 1, k += 1) grid[row * SUGAR_COLS + col] = keep[k] as number;
    }
  }
  const cap = cfg.capX * 10;
  let scatters = 0;
  for (const v of grid) if (v === cfg.scatter) scatters += 1;
  return { steps, final: grid.slice(), tenths: Math.min(total, cap), capped: total > cap, scatters };
}
