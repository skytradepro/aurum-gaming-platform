/**
 * Data for the public website: configuration and the demo-only widgets.
 */
import type { Queryable } from '@aurum/db';
import { TERMS_VERSION, maskUsername } from '@aurum/shared';
import type { Config } from '../config.ts';
import type { Captcha } from './captcha.ts';
import { listCurrencies } from './currencies.ts';
import type { CurrencyDTO } from './currencies.ts';
import { listCountries, listLanguages, getSettings } from './settings.ts';
import type { CountryDTO, LanguageDTO } from './settings.ts';

export interface PublicConfigDTO {
  languages: Pick<LanguageDTO, 'code' | 'nativeName' | 'englishName' | 'direction' | 'isDefault'>[];
  /** Currencies a visitor may choose (enabled). */
  currencies: CurrencyDTO[];
  /** Display rules of EVERY currency, so amounts in a currency disabled later still format correctly. */
  currencyFormats: CurrencyDTO[];
  countries: Pick<CountryDTO, 'code' | 'callingCode'>[];
  registrationOpen: boolean;
  withdrawalsOpen: boolean;
  withdrawalExpiryHours: number;
  captcha: { enabled: boolean; siteKey: string | null };
  /** true when demo data (fake winners, jackpots, games) may appear. Never true in production. */
  demo: boolean;
  inhouseGames: boolean;
  termsVersion: string;
  minAge: number;
  /** The daily gift page is open. */
  giftEnabled: boolean;
}

export async function publicConfig(q: Queryable, config: Config, captcha: Captcha): Promise<PublicConfigDTO> {
  const [languages, allCurrencies, countries, settings] = await Promise.all([
    listLanguages(q, { enabledOnly: true }),
    listCurrencies(q),
    listCountries(q, { enabledOnly: true }),
    getSettings(q),
  ]);
  return {
    languages: languages.map((l) => ({ code: l.code, nativeName: l.nativeName, englishName: l.englishName, direction: l.direction, isDefault: l.isDefault })),
    currencies: allCurrencies.filter((c) => c.isEnabled),
    currencyFormats: allCurrencies,
    countries: countries.map((c) => ({ code: c.code, callingCode: c.callingCode })),
    registrationOpen: settings.registration_open,
    withdrawalsOpen: settings.withdrawals_open,
    withdrawalExpiryHours: settings.withdrawal_expiry_hours,
    captcha: { enabled: captcha.enabled, siteKey: captcha.siteKey },
    demo: config.showDemoData,
    inhouseGames: config.inhouseGames,
    termsVersion: TERMS_VERSION,
    minAge: 18,
    giftEnabled: settings.gift_enabled,
  };
}

// ---------------------------------------------------------------------------
// Demo widgets (design placeholders). They exist only when SHOW_DEMO_DATA=true,
// which the API refuses in production, and every payload says `demo: true`.
// ---------------------------------------------------------------------------
export interface DemoWinnerDTO {
  username: string;
  game: string;
  amountMinor: string;
  currency: string;
}

/** Demo amounts are written in whole currency units and scaled to the currency's decimals. */
const DEMO_WINNERS: readonly [string, string, bigint][] = [
  ['demo_player1', 'Demo Slot One', 12_800n],
  ['demo_player2', 'Demo Crash', 8_000n],
  ['demo_player3', 'Demo Roulette', 895n],
  ['demo_player4', 'Demo Slot Two', 1_250n],
  ['demo_player5', 'Demo Blackjack', 430n],
  ['demo_player6', 'Demo Slot Three', 2_760n],
];

const scale = (whole: bigint, decimals: number): string => (whole * 10n ** BigInt(decimals)).toString();

export function demoWinners(currency: { code: string; decimals: number }): { demo: true; items: DemoWinnerDTO[] } {
  return {
    demo: true,
    items: DEMO_WINNERS.map(([username, game, whole]) => ({
      username: maskUsername(username),
      game,
      amountMinor: scale(whole, currency.decimals),
      currency: currency.code,
    })),
  };
}

export interface DemoJackpotDTO {
  level: 'ultimate' | 'vip' | 'plus' | 'basic';
  amountMinor: string;
  currency: string;
}

export function demoJackpots(currency: { code: string; decimals: number }): { demo: true; items: DemoJackpotDTO[] } {
  const levels: readonly [DemoJackpotDTO['level'], bigint][] = [
    ['ultimate', 123_456n],
    ['vip', 45_678n],
    ['plus', 9_876n],
    ['basic', 1_234n],
  ];
  return { demo: true, items: levels.map(([level, whole]) => ({ level, amountMinor: scale(whole, currency.decimals), currency: currency.code })) };
}
