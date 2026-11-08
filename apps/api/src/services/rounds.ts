import { createHmac } from 'node:crypto';
import { getWalletByUser, postEntry } from '@aurum/ledger';
import { parseAmountInput } from '@aurum/money';
import { AppError, CANDY_WEIGHT_TOTAL, candyBurstPlay, DESERT_CONFIG, desertRichesPlay, CHILLI_CONFIG, CHILLI_SCATTER_FREE_COUNT, CHILLI_SCATTER_FREE_MIN, chilliPlay, LIONS_ROAR_CONFIG, lionsRoarPlay, TIDAL_CONFIG, tidalPlay, OLYMPUS_CONFIG, olympusStormPlay, DIAMOND_BLITZ_CONFIG, diamondBlitzPlay, VESUVIUS_CONFIG, vesuviusPlay, DEEP_CATCH_CONFIG, deepCatchPlay, LUCKY_CLOVER_CONFIG, luckyCloverPlay, JESTERS_DICE_CONFIG, jestersDicePlay, PHARAOH_CODEX_CONFIG, pharaohCodexPlay, TREASURE_STACK_CONFIG, treasureStackPlay, ICE_FORTUNE_CONFIG, iceFortunePlay, SEVEN_ORCHARD_CONFIG, sevenOrchardPlay, SAVANNA_CHARGE_CONFIG, savannaChargePlay, VAULT_HEIST_CONFIG, vaultHeistPlay, LAVA_DRAGON_CONFIG, lavaDragonPlay, linePlay, FOREST_HOWL_CONFIG, forestHowlPlay, carthageCardsDeal, type LineConfig, PALACE_CROWN_CONFIG, LION_PRIDE_CONFIG, GENIE_LAMP_CONFIG, LUCKY_JIG_CONFIG, HANNIBAL_CONFIG, CHERRY_PARTY_CONFIG, LUCKY_BELL_CONFIG, POWER_HOT_CONFIG, GOLDEN_COINS_CONFIG, EXTRA_CROWN_CONFIG, jewelRouletteSpin, jewelRouletteMultiplier, type JewelBet, lucky7Hundredths, type Lucky7Bet, cardRank, teenPattiDeal, teenPattiScore, teenPattiHundredths, type TeenPattiBet, ANDAR_BAHAR_PAYS, andarBaharDeal, warPayout, SCATTER_CELLS, SCATTER_WEIGHTS, scatterEvaluate, scatterSymbolOf, RAPTOR_MAX_JUMPS, STRIKE_RANGE, raptorPayout, strikeResult, SCRATCH_RANGE, SCRATCH_SYMBOLS, goldEvaluate, goldGrid, goldPayout, pairPlusHand, PAIR_PLUS_PAYS, scratchPrize, sicBoMultiplier, sicBoValueOk, BACCARAT_BETS, COIN_PAYOUT, KENO_DRAWN, KENO_MAX_PICKS, KENO_NUMBERS, MINES_TILES, baccaratDeal, baccaratPayout, dragonTigerPayout, kenoTenths, minesPayout, CRASH_RANDOM_RANGE, DICE_RTP_PERCENT, PLINKO_ROWS, PLINKO_TABLES, ROULETTE_POCKETS, SLOT_REEL, crashPointX100, diceChance, rouletteMultiplier, slotsPayout } from '@aurum/shared';
import type { AndarBaharBet, ScratchSymbol, SicBoBet, BaccaratBet, DragonTigerBet, CoinSide, DiceDirection, GameId, PlinkoRisk, RouletteBet, SlotSymbol, Batch21SlotId } from '@aurum/shared';
import { batch21LineConfig, GAME_MAX_MULTIPLIER } from '@aurum/shared';
import { SUGAR_CELLS, SUGAR_CONFIG, sugarFreeSpinsFor, sugarPlay, type SugarSpin } from '@aurum/shared';
import { crazyTimePlay, type CtSpot } from '@aurum/shared';
import { REEL_SLOT_CONFIGS, reelSlotRound, type ReelSlotId, type RsSpin } from '@aurum/shared';
import { money } from '../errors.ts';
import type { Ctx } from '../http/types.ts';
import { requireRules } from './game-rules.ts';
import { getSettings, type Settings } from './settings.ts';

export interface RoundResult {
  roundId: string;
  game: string;
  win: boolean;
  multiplier: string;
  detail: Record<string, unknown>;
  stake: { amountMinor: string; currency: string };
  payout: { amountMinor: string; currency: string };
  balance: { amountMinor: string; currency: string };
}

type Draw = (n: number, index: number) => number;
interface Outcome {
  num: number;
  den: number;
  multiplier: string;
  detail: Record<string, unknown>;
}

/** Free spins on the slot games: a paid spin sometimes also wins FREE_SPINS_COUNT free spins at the same stake. */
export const FREE_SPINS_COUNT = 5;
/** Default chance: 1 paid spin in this many (Super Admin setting free_spins_one_in, 0 = off). */
export const FREE_SPINS_DEFAULT_ONE_IN = 400;
/** Random numbers of the trigger and of each free spin live far away from the paid spin's own numbers. */
const FREE_SPIN_TRIGGER_INDEX = 7_999_992;
const FREE_SPIN_STRIDE = 1_000_000;

const SLOT_FREE_SPINS = { freeSpins: true } as const;

async function freeSpinsOneIn(ctx: Ctx): Promise<number> {
  const { rows } = await ctx.db.query<{ value: unknown }>("select value from site_settings where key = 'free_spins_one_in'");
  const v = rows[0]?.value;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100_000 ? v : FREE_SPINS_DEFAULT_ONE_IN;
}

/**
 * One round of an in-house game. The random numbers come from HMAC(server secret, game + player + request key):
 * unpredictable for the player, fixed for a given request (a retry can never re-roll), not steerable from the browser.
 * The stake and the win are two ledger entries in one transaction.
 */
/**
 * Round options. freeSpins: the site-wide random free spins of the slot games. bonus: the game's own free spins
 * (e.g. won with scatters); it returns the free spins played (each one an outcome at the same stake) or null.
 */
interface RoundOptions {
  freeSpins?: boolean;
  bonus?: (draw: Draw, base: Outcome) => Outcome[] | null;
  /** Keep each free spin's own detail (reels, wins) in the result, for games that play their free spins on the reels. */
  bonusDetail?: boolean;
  /** Amount taken from the wallet when it is not the bet itself (bought spins: the package price). */
  charge?: (stake: bigint) => bigint;
  /** What the ledger keeps of the detail (big rounds keep a short summary; the player still gets the full detail). */
  ledgerDetail?: (detail: Record<string, unknown>) => Record<string, unknown>;
}

async function playRound(ctx: Ctx, game: GameId, input: { stake: string; idempotencyKey: string }, resolve: (draw: Draw) => Outcome, opts: RoundOptions = {}): Promise<RoundResult> {
  if (!ctx.config.inhouseGames) throw new AppError('not_found');
  const user = ctx.principal();
  const limit = ctx.services.limiter.hit(`round:${user.id}`, 120, 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });

  const wallet = await getWalletByUser(ctx.db, user.id);
  if (!wallet) throw new AppError('wallet_not_found');
  const cur = await ctx.db.query<{ decimals: number }>('select decimals::int from currencies where code = $1', [wallet.currency]);
  const decimals = cur.rows[0]?.decimals;
  if (decimals === undefined) throw new AppError('internal_error', { message: 'wallet currency is missing' });

  const stake = money(() => parseAmountInput(input.stake, decimals, { allowNegative: false }));
  const { minMinor: min, maxMinor: max } = await requireRules(ctx.db, game, decimals, user.id);
  if (stake < min || stake > max) throw new AppError('invalid_amount', { fields: { stake: 'invalidAmount' } });
  const charged = opts.charge ? opts.charge(stake) : stake;
  if (charged < 1n) throw new AppError('invalid_amount', { fields: { stake: 'invalidAmount' } });

  // 8 random numbers per block; games that need more (Keno, Mines) read the next blocks, each with its own HMAC.
  const blocks: Buffer[] = [];
  const digestOf = (block: number): Buffer => (blocks[block] ??= createHmac('sha256', ctx.config.gameSecret).update(`${game}:${user.id}:${input.idempotencyKey}${block === 0 ? '' : `:${block}`}`).digest());
  const draw: Draw = (n, index) => digestOf(Math.floor(index / 8)).readUInt32BE((index % 8) * 4) % n;
  const outcome = resolve(draw);
  let payout = (stake * BigInt(outcome.num)) / BigInt(outcome.den);
  let multiplier = outcome.multiplier;
  let detail: Record<string, unknown> = outcome.detail;

  // Slot games: the same random numbers decide, once per round, whether free spins were won (the game's own free
  // spins first, else the site-wide random ones). Each free spin is played with its own numbers; the total (capped at
  // the game's highest win) is paid in one entry.
  let bonus: Outcome[] | null = opts.bonus ? opts.bonus(draw, outcome) : null;
  if (!bonus && opts.freeSpins) {
    const oneIn = await freeSpinsOneIn(ctx);
    if (oneIn > 0 && draw(oneIn, FREE_SPIN_TRIGGER_INDEX) === 0) {
      bonus = [];
      for (let i = 1; i <= FREE_SPINS_COUNT; i++) {
        const offset = i * FREE_SPIN_STRIDE;
        bonus.push(resolve((n, index) => draw(n, index + offset)));
      }
    }
  }
  if (bonus && bonus.length > 0) {
    const spins: { multiplier: string; payoutMinor: string; detail?: Record<string, unknown> }[] = [];
    let extra = 0n;
    for (const o of bonus) {
      const p = (stake * BigInt(o.num)) / BigInt(o.den);
      extra += p;
      spins.push(opts.bonusDetail ? { multiplier: o.multiplier, payoutMinor: p.toString(), detail: o.detail } : { multiplier: o.multiplier, payoutMinor: p.toString() });
    }
    const cap = stake * BigInt(GAME_MAX_MULTIPLIER[game] ?? 100);
    let total = payout + extra;
    const capped = total > cap;
    if (capped) total = cap;
    detail = {
      ...detail,
      freeSpins: { count: bonus.length, baseMultiplier: outcome.multiplier, basePayoutMinor: payout.toString(), spins, totalPayoutMinor: total.toString(), capped },
    };
    multiplier = `${Number((total * 100n) / stake) / 100}×`;
    payout = total;
  }

  const scope = `game:${game}:${user.id}`;
  const reference = `${game}:${input.idempotencyKey}`;
  const metadata = { game, multiplier, ...(opts.ledgerDetail ? opts.ledgerDetail(detail) : detail) };

  return ctx.db.transaction(async (tx) => {
    const staked = await postEntry(tx, { walletId: wallet.id, entryType: 'bet_stake', amountMinor: charged, scope, idempotencyKey: `${input.idempotencyKey}:stake`, reference, reason: game, metadata });
    let balanceAfter = staked.balanceAfterMinor;
    if (payout > 0n) {
      const won = await postEntry(tx, { walletId: wallet.id, entryType: 'bet_win', amountMinor: payout, scope, idempotencyKey: `${input.idempotencyKey}:win`, reference, reason: game, metadata });
      balanceAfter = won.balanceAfterMinor;
    }
    return {
      roundId: staked.id,
      game,
      win: payout > charged,
      multiplier,
      detail,
      stake: { amountMinor: charged.toString(), currency: wallet.currency },
      payout: { amountMinor: payout.toString(), currency: wallet.currency },
      balance: { amountMinor: balanceAfter.toString(), currency: wallet.currency },
    };
  });
}

export function playCoin(ctx: Ctx, input: { stake: string; idempotencyKey: string; side: CoinSide }): Promise<RoundResult> {
  return playRound(ctx, 'coin', input, (draw) => {
    const result: CoinSide = draw(2, 0) === 0 ? 'heads' : 'tails';
    const win = result === input.side;
    return { num: win ? COIN_PAYOUT.num : 0, den: win ? COIN_PAYOUT.den : 1, multiplier: win ? '1.88×' : '0×', detail: { side: input.side, result } };
  });
}

export function playDice(ctx: Ctx, input: { stake: string; idempotencyKey: string; direction: DiceDirection; target: number }): Promise<RoundResult> {
  const chance = diceChance(input.direction, input.target);
  return playRound(ctx, 'dice', input, (draw) => {
    const roll = draw(10_000, 0); // 0..9999 = 0.00..99.99
    const win = input.direction === 'under' ? roll < input.target * 100 : roll >= input.target * 100;
    const mult = (DICE_RTP_PERCENT / chance).toFixed(4).replace(/\.?0+$/, '');
    return { num: win ? DICE_RTP_PERCENT : 0, den: win ? chance : 1, multiplier: win ? `${mult}×` : '0×', detail: { direction: input.direction, target: input.target, roll: roll / 100 } };
  });
}

export function playSlots(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  return playRound(ctx, 'slots', input, (draw) => {
    const symbols: SlotSymbol[] = [0, 1, 2].map((i) => SLOT_REEL[draw(SLOT_REEL.length, i)] ?? 'lemon');
    const p = slotsPayout(symbols);
    return { num: p.num, den: p.den, multiplier: p.num === 0 ? '0×' : `${p.num / p.den}×`, detail: { symbols } };
  }, SLOT_FREE_SPINS);
}

export function playCrash(ctx: Ctx, input: { stake: string; idempotencyKey: string; targetX100: number }): Promise<RoundResult> {
  return playRound(ctx, 'crash', input, (draw) => {
    const crash = crashPointX100(draw(CRASH_RANDOM_RANGE, 0));
    const win = crash >= input.targetX100;
    const target = input.targetX100 / 100;
    return {
      num: win ? input.targetX100 : 0,
      den: win ? 100 : 1,
      multiplier: win ? `${target}×` : '0×',
      detail: { target, crashPoint: crash / 100 },
    };
  });
}

export function playRoulette(ctx: Ctx, input: { stake: string; idempotencyKey: string; bet: RouletteBet; number?: number }): Promise<RoundResult> {
  if (input.bet === 'straight' && (input.number === undefined || input.number < 0 || input.number > 37)) {
    throw new AppError('validation', { fields: { number: 'invalidAmount' } });
  }
  return playRound(ctx, 'roulette', input, (draw) => {
    const pocket = draw(ROULETTE_POCKETS, 0);
    const mult = rouletteMultiplier(input.bet, input.number, pocket);
    return { num: mult, den: 1, multiplier: `${mult}×`, detail: { bet: input.bet, number: input.number ?? null, pocket } };
  });
}

export function playPlinko(ctx: Ctx, input: { stake: string; idempotencyKey: string; risk: PlinkoRisk }): Promise<RoundResult> {
  return playRound(ctx, 'plinko', input, (draw) => {
    const path = Array.from({ length: PLINKO_ROWS }, (_, i) => draw(2, i)); // 1 = bounces right
    const slot = path.reduce<number>((n, step) => n + step, 0);
    const tenths = PLINKO_TABLES[input.risk][slot] ?? 0;
    return { num: tenths, den: 10, multiplier: `${tenths / 10}×`, detail: { risk: input.risk, slot, path } };
  });
}

/** The first `count` entries of a random shuffle of 0..size-1 (partial Fisher-Yates driven by the round's random numbers). */
function sample(draw: Draw, size: number, count: number): number[] {
  const pool = Array.from({ length: size }, (_, i) => i);
  for (let i = 0; i < count; i += 1) {
    const j = i + draw(size - i, i);
    const tmp = pool[i] as number;
    pool[i] = pool[j] as number;
    pool[j] = tmp;
  }
  return pool.slice(0, count);
}

const distinctIn = (list: number[], size: number): boolean => new Set(list).size === list.length && list.every((n) => Number.isInteger(n) && n >= 0 && n < size);

export function playKeno(ctx: Ctx, input: { stake: string; idempotencyKey: string; picks: number[] }): Promise<RoundResult> {
  if (input.picks.length < 1 || input.picks.length > KENO_MAX_PICKS || !distinctIn(input.picks, KENO_NUMBERS)) throw new AppError('validation', { fields: { picks: 'invalid' } });
  return playRound(ctx, 'keno', input, (draw) => {
    const drawn = sample(draw, KENO_NUMBERS, KENO_DRAWN);
    const hits = input.picks.filter((n) => drawn.includes(n)).length;
    const tenths = kenoTenths(input.picks.length, hits);
    return { num: tenths, den: 10, multiplier: `${tenths / 10}×`, detail: { picks: input.picks, drawn, hits } };
  });
}

export function playMines(ctx: Ctx, input: { stake: string; idempotencyKey: string; mines: number; tiles: number[] }): Promise<RoundResult> {
  const pay = minesPayout(input.mines, input.tiles.length);
  if (!pay || !distinctIn(input.tiles, MINES_TILES)) throw new AppError('validation', { fields: { tiles: 'invalid' } });
  return playRound(ctx, 'mines', input, (draw) => {
    const mines = sample(draw, MINES_TILES, input.mines);
    const safe = input.tiles.every((t) => !mines.includes(t));
    const mult = Math.floor((pay.num * 100) / pay.den) / 100;
    return { num: safe ? pay.num : 0, den: safe ? pay.den : 1, multiplier: safe ? `${mult}×` : '0×', detail: { mines, tiles: input.tiles } };
  });
}

export function playDragonTiger(ctx: Ctx, input: { stake: string; idempotencyKey: string; bet: DragonTigerBet }): Promise<RoundResult> {
  return playRound(ctx, 'dragontiger', input, (draw) => {
    const dragon = draw(13, 0) + 1;
    const tiger = draw(13, 1) + 1;
    const p = dragonTigerPayout(input.bet, dragon, tiger);
    return { num: p.num, den: p.den, multiplier: p.num === 0 ? '0×' : `${p.num / p.den}×`, detail: { bet: input.bet, dragon, tiger } };
  });
}

export function playBaccarat(ctx: Ctx, input: { stake: string; idempotencyKey: string; bet: BaccaratBet }): Promise<RoundResult> {
  if (!(BACCARAT_BETS as readonly string[]).includes(input.bet)) throw new AppError('validation', { fields: { bet: 'invalid' } });
  return playRound(ctx, 'baccarat', input, (draw) => {
    const hand = baccaratDeal(Array.from({ length: 6 }, (_, i) => draw(13, i) + 1));
    const p = baccaratPayout(input.bet, hand.winner);
    return {
      num: p.num,
      den: p.den,
      multiplier: p.num === 0 ? '0×' : `${p.num / p.den}×`,
      detail: { bet: input.bet, player: hand.player, banker: hand.banker, playerTotal: hand.playerTotal, bankerTotal: hand.bankerTotal, winner: hand.winner },
    };
  });
}

export function playSicBo(ctx: Ctx, input: { stake: string; idempotencyKey: string; bet: SicBoBet; value?: number }): Promise<RoundResult> {
  if (!sicBoValueOk(input.bet, input.value)) throw new AppError('validation', { fields: { value: 'invalid' } });
  return playRound(ctx, 'sicbo', input, (draw) => {
    const dice = [0, 1, 2].map((i) => draw(6, i) + 1);
    const mult = sicBoMultiplier(input.bet, input.value, dice);
    return { num: mult, den: 1, multiplier: `${mult}×`, detail: { bet: input.bet, value: input.value ?? null, dice } };
  });
}

export function playPairPlus(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  return playRound(ctx, 'pairplus', input, (draw) => {
    const cards = sample(draw, 52, 3);
    const hand = pairPlusHand(cards);
    const mult = PAIR_PLUS_PAYS[hand];
    return { num: mult, den: 1, multiplier: `${mult}×`, detail: { cards, hand } };
  });
}

export function playAndarBahar(ctx: Ctx, input: { stake: string; idempotencyKey: string; bet: AndarBaharBet }): Promise<RoundResult> {
  const pay = ANDAR_BAHAR_PAYS[input.bet];
  if (!pay) throw new AppError('validation', { fields: { bet: 'invalid' } });
  return playRound(ctx, 'andarbahar', input, (draw) => {
    const deal = andarBaharDeal(sample(draw, 52, 52));
    const win = deal.winner === input.bet;
    return { num: win ? pay.num : 0, den: win ? pay.den : 1, multiplier: win ? `${pay.num / pay.den}×` : '0×', detail: { bet: input.bet, ...deal } };
  });
}

export function playCasinoWar(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  return playRound(ctx, 'casinowar', input, (draw) => {
    const [player, dealer] = sample(draw, 52, 2) as [number, number];
    const p = warPayout(player, dealer);
    return { num: p.num, den: p.den, multiplier: p.num === 0 ? '0×' : `${p.num / p.den}×`, detail: { player, dealer, outcome: p.outcome } };
  });
}

export function playScratch(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  return playRound(ctx, 'scratch', input, (draw) => {
    const prize = scratchPrize(draw(SCRATCH_RANGE, 0));
    // A winning card has exactly three of the prize symbol; every other symbol appears at most twice, so there is never a second win.
    const pool: ScratchSymbol[] = prize ? SCRATCH_SYMBOLS.filter((x) => x !== prize.symbol).flatMap((x) => [x, x]) : SCRATCH_SYMBOLS.flatMap((x) => [x, x]);
    const need = prize ? 6 : 9;
    const picked = sample((n, i) => draw(n, i + 1), pool.length, need).map((i) => pool[i] as ScratchSymbol);
    const cells: ScratchSymbol[] = prize ? [prize.symbol, prize.symbol, prize.symbol, ...picked] : picked;
    const order = sample((n, i) => draw(n, i + 1 + need), 9, 9);
    const grid = order.map((i) => cells[i] as ScratchSymbol);
    const x = prize?.x ?? 0;
    return { num: x, den: 1, multiplier: `${x}×`, detail: { grid, symbol: prize?.symbol ?? null } };
  });
}

export function playGoldRush(ctx: Ctx, input: { stake: string; idempotencyKey: string }, game: GameId = 'goldrush'): Promise<RoundResult> {
  return playRound(ctx, game, input, (draw) => {
    const stops = [0, 1, 2, 3, 4].map((i) => draw(30, i));
    const grid = goldGrid(stops);
    const { wins, units } = goldEvaluate(grid);
    const p = goldPayout(units);
    return { num: p.num, den: p.den, multiplier: p.num === 0 ? '0×' : `${Math.round((p.num / p.den) * 100) / 100}×`, detail: { stops, grid, wins } };
  }, SLOT_FREE_SPINS);
}

export function playStrike(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  return playRound(ctx, 'strike', input, (draw) => {
    const hit = strikeResult(draw(STRIKE_RANGE, 0));
    return { num: hit.tenths, den: 10, multiplier: `${hit.tenths / 10}×`, detail: { level: hit.level } };
  });
}

export function playRaptor(ctx: Ctx, input: { stake: string; idempotencyKey: string; jumps: number }): Promise<RoundResult> {
  const pay = raptorPayout(input.jumps);
  if (!pay) throw new AppError('validation', { fields: { jumps: 'invalid' } });
  return playRound(ctx, 'raptor', input, (draw) => {
    let cleared = 0;
    while (cleared < input.jumps && draw(5, cleared) !== 0) cleared += 1;
    const win = cleared === input.jumps;
    const mult = Math.floor((pay.num * 100) / pay.den) / 100;
    return { num: win ? pay.num : 0, den: win ? pay.den : 1, multiplier: win ? `${mult}×` : '0×', detail: { jumps: input.jumps, cleared, max: RAPTOR_MAX_JUMPS } };
  });
}

/** Scatter-pays slot (6 x 5). One random number per cell, so the 30 cells use four blocks of the round's random numbers. */
/** Hannibal Candy Burst: tumbles with a growing multiplier. Every new symbol uses the next HMAC number. */
export function playCandyBurst(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  return playRound(ctx, 'candyburst', input, (draw) => {
    let k = 0;
    const r = candyBurstPlay(() => draw(CANDY_WEIGHT_TOTAL, k++));
    return {
      num: r.tenths,
      den: 10,
      multiplier: r.tenths === 0 ? '0×' : `${r.tenths / 10}×`,
      detail: { steps: r.steps, final: r.final, capped: r.capped },
    };
  }, SLOT_FREE_SPINS);
}

/** Random numbers of Sugar Hannibal's free spins live far away from the paid spin's own numbers. */
const SUGAR_BONUS_INDEX = 20_000_000;

/**
 * Sugar Hannibal 1000: 7x7 cluster pays with tumbles and multiplier spots. 4 or more gold stars on the final board win
 * 10 to 20 free spins; in the free spins the multiplier spots stay from one spin to the next. Every new symbol uses
 * the next HMAC number.
 */
export function playSugarHannibal(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  const spin = (draw: Draw, start: number, spots?: number[]): SugarSpin => {
    let k = start;
    return sugarPlay(() => draw(SUGAR_CONFIG.weightTotal, k++), spots);
  };
  const outcomeOf = (r: SugarSpin, detail: Record<string, unknown>): Outcome => ({ num: r.tenths, den: 10, multiplier: r.tenths === 0 ? '0×' : `${r.tenths / 10}×`, detail });
  return playRound(
    ctx,
    'sugarhannibal',
    input,
    (draw) => {
      const r = spin(draw, 0);
      return outcomeOf(r, { steps: r.steps, final: r.final, capped: r.capped, scatters: r.scatters });
    },
    {
      bonus: (draw, base) => {
        const count = sugarFreeSpinsFor(typeof base.detail.scatters === 'number' ? base.detail.scatters : 0);
        if (count === 0) return null;
        const spots = new Array<number>(SUGAR_CELLS).fill(0);
        const out: Outcome[] = [];
        for (let i = 0; i < count; i++) out.push(outcomeOf(spin(draw, SUGAR_BONUS_INDEX + i * FREE_SPIN_STRIDE, spots), {}));
        return out;
      },
    },
  );
}

/** Random numbers of the feature reel slots' free spins live far away from the paid spin's own numbers. */
const REEL_SLOT_BONUS_INDEX = 30_000_000;

/**
 * Chilli Hot Wins, Ultimate Striker and Hannibal Big Bass: 5 x 3 payline slots with their own free spins, played
 * on the server in the same round (no stake for the free spins). Each spin uses its own range of HMAC numbers.
 */
function reelSpinDetail(game: ReelSlotId, s: RsSpin): Record<string, unknown> {
  return {
    grid: s.grid,
    wins: s.wins,
    scatters: s.scatters,
    award: s.award,
    left: s.left,
    ...(s.mult !== 1 ? { mult: s.mult } : {}),
    ...(s.boost !== 1 ? { boost: s.boost } : {}),
    ...(game === 'bigbass' ? { values: s.values, fish: s.fish, fishermen: s.fishermen, collected: s.collected } : {}),
  };
}

export function playReelSlot(ctx: Ctx, game: ReelSlotId, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  const cfg = REEL_SLOT_CONFIGS[game];
  const detailOf = (s: RsSpin): Record<string, unknown> => reelSpinDetail(game, s);
  const outcomeOf = (milli: number, detail: Record<string, unknown>): Outcome => ({ num: milli, den: 1000, multiplier: milli === 0 ? '0×' : `${milli / 1000}×`, detail });
  let free: RsSpin[] = [];
  return playRound(
    ctx,
    game,
    input,
    (draw) => {
      const round = reelSlotRound(cfg, (spin) => {
        const start = spin === 0 ? 0 : REEL_SLOT_BONUS_INDEX + spin * FREE_SPIN_STRIDE;
        let k = 0;
        return (n) => draw(n, start + k++);
      });
      free = round.free;
      return outcomeOf(Math.min(round.base.milli, cfg.capX * 1000), detailOf(round.base));
    },
    { bonus: () => (free.length > 0 ? free.map((s) => outcomeOf(s.milli, detailOf(s))) : null), bonusDetail: true },
  );
}

/** Games that sell packages of spins, and the packages the Super Admin turned on. */
export const BUY_SPINS_GAMES: readonly ReelSlotId[] = ['bigbass'];
export function buySpinsConfig(s: Settings): { enabled: boolean; discountPct: number; packs: number[] } {
  const packs = [s.buy_spins_pack1, s.buy_spins_pack2, s.buy_spins_pack3, s.buy_spins_pack4].filter((n) => n > 0);
  return { enabled: s.buy_spins_enabled && packs.length > 0, discountPct: s.buy_spins_discount_pct, packs: [...new Set(packs)].sort((a, b) => a - b) };
}
/** Each bought spin uses its own range of HMAC numbers (its free spins included). */
const BUY_SPIN_STRIDE = 200_000_000;

/**
 * Bought spins: the player pays the package once (spins x bet, minus the Super Admin's discount); every spin is then
 * played on the server at the chosen bet, each with its own free spins. The whole package never pays more than the
 * game's highest win for that bet, so the central max-win rule still holds.
 */
export async function playBuySpins(ctx: Ctx, game: ReelSlotId, input: { stake: string; idempotencyKey: string; spins: number }): Promise<RoundResult> {
  if (!BUY_SPINS_GAMES.includes(game)) throw new AppError('not_found');
  const conf = buySpinsConfig(await getSettings(ctx.db));
  if (!conf.enabled) throw new AppError('not_found');
  if (!conf.packs.includes(input.spins)) throw new AppError('validation', { fields: { spins: 'invalidAmount' } });
  const cfg = REEL_SLOT_CONFIGS[game];
  const keep = BigInt(100 - conf.discountPct);
  const count = input.spins;
  return playRound(
    ctx,
    game,
    { stake: input.stake, idempotencyKey: input.idempotencyKey },
    (draw) => {
      const spins: Record<string, unknown>[] = [];
      let total = 0;
      for (let i = 0; i < count; i += 1) {
        const round = reelSlotRound(cfg, (spin) => {
          const start = i * BUY_SPIN_STRIDE + (spin === 0 ? 0 : REEL_SLOT_BONUS_INDEX + spin * FREE_SPIN_STRIDE);
          let k = 0;
          return (n) => draw(n, start + k++);
        });
        total += round.milli;
        spins.push({ milli: round.milli, base: reelSpinDetail(game, round.base), free: round.free.map((f) => ({ milli: f.milli, ...reelSpinDetail(game, f) })) });
      }
      const cap = cfg.capX * 1000;
      const milli = Math.min(total, cap);
      return { num: milli, den: 1000, multiplier: milli === 0 ? '0×' : `${milli / 1000}×`, detail: { bought: count, discountPct: conf.discountPct, spins, capped: total > cap } };
    },
    {
      charge: (stake) => (stake * BigInt(count) * keep) / 100n,
      ledgerDetail: (d) => ({ bought: d.bought, discountPct: d.discountPct, capped: d.capped, wins: (d.spins as { milli: number }[]).map((s) => s.milli) }),
    },
  );
}

/** Desert Riches: 6x5 tumbles (up to 5), no multiplier. Every new symbol uses the next HMAC number. */
export function playDesertRiches(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  return playRound(ctx, 'desert', input, (draw) => {
    let k = 0;
    const r = desertRichesPlay(() => draw(DESERT_CONFIG.weightTotal, k++));
    return {
      num: r.tenths,
      den: 10,
      multiplier: r.tenths === 0 ? '0×' : `${r.tenths / 10}×`,
      detail: { steps: r.steps, final: r.final, capped: r.capped },
    };
  }, SLOT_FREE_SPINS);
}

/** Tumble games with their own maths: every new symbol uses the next HMAC number. */
function playTumble(ctx: Ctx, game: GameId, input: { stake: string; idempotencyKey: string }, total: number, run: (next: () => number) => { steps: unknown[]; final: number[]; tenths: number; capped: boolean }): Promise<RoundResult> {
  return playRound(ctx, game, input, (draw) => {
    let k = 0;
    const r = run(() => draw(total, k++));
    return { num: r.tenths, den: 10, multiplier: r.tenths === 0 ? '0×' : `${r.tenths / 10}×`, detail: { steps: r.steps, final: r.final, capped: r.capped } };
  }, SLOT_FREE_SPINS);
}
export const playLionsRoar = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playTumble(ctx, 'lionsroar', input, LIONS_ROAR_CONFIG.weightTotal, lionsRoarPlay);
const CHILLI_BONUS_INDEX = 800_000;

export const playChilli = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) =>
  playRound(ctx, 'chilli', input, (draw) => {
    let k = 0;
    const r = chilliPlay(() => draw(CHILLI_CONFIG.weightTotal, k++));
    const scSym = CHILLI_CONFIG.scatter?.symbol ?? 11;
    const grid0 = r.steps[0]?.grid ?? r.final;
    const scatters = grid0.filter((s) => s === scSym).length;
    return {
      num: r.tenths,
      den: 10,
      multiplier: r.tenths === 0 ? '0×' : `${r.tenths / 10}×`,
      detail: { steps: r.steps, final: r.final, capped: r.capped, scatters },
    };
  }, {
    bonus: (draw, base) => {
      const n = typeof base.detail.scatters === 'number' ? base.detail.scatters : 0;
      if (n < CHILLI_SCATTER_FREE_MIN) return null;
      const out: Outcome[] = [];
      for (let i = 0; i < CHILLI_SCATTER_FREE_COUNT; i += 1) {
        let k = CHILLI_BONUS_INDEX + i * FREE_SPIN_STRIDE;
        const r = chilliPlay(() => draw(CHILLI_CONFIG.weightTotal, k++));
        out.push({
          num: r.tenths,
          den: 10,
          multiplier: r.tenths === 0 ? '0×' : `${r.tenths / 10}×`,
          detail: { steps: r.steps, final: r.final, capped: r.capped },
        });
      }
      return out;
    },
    bonusDetail: true,
  });
export const playTidal = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playTumble(ctx, 'tidal', input, TIDAL_CONFIG.weightTotal, tidalPlay);
export const playOlympusStorm = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playTumble(ctx, 'olympusstorm', input, OLYMPUS_CONFIG.weightTotal, olympusStormPlay);
export const playDiamondBlitz = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playTumble(ctx, 'diamondblitz', input, DIAMOND_BLITZ_CONFIG.weightTotal, diamondBlitzPlay);
export const playVesuvius = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playTumble(ctx, 'vesuvius', input, VESUVIUS_CONFIG.weightTotal, vesuviusPlay);
export const playDeepCatch = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playTumble(ctx, 'deepcatch', input, DEEP_CATCH_CONFIG.weightTotal, deepCatchPlay);
/** Line slots (paylines or ways): every cell uses the next HMAC number; pays are thousandths of the total bet. */
function playLine(ctx: Ctx, game: GameId, input: { stake: string; idempotencyKey: string }, cfg: LineConfig): Promise<RoundResult> {
  return playRound(ctx, game, input, (draw) => {
    let k = 0;
    const r = linePlay(cfg, () => draw(cfg.weightTotal, k++));
    return { num: r.milli, den: 1000, multiplier: r.milli === 0 ? '0×' : `${r.milli / 1000}×`, detail: { grid: r.grid, wins: r.wins, scatter: r.scatter, capped: r.capped } };
  }, SLOT_FREE_SPINS);
}
export const playJestersDice = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'jestersdice', input, JESTERS_DICE_CONFIG);
export const playPharaohCodex = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'pharaohcodex', input, PHARAOH_CODEX_CONFIG);
export const playTreasureStack = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'treasurestack', input, TREASURE_STACK_CONFIG);
export const playIceFortune = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'icefortune', input, ICE_FORTUNE_CONFIG);
export const playSevenOrchard = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'sevenorchard', input, SEVEN_ORCHARD_CONFIG);
export const playSavannaCharge = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'savannacharge', input, SAVANNA_CHARGE_CONFIG);
export const playVaultHeist = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'vaultheist', input, VAULT_HEIST_CONFIG);
export const playLavaDragon = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'lavadragon', input, LAVA_DRAGON_CONFIG);
export const playPalaceCrown = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'palacecrown', input, PALACE_CROWN_CONFIG);
export const playLionPride = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'lionpride', input, LION_PRIDE_CONFIG);
export const playGenieLamp = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'genielamp', input, GENIE_LAMP_CONFIG);
export const playLuckyJig = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'luckyjig', input, LUCKY_JIG_CONFIG);
export const playHannibal = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'hannibal', input, HANNIBAL_CONFIG);
export const playCherryParty = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'cherryparty', input, CHERRY_PARTY_CONFIG);
export const playLuckyBell = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'luckybell', input, LUCKY_BELL_CONFIG);
export const playPowerHot = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'powerhot', input, POWER_HOT_CONFIG);
export const playGoldenCoins = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'goldencoins', input, GOLDEN_COINS_CONFIG);
export const playExtraCrown = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playLine(ctx, 'extracrown', input, EXTRA_CROWN_CONFIG);

export function playBatch21Slot(ctx: Ctx, gameId: Batch21SlotId, input: { stake: string; idempotencyKey: string }) {
  return playLine(ctx, gameId, input, batch21LineConfig(gameId));
}
/** Jewel Roulette: European wheel; draw 0 = pocket, 1 = jewel count, 2.. = jewel numbers, 10.. = jewel multipliers. */
export function playJewelRoulette(ctx: Ctx, input: { stake: string; idempotencyKey: string; bet: JewelBet; number?: number }): Promise<RoundResult> {
  if (input.bet === 'straight' && (input.number === undefined || input.number < 0 || input.number > 36)) {
    throw new AppError('validation', { fields: { number: 'invalidAmount' } });
  }
  return playRound(ctx, 'jewelroulette', input, (draw) => {
    const spin = jewelRouletteSpin(draw);
    const mult = jewelRouletteMultiplier(input.bet, input.number, spin);
    return { num: mult, den: 1, multiplier: `${mult}×`, detail: { bet: input.bet, number: input.number ?? null, pocket: spin.pocket, jewels: spin.jewels } };
  });
}
/** Hannibal Thunder Roulette: the same European wheel and lightning numbers as Jewel Roulette, in its own room. */
export function playThunderRoulette(ctx: Ctx, input: { stake: string; idempotencyKey: string; bet: JewelBet; number?: number }): Promise<RoundResult> {
  if (input.bet === 'straight' && (input.number === undefined || input.number < 0 || input.number > 36)) {
    throw new AppError('validation', { fields: { number: 'invalidAmount' } });
  }
  return playRound(ctx, 'thunderroulette', input, (draw) => {
    const spin = jewelRouletteSpin(draw);
    const mult = jewelRouletteMultiplier(input.bet, input.number, spin);
    return { num: mult, den: 1, multiplier: `${mult}×`, detail: { bet: input.bet, number: input.number ?? null, pocket: spin.pocket, jewels: spin.jewels } };
  });
}

/** Crazy Time Hannibal: money wheel, top slot and four bonus games; the stake is shared equally between the chosen spots. */
export function playCrazyTime(ctx: Ctx, input: { stake: string; idempotencyKey: string; spots: CtSpot[] }): Promise<RoundResult> {
  const spots = [...new Set(input.spots)];
  if (spots.length === 0 || spots.length !== input.spots.length) throw new AppError('validation', { fields: { spots: 'invalidChoice' } });
  return playRound(ctx, 'crazytime', input, (draw) => {
    let k = 0;
    const r = crazyTimePlay(spots, (n) => draw(n, k++));
    const x = Math.floor((r.num * 100) / r.den) / 100;
    return {
      num: r.num,
      den: r.den,
      multiplier: r.num === 0 ? '0×' : `${x}×`,
      detail: { spots, segment: r.segment, landed: r.landed, top: r.top, bonus: r.bonus, value: r.value, capped: r.capped },
    };
  });
}

/** Lucky 7: one card from a 52-card deck. */
export function playLucky7(ctx: Ctx, input: { stake: string; idempotencyKey: string; bet: Lucky7Bet }): Promise<RoundResult> {
  return playRound(ctx, 'lucky7', input, (draw) => {
    const card = draw(52, 0);
    const h = lucky7Hundredths(input.bet, card);
    const rank = cardRank(card);
    return { num: h, den: 100, multiplier: `${h / 100}×`, detail: { bet: input.bet, card, result: rank === 7 ? 'seven' : rank < 7 ? 'low' : 'high' } };
  });
}
/** Teen Patti duel: 6 cards from one deck, A and B get 3 each. */
export function playTeenPatti(ctx: Ctx, input: { stake: string; idempotencyKey: string; bet: TeenPattiBet }): Promise<RoundResult> {
  return playRound(ctx, 'teenpatti', input, (draw) => {
    const d = teenPattiDeal(draw);
    const h = teenPattiHundredths(input.bet, d.a, d.b);
    const sa = teenPattiScore(d.a);
    const sb = teenPattiScore(d.b);
    const winner = sa.score === sb.score ? 'tie' : sa.score > sb.score ? 'a' : 'b';
    return { num: h, den: 100, multiplier: `${h / 100}×`, detail: { bet: input.bet, a: d.a, b: d.b, handA: sa.hand, handB: sb.hand, winner } };
  });
}
export const playForestHowl = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playTumble(ctx, 'foresthowl', input, FOREST_HOWL_CONFIG.weightTotal, forestHowlPlay);
/** Carthage Cards: player card then dealer card from one 32-card deck (two HMAC numbers). */
export function playCarthageCards(ctx: Ctx, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  return playRound(ctx, 'carthagecards', input, (draw) => {
    const r = carthageCardsDeal(draw(32, 0), draw(31, 1));
    return { num: r.num, den: r.den, multiplier: r.outcome === 'win' ? '1.9×' : r.outcome === 'tie' ? '1×' : '0×', detail: { player: r.player, dealer: r.dealer, outcome: r.outcome } };
  });
}
export const playLuckyClover = (ctx: Ctx, input: { stake: string; idempotencyKey: string }) => playTumble(ctx, 'luckyclover', input, LUCKY_CLOVER_CONFIG.weightTotal, luckyCloverPlay);

export function playScatter(ctx: Ctx, game: GameId, input: { stake: string; idempotencyKey: string }): Promise<RoundResult> {
  const total = SCATTER_WEIGHTS.reduce((a, b) => a + b, 0);
  return playRound(ctx, game, input, (draw) => {
    const cells = Array.from({ length: SCATTER_CELLS }, (_, i) => scatterSymbolOf(draw(total, i)));
    const { wins, tenths } = scatterEvaluate(cells);
    return { num: tenths, den: 10, multiplier: tenths === 0 ? '0×' : `${tenths / 10}×`, detail: { cells, wins } };
  }, SLOT_FREE_SPINS);
}
