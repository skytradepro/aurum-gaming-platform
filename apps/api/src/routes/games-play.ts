import { AppError, ANDAR_BAHAR_BETS, RAPTOR_MAX_JUMPS, SICBO_BETS, BACCARAT_BETS, DRAGON_TIGER_BETS, KENO_MAX_PICKS, KENO_NUMBERS, MINES_TILES, COIN_SIDES, CRASH_TARGET_MAX_X100, CRASH_TARGET_MIN_X100, DICE_DIRECTIONS, DICE_TARGET_MAX, DICE_TARGET_MIN, PLINKO_RISKS, ROULETTE_BETS, JEWEL_BETS, LUCKY7_BETS, TEEN_PATTI_BETS, CT_SPOTS, BJ_ACTIONS, v } from '@aurum/shared';
import { readQuery } from '../http/query.ts';
import { access, ok } from '../http/types.ts';
import type { Route } from '../http/types.ts';
import { getCurrency } from '../services/currencies.ts';
import { allRules } from '../services/game-rules.ts';
import { buySpinsConfig, playBuySpins, playReelSlot } from '../services/rounds.ts';
import { getSettings } from '../services/settings.ts';
import { playCandyBurst, playSugarHannibal, playCrazyTime, playThunderRoulette, playDesertRiches, playChilli, playLionsRoar, playTidal, playOlympusStorm, playDiamondBlitz, playVesuvius, playDeepCatch, playLuckyClover, playJestersDice, playPharaohCodex, playTreasureStack, playIceFortune, playSevenOrchard, playSavannaCharge, playVaultHeist, playLavaDragon, playForestHowl, playCarthageCards, playPalaceCrown, playLionPride, playGenieLamp, playLuckyJig, playHannibal, playCherryParty, playLuckyBell, playPowerHot, playGoldenCoins, playExtraCrown, playBatch21Slot, playJewelRoulette, playLucky7, playTeenPatti, playAndarBahar, playCasinoWar, playScatter, playRaptor, playStrike, playGoldRush, playPairPlus, playScratch, playSicBo, playBaccarat, playCoin, playCrash, playDragonTiger, playKeno, playMines, playDice, playPlinko, playRoulette, playSlots } from '../services/rounds.ts';
import { BATCH21_SLOT_IDS, type Batch21SlotId } from '@aurum/shared';
import { spinWheel } from '../services/wheel.ts';
import { blackjackAction, blackjackCurrent, blackjackDeal } from '../services/blackjack.ts';

const spinSchema = v.object({
  stake: v.string({ max: 40 }),
  idempotencyKey: v.string({ min: 8, max: 100, pattern: /^[A-Za-z0-9_.:-]+$/ }),
});

const base = {
  stake: v.string({ max: 40 }),
  idempotencyKey: v.string({ min: 8, max: 100, pattern: /^[A-Za-z0-9_.:-]+$/ }),
};
const coinSchema = v.object({ ...base, side: v.choice(COIN_SIDES) });
const diceSchema = v.object({ ...base, direction: v.choice(DICE_DIRECTIONS), target: v.integer({ min: DICE_TARGET_MIN, max: DICE_TARGET_MAX }) });
const slotsSchema = v.object({ ...base });
const crashSchema = v.object({ ...base, targetX100: v.integer({ min: CRASH_TARGET_MIN_X100, max: CRASH_TARGET_MAX_X100 }) });

const rouletteSchema = v.object({ ...base, bet: v.choice(ROULETTE_BETS), number: v.optional(v.integer({ min: 0, max: 37 })) });
const jewelSchema = v.object({ ...base, bet: v.choice(JEWEL_BETS), number: v.optional(v.integer({ min: 0, max: 36 })) });
const crazyTimeSchema = v.object({ ...base, spots: v.array(v.choice(CT_SPOTS), { min: 1, max: CT_SPOTS.length }) });
const lucky7Schema = v.object({ ...base, bet: v.choice(LUCKY7_BETS) });
const teenPattiSchema = v.object({ ...base, bet: v.choice(TEEN_PATTI_BETS) });
const bjDealSchema = v.object({ ...base });
const bjActionSchema = v.object({
  handId: v.string({ min: 36, max: 36, pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/ }),
  step: v.integer({ min: 0, max: 200 }),
  action: v.choice(BJ_ACTIONS),
});
const plinkoSchema = v.object({ ...base, risk: v.choice(PLINKO_RISKS) });

const kenoSchema = v.object({ ...base, picks: v.array(v.integer({ min: 0, max: KENO_NUMBERS - 1 }), { min: 1, max: KENO_MAX_PICKS }) });
const minesSchema = v.object({ ...base, mines: v.integer({ min: 1, max: 10 }), tiles: v.array(v.integer({ min: 0, max: MINES_TILES - 1 }), { min: 1, max: MINES_TILES - 1 }) });
const dragonTigerSchema = v.object({ ...base, bet: v.choice(DRAGON_TIGER_BETS) });
const baccaratSchema = v.object({ ...base, bet: v.choice(BACCARAT_BETS) });

const sicBoSchema = v.object({ ...base, bet: v.choice(SICBO_BETS), value: v.optional(v.integer({ min: 1, max: 17 })) });
const noExtraSchema = v.object({ ...base });
const buySpinsSchema = v.object({ ...base, spins: v.integer({ min: 1, max: 200 }) });
const andarBaharSchema = v.object({ ...base, bet: v.choice(ANDAR_BAHAR_BETS) });

const raptorSchema = v.object({ ...base, jumps: v.integer({ min: 1, max: RAPTOR_MAX_JUMPS }) });

const rulesQuery = v.object({ currency: v.string({ min: 2, max: 10, pattern: /^[A-Z0-9]+$/ }) });

export const gamePlayRoutes: Route[] = [
  {
    method: 'GET',
    path: '/v1/games/rules',
    access: access.player,
    async handler(ctx) {
      const q = readQuery(ctx, rulesQuery);
      const currency = await getCurrency(ctx.db, q.currency);
      if (!currency) throw new AppError('currency_unavailable');
      return ok({ games: await allRules(ctx.db, currency.decimals, ctx.principal().id) });
    },
  },
  {
    method: 'POST',
    path: '/v1/games/wheel/spin',
    access: access.player,
    async handler(ctx) {
      return ok(await spinWheel(ctx, await ctx.json(spinSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/coin/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playCoin(ctx, await ctx.json(coinSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/dice/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playDice(ctx, await ctx.json(diceSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/slots/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playSlots(ctx, await ctx.json(slotsSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/crash/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playCrash(ctx, await ctx.json(crashSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/roulette/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playRoulette(ctx, await ctx.json(rouletteSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/plinko/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playPlinko(ctx, await ctx.json(plinkoSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/keno/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playKeno(ctx, await ctx.json(kenoSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/mines/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playMines(ctx, await ctx.json(minesSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/dragontiger/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playDragonTiger(ctx, await ctx.json(dragonTigerSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/baccarat/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playBaccarat(ctx, await ctx.json(baccaratSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/sicbo/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playSicBo(ctx, await ctx.json(sicBoSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/pairplus/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playPairPlus(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/scratch/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playScratch(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/goldrush/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playGoldRush(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/strike/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playStrike(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/raptor/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playRaptor(ctx, await ctx.json(raptorSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/candy/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playScatter(ctx, 'candy', await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/thunder/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playScatter(ctx, 'thunder', await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/ocean/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playScatter(ctx, 'ocean', await ctx.json(noExtraSchema)));
    },
  },
  {
    // Hannibal Candy Burst: 6x5 pay-anywhere with tumbles and a growing multiplier (server decides every result).
    method: 'POST',
    path: '/v1/games/candyburst/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playCandyBurst(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Sugar Hannibal 1000: 7x7 cluster pays, tumbles, multiplier spots and star free spins (server decides every result).
    method: 'POST',
    path: '/v1/games/sugarhannibal/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playSugarHannibal(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Chilli Hot Wins: 5x3, 20 lines; 4 or 5 trumpets give 5 free spins (server decides every result).
    method: 'POST',
    path: '/v1/games/chilliheat/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playReelSlot(ctx, 'chilliheat', await ctx.json(noExtraSchema)));
    },
  },
  {
    // Ultimate Striker: 5x3, 10 lines; stadium free spins with a rising multiplier (server decides every result).
    method: 'POST',
    path: '/v1/games/ultimatestriker/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playReelSlot(ctx, 'ultimatestriker', await ctx.json(noExtraSchema)));
    },
  },
  {
    // Hannibal Blackjack: deal a hand (the stake leaves the wallet); a hand still open is returned instead.
    method: 'POST',
    path: '/v1/games/blackjack/deal',
    access: access.player,
    async handler(ctx) {
      return ok(await blackjackDeal(ctx, await ctx.json(bjDealSchema)));
    },
  },
  {
    // Hannibal Blackjack: one move (hit, stand, double, split) on the open hand.
    method: 'POST',
    path: '/v1/games/blackjack/action',
    access: access.player,
    async handler(ctx) {
      return ok(await blackjackAction(ctx, await ctx.json(bjActionSchema)));
    },
  },
  {
    // Hannibal Blackjack: the hand still on the table, after a reload.
    method: 'GET',
    path: '/v1/games/blackjack/current',
    access: access.player,
    async handler(ctx) {
      return ok({ hand: await blackjackCurrent(ctx) });
    },
  },
  {
    // Hannibal Big Bass "buy spins": the packages and their discount (Super Admin settings).
    method: 'GET',
    path: '/v1/games/bigbass/buy',
    access: access.public,
    async handler(ctx) {
      return ok(buySpinsConfig(await getSettings(ctx.db)));
    },
  },
  {
    // Hannibal Big Bass "buy spins": one package of spins paid once with the discount; every spin is played on the server.
    method: 'POST',
    path: '/v1/games/bigbass/buy',
    access: access.player,
    async handler(ctx) {
      const body = await ctx.json(buySpinsSchema);
      return ok(await playBuySpins(ctx, 'bigbass', body));
    },
  },
  {
    // Hannibal Big Bass: 5x3, 20 lines; free spins where the fisherman collects the cash fish (server decides every result).
    method: 'POST',
    path: '/v1/games/bigbass/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playReelSlot(ctx, 'bigbass', await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/aztec/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playScatter(ctx, 'aztec', await ctx.json(noExtraSchema)));
    },
  },
  {
    // Desert Riches: 6x5 temple board with up to 5 tumbles (server decides every result).
    method: 'POST',
    path: '/v1/games/desert/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playDesertRiches(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Hannibal Chilli: 6x5 tumbles with the Hannibal lion WILD and temple SCATTER (server decides every result).
    method: 'POST',
    path: '/v1/games/chilli/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playChilli(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Tidal Treasure: 6x5 tumbles with the treasure chest SCATTER (server decides every result).
    method: 'POST',
    path: '/v1/games/tidal/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playTidal(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Diamond Blitz: 6x5 tumbles, gem crown SCATTER, growing multiplier (server decides every result).
    method: 'POST',
    path: '/v1/games/diamondblitz/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playDiamondBlitz(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Vesuvius Fury: 6x5 tumbles, volcano WILD (server decides every result).
    method: 'POST',
    path: '/v1/games/vesuvius/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playVesuvius(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Deep Catch: 6x5 tumbles, golden hook WILD, growing multiplier (server decides every result).
    method: 'POST',
    path: '/v1/games/deepcatch/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playDeepCatch(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Lucky Clover: 6x5 tumbles, pot of gold SCATTER (server decides every result).
    method: 'POST',
    path: '/v1/games/luckyclover/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playLuckyClover(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Jester's Dice: 5x3, 10 paylines (server decides every result).
    method: 'POST',
    path: '/v1/games/jestersdice/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playJestersDice(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Pharaoh's Codex: 5x3, 10 paylines (server decides every result).
    method: 'POST',
    path: '/v1/games/pharaohcodex/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playPharaohCodex(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Treasure Stack: 5x3, 20 paylines (server decides every result).
    method: 'POST',
    path: '/v1/games/treasurestack/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playTreasureStack(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Ice Fortune: 5x3, 20 paylines (server decides every result).
    method: 'POST',
    path: '/v1/games/icefortune/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playIceFortune(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Seven Orchard: 5x4, 40 paylines (server decides every result).
    method: 'POST',
    path: '/v1/games/sevenorchard/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playSevenOrchard(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Savanna Charge: 5x4, 1024 ways (server decides every result).
    method: 'POST',
    path: '/v1/games/savannacharge/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playSavannaCharge(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Vault Heist: 5x3, 25 paylines (server decides every result).
    method: 'POST',
    path: '/v1/games/vaultheist/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playVaultHeist(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Lava Dragon: 5x3, 10 paylines (server decides every result).
    method: 'POST',
    path: '/v1/games/lavadragon/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playLavaDragon(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Forest Howl: 6x5 tumbles, wolf WILD, moon SCATTER (server decides every result).
    method: 'POST',
    path: '/v1/games/foresthowl/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playForestHowl(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/palacecrown/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playPalaceCrown(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/lionpride/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playLionPride(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/genielamp/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playGenieLamp(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/luckyjig/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playLuckyJig(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/hannibal/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playHannibal(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/cherryparty/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playCherryParty(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/luckybell/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playLuckyBell(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/powerhot/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playPowerHot(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/goldencoins/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playGoldenCoins(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/extracrown/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playExtraCrown(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Hannibal Thunder Roulette: European wheel with lightning numbers (server decides every result).
    method: 'POST',
    path: '/v1/games/thunderroulette/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playThunderRoulette(ctx, await ctx.json(jewelSchema)));
    },
  },
  {
    // Crazy Time Hannibal: money wheel, top slot and bonus games (server decides every result).
    method: 'POST',
    path: '/v1/games/crazytime/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playCrazyTime(ctx, await ctx.json(crazyTimeSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/jewelroulette/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playJewelRoulette(ctx, await ctx.json(jewelSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/lucky7/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playLucky7(ctx, await ctx.json(lucky7Schema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/teenpatti/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playTeenPatti(ctx, await ctx.json(teenPattiSchema)));
    },
  },
  {
    // Carthage Cards: higher card wins, 32-card deck (server decides every result).
    method: 'POST',
    path: '/v1/games/carthagecards/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playCarthageCards(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Olympus Storm: 6x5 tumbles, lightning WILD, growing multiplier (server decides every result).
    method: 'POST',
    path: '/v1/games/olympusstorm/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playOlympusStorm(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    // Hannibal Lion's Roar: 6x5 tumbles, up to 5 (server decides every result).
    method: 'POST',
    path: '/v1/games/lionsroar/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playLionsRoar(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/hotfruits/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playGoldRush(ctx, await ctx.json(noExtraSchema), 'hotfruits'));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/andarbahar/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playAndarBahar(ctx, await ctx.json(andarBaharSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/casinowar/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playCasinoWar(ctx, await ctx.json(noExtraSchema)));
    },
  },
  {
    method: 'POST',
    path: '/v1/games/ancientbook/play',
    access: access.player,
    async handler(ctx) {
      return ok(await playGoldRush(ctx, await ctx.json(noExtraSchema), 'ancientbook'));
    },
  },
  ...BATCH21_SLOT_IDS.map(
    (id): Route => ({
      method: 'POST',
      path: `/v1/games/${id}/play`,
      access: access.player,
      async handler(ctx) {
        return ok(await playBatch21Slot(ctx, id as Batch21SlotId, await ctx.json(noExtraSchema)));
      },
    }),
  ),
];
