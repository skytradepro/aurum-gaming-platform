import { BATCH21_SLOTS } from '@aurum/shared';

export type OriginalCategory = 'slots' | 'table' | 'crash' | 'instant';

/** [id, category, art hue, featured, new] */
const ALL_ORIGINALS: readonly [string, OriginalCategory, number, boolean, boolean][] = [
  ['wheel', 'instant', 40, true, false], ['slots', 'slots', 340, true, false], ['dice', 'instant', 200, false, false],
  ['coin', 'instant', 50, false, false], ['crash', 'crash', 10, true, false], ['roulette', 'table', 140, true, false],
  ['plinko', 'instant', 280, false, false], ['keno', 'instant', 190, false, true], ['mines', 'instant', 160, true, true],
  ['dragontiger', 'table', 0, false, true], ['baccarat', 'table', 330, true, true], ['sicbo', 'table', 20, false, true],
  ['pairplus', 'table', 120, false, true], ['scratch', 'instant', 45, false, true], ['goldrush', 'slots', 48, true, true],
  ['strike', 'slots', 5, false, true], ['raptor', 'slots', 100, false, true], ['candy', 'slots', 310, true, true],
  ['thunder', 'slots', 220, false, true], ['ocean', 'slots', 200, false, true], ['aztec', 'slots', 30, true, true],
  ['hotfruits', 'slots', 355, false, true], ['ancientbook', 'slots', 38, true, true],
  ['andarbahar', 'table', 25, true, true], ['casinowar', 'table', 210, false, true],
  ['desert', 'slots', 32, true, true], ['chilli', 'slots', 8, true, true],
  ['candyburst', 'slots', 315, true, true], ['lionsroar', 'slots', 275, true, true],
  ['tidal', 'slots', 190, true, true], ['olympusstorm', 'slots', 220, true, true],
  ['diamondblitz', 'slots', 265, true, true], ['vesuvius', 'slots', 12, true, true],
  ['deepcatch', 'slots', 200, true, true], ['luckyclover', 'slots', 130, true, true],
  ['jestersdice', 'slots', 285, true, true],
  ['pharaohcodex', 'slots', 40, true, true],
  ['treasurestack', 'slots', 270, true, true],
  ['icefortune', 'slots', 195, true, true],
  ['sevenorchard', 'slots', 225, true, true],
  ['savannacharge', 'slots', 25, true, true],
  ['vaultheist', 'slots', 0, true, true],
  ['lavadragon', 'slots', 12, true, true],
  ['foresthowl', 'slots', 205, true, true],
  ['carthagecards', 'table', 145, true, true],
  ['lucky7', 'table', 140, true, true],
  ['teenpatti', 'table', 345, true, true],
  ['jewelroulette', 'table', 175, true, true],
  ['palacecrown', 'slots', 270, true, true],
  ['lionpride', 'slots', 28, true, true],
  ['genielamp', 'slots', 280, true, true],
  ['luckyjig', 'slots', 135, true, true],
  ['hannibal', 'slots', 42, true, true],
  ['cherryparty', 'slots', 8, true, true],
  ['luckybell', 'slots', 280, true, true],
  ['powerhot', 'slots', 14, true, true],
  ['goldencoins', 'slots', 48, true, true],
  ['extracrown', 'slots', 355, true, true],
  ...BATCH21_SLOTS.map((s): [string, OriginalCategory, number, boolean, boolean] => [s.id, 'slots', s.hue, true, true]),
  ['sugarhannibal', 'slots', 320, true, true],
  ['chilliheat', 'slots', 8, true, true],
  ['ultimatestriker', 'slots', 275, true, true],
  ['bigbass', 'slots', 200, true, true],
  ['crazytime', 'table', 350, true, true],
  ['thunderroulette', 'table', 220, true, true],
  ['blackjack', 'table', 160, true, true],
];

/** Cover pictures for originals that have one (files in public/media/games). */
export const ORIGINAL_COVERS: Readonly<Record<string, string>> = {
  desert: '/media/games/desert-riches-cover.jpg',
  candyburst: '/media/games/candy-burst-cover.jpg',
  chilli: '/media/games/chilli-cover.jpg',
  lionsroar: '/media/games/lions-roar-cover.jpg',
  tidal: '/media/games/tidal-cover.jpg',
  olympusstorm: '/media/games/olympus-storm-cover.jpg',
  diamondblitz: '/media/games/diamond-blitz-cover.jpg',
  vesuvius: '/media/games/vesuvius-fury-cover.jpg',
  deepcatch: '/media/games/deep-catch-cover.jpg',
  luckyclover: '/media/games/lucky-clover-cover.jpg',
  jestersdice: '/media/games/jestersdice-cover.jpg',
  pharaohcodex: '/media/games/pharaohcodex-cover.jpg',
  treasurestack: '/media/games/treasurestack-cover.jpg',
  icefortune: '/media/games/icefortune-cover.jpg',
  sevenorchard: '/media/games/sevenorchard-cover.jpg',
  savannacharge: '/media/games/savannacharge-cover.jpg',
  vaultheist: '/media/games/vaultheist-cover.jpg',
  lavadragon: '/media/games/lavadragon-cover.jpg',
  foresthowl: '/media/games/foresthowl-cover.jpg',
  carthagecards: '/media/games/carthagecards-cover.jpg',
  jewelroulette: '/media/games/jewelroulette-cover.jpg',
  palacecrown: '/media/games/palacecrown-cover.jpg',
  lionpride: '/media/games/lionpride-cover.jpg',
  genielamp: '/media/games/genielamp-cover.jpg',
  luckyjig: '/media/games/luckyjig-cover.jpg',
  hannibal: '/media/games/hannibal-cover.jpg',
  cherryparty: '/media/games/cherryparty-cover.jpg',
  luckybell: '/media/games/luckybell-cover.jpg',
  powerhot: '/media/games/powerhot-cover.jpg',
  goldencoins: '/media/games/goldencoins-cover.jpg',
  extracrown: '/media/games/extracrown-cover.jpg',
  ...Object.fromEntries(BATCH21_SLOTS.map((s) => [s.id, `/media/games/${s.id}-cover.jpg`])),
  sugarhannibal: '/media/games/sugarhannibal-cover.jpg',
  chilliheat: '/media/games/chilliheat-cover.jpg',
  ultimatestriker: '/media/games/ultimatestriker-cover.jpg',
  bigbass: '/media/games/bigbass-cover.jpg',
  crazytime: '/media/games/crazytime-cover.jpg',
  thunderroulette: '/media/games/thunderroulette-cover.jpg',
  blackjack: '/media/games/table-blackjack.jpg',
};

/** Cover pictures of the table games (live-casino lobby); kept apart so they do not lead the home showcase. */
export const TABLE_COVERS: Readonly<Record<string, string>> = {
  wheel: '/media/games/table-wheel.jpg',
  roulette: '/media/games/table-roulette.jpg',
  dragontiger: '/media/games/table-dragontiger.jpg',
  baccarat: '/media/games/table-baccarat.jpg',
  sicbo: '/media/games/table-sicbo.jpg',
  pairplus: '/media/games/table-pairplus.jpg',
  andarbahar: '/media/games/table-andarbahar.jpg',
  casinowar: '/media/games/table-casinowar.jpg',
  lucky7: '/media/games/table-lucky7.jpg',
  teenpatti: '/media/games/table-teenpatti.jpg',
};
/** Every cover picture: slots and tables. */
export const COVER_OF: Readonly<Record<string, string>> = { ...ORIGINAL_COVERS, ...TABLE_COVERS };

/** Hannibal Play games with cover art, newest first: they lead every list (home, casino lobby). */
export const SHOWCASE_IDS: readonly string[] = Object.keys(ORIGINAL_COVERS).reverse();

/** Games marked new, the last one added first (the casino page's "New games" row). */
export const NEWEST_IDS: readonly string[] = ALL_ORIGINALS.filter((o) => o[4])
  .map((o) => o[0])
  .reverse();

/** Every in-house game: the Hannibal Play games first (newest first), then the others in their usual order. */
export const ORIGINALS: readonly [string, OriginalCategory, number, boolean, boolean][] = [
  ...SHOWCASE_IDS.flatMap((id) => ALL_ORIGINALS.filter((o) => o[0] === id)),
  ...ALL_ORIGINALS.filter((o) => !SHOWCASE_IDS.includes(o[0])),
];

export function originalHue(id: string): number {
  return ALL_ORIGINALS.find((o) => o[0] === id)?.[2] ?? 45;
}
