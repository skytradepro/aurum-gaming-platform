/**
 * Super Admin settings: site switches, languages, countries and exchange rates.
 */
import type { Queryable } from '@aurum/db';
import { parseRate } from '@aurum/money';
import { AppError } from '@aurum/shared';
import { LOCALES } from '@aurum/i18n';
import type { Ctx } from '../http/types.ts';
import { money } from '../errors.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';

// --- site settings ---------------------------------------------------------
/** Switches and numbers the Super Admin can change. Each has a type, limits and a default. */
export const SETTING_DEFINITIONS = {
  registration_open: { type: 'boolean', default: true },
  withdrawals_open: { type: 'boolean', default: true },
  /** Welcome gift credited once to every new player, in hundredths of the account currency (50 = 0.50). 0 = off. */
  welcome_gift_cents: { type: 'integer', default: 50, min: 0, max: 1000 },
  /** Slot games: 1 paid spin in this many also wins 5 free spins. 0 = off. */
  free_spins_one_in: { type: 'integer', default: 400, min: 0, max: 100000 },
  /** When on, the admin panel only opens after visiting the secret admin link (ADMIN_SECRET_PATH). */
  admin_secret_link_enabled: { type: 'boolean', default: false },
  /** How long a withdrawal pickup code stays valid before the money returns to the wallet. */
  withdrawal_expiry_hours: { type: 'integer', default: 168, min: 1, max: 720 },
  /** Central game rules: they apply to every in-house game. Whole units of the player's currency. */
  game_max_stake: { type: 'integer', default: 20, min: 1, max: 1000 },
  game_max_win: { type: 'integer', default: 5000, min: 10, max: 1_000_000 },
  game_wheel_enabled: { type: 'boolean', default: true },
  game_coin_enabled: { type: 'boolean', default: true },
  game_dice_enabled: { type: 'boolean', default: true },
  game_slots_enabled: { type: 'boolean', default: true },
  game_crash_enabled: { type: 'boolean', default: true },
  game_roulette_enabled: { type: 'boolean', default: true },
  game_plinko_enabled: { type: 'boolean', default: true },
  game_keno_enabled: { type: 'boolean', default: true },
  game_mines_enabled: { type: 'boolean', default: true },
  game_dragontiger_enabled: { type: 'boolean', default: true },
  game_baccarat_enabled: { type: 'boolean', default: true },
  game_sicbo_enabled: { type: 'boolean', default: true },
  game_pairplus_enabled: { type: 'boolean', default: true },
  game_scratch_enabled: { type: 'boolean', default: true },
  game_goldrush_enabled: { type: 'boolean', default: true },
  game_strike_enabled: { type: 'boolean', default: true },
  game_raptor_enabled: { type: 'boolean', default: true },
  game_candy_enabled: { type: 'boolean', default: true },
  game_thunder_enabled: { type: 'boolean', default: true },
  game_ocean_enabled: { type: 'boolean', default: true },
  game_aztec_enabled: { type: 'boolean', default: true },
  game_hotfruits_enabled: { type: 'boolean', default: true },
  game_ancientbook_enabled: { type: 'boolean', default: true },
  game_andarbahar_enabled: { type: 'boolean', default: true },
  game_casinowar_enabled: { type: 'boolean', default: true },
  game_desert_enabled: { type: 'boolean', default: true },
  game_chilli_enabled: { type: 'boolean', default: true },
  game_candyburst_enabled: { type: 'boolean', default: true },
  game_lionsroar_enabled: { type: 'boolean', default: true },
  game_tidal_enabled: { type: 'boolean', default: true },
  game_olympusstorm_enabled: { type: 'boolean', default: true },
  game_diamondblitz_enabled: { type: 'boolean', default: true },
  game_vesuvius_enabled: { type: 'boolean', default: true },
  game_deepcatch_enabled: { type: 'boolean', default: true },
  game_luckyclover_enabled: { type: 'boolean', default: true },
  game_jestersdice_enabled: { type: 'boolean', default: true },
  game_pharaohcodex_enabled: { type: 'boolean', default: true },
  game_treasurestack_enabled: { type: 'boolean', default: true },
  game_icefortune_enabled: { type: 'boolean', default: true },
  game_sevenorchard_enabled: { type: 'boolean', default: true },
  game_savannacharge_enabled: { type: 'boolean', default: true },
  game_vaultheist_enabled: { type: 'boolean', default: true },
  game_lavadragon_enabled: { type: 'boolean', default: true },
  game_foresthowl_enabled: { type: 'boolean', default: true },
  game_carthagecards_enabled: { type: 'boolean', default: true },
  game_palacecrown_enabled: { type: 'boolean', default: true },
  game_lionpride_enabled: { type: 'boolean', default: true },
  game_genielamp_enabled: { type: 'boolean', default: true },
  game_luckyjig_enabled: { type: 'boolean', default: true },
  game_hannibal_enabled: { type: 'boolean', default: true },
  game_cherryparty_enabled: { type: 'boolean', default: true },
  game_luckybell_enabled: { type: 'boolean', default: true },
  game_powerhot_enabled: { type: 'boolean', default: true },
  game_goldencoins_enabled: { type: 'boolean', default: true },
  game_extracrown_enabled: { type: 'boolean', default: true },
  game_jewelroulette_enabled: { type: 'boolean', default: true },
  game_lucky7_enabled: { type: 'boolean', default: true },
  game_teenpatti_enabled: { type: 'boolean', default: true },
  game_sugarhannibal_enabled: { type: 'boolean', default: true },
  game_crazytime_enabled: { type: 'boolean', default: true },
  game_thunderroulette_enabled: { type: 'boolean', default: true },
  game_chilliheat_enabled: { type: 'boolean', default: true },
  game_ultimatestriker_enabled: { type: 'boolean', default: true },
  game_bigbass_enabled: { type: 'boolean', default: true },
  game_blackjack_enabled: { type: 'boolean', default: true },
  game_glossy10_enabled: { type: 'boolean', default: true },
  game_jester10_enabled: { type: 'boolean', default: true },
  game_wild2_enabled: { type: 'boolean', default: true },
  game_fruitata30_enabled: { type: 'boolean', default: true },
  game_ways2_enabled: { type: 'boolean', default: true },
  game_kings2_enabled: { type: 'boolean', default: true },
  game_mafia_enabled: { type: 'boolean', default: true },
  game_hunter3021_enabled: { type: 'boolean', default: true },
  game_amigomonkeys_enabled: { type: 'boolean', default: true },
  game_wolves10k_enabled: { type: 'boolean', default: true },
  game_rush10kx_enabled: { type: 'boolean', default: true },
  game_nights10001_enabled: { type: 'boolean', default: true },
  game_superhot100_enabled: { type: 'boolean', default: true },
  game_supericy100_enabled: { type: 'boolean', default: true },
  game_wonders10k_enabled: { type: 'boolean', default: true },
  game_olympus1000_enabled: { type: 'boolean', default: true },
  game_winning10kn_enabled: { type: 'boolean', default: true },
  game_moongirls1000_enabled: { type: 'boolean', default: true },
  game_rush1000x_enabled: { type: 'boolean', default: true },
  game_artofgold100_enabled: { type: 'boolean', default: true },
  game_reelfish100_enabled: { type: 'boolean', default: true },
  game_winning1kn_enabled: { type: 'boolean', default: true },
  game_burningbrilliants_enabled: { type: 'boolean', default: true },
  game_dragonpearls15_enabled: { type: 'boolean', default: true },
  game_spins1001_enabled: { type: 'boolean', default: true },
  game_geniefortune1001_enabled: { type: 'boolean', default: true },
  game_burninghotbb_enabled: { type: 'boolean', default: true },
  game_artofgolddice_enabled: { type: 'boolean', default: true },
  game_goldencoinsdice_enabled: { type: 'boolean', default: true },
  /** Sports betting on real football matches. Whole units of the player's currency. */
  sports_enabled: { type: 'boolean', default: true },
  sports_max_stake: { type: 'integer', default: 20, min: 1, max: 1000 },
  sports_max_win: { type: 'integer', default: 5000, min: 10, max: 1_000_000 },
  sports_max_selections: { type: 'integer', default: 10, min: 1, max: 20 },
  /** Live (in-play) football betting. */
  /** Daily gift on the gift page (off until the Super Admin turns it on). Amounts in hundredths of the currency. */
  gift_enabled: { type: 'boolean', default: false },
  gift_min_cents: { type: 'integer', default: 10, min: 1, max: 100000 },
  gift_max_cents: { type: 'integer', default: 100, min: 1, max: 100000 },
  /** At most this many gifts are opened per day on the whole site (0 = no gifts). */
  gift_daily_limit: { type: 'integer', default: 200, min: 0, max: 100000 },
  /** Only players who already made a real deposit can open the gift (stops gifts to throw-away accounts). */
  gift_need_deposit: { type: 'boolean', default: true },
  /** Hannibal Big Bass "buy spins": packages of spins paid once, with this discount (percent off the normal price). */
  buy_spins_enabled: { type: 'boolean', default: true },
  buy_spins_discount_pct: { type: 'integer', default: 30, min: 0, max: 90 },
  /** Spins in each package (0 = package hidden). */
  buy_spins_pack1: { type: 'integer', default: 20, min: 0, max: 200 },
  buy_spins_pack2: { type: 'integer', default: 40, min: 0, max: 200 },
  buy_spins_pack3: { type: 'integer', default: 60, min: 0, max: 200 },
  buy_spins_pack4: { type: 'integer', default: 100, min: 0, max: 200 },
  sports_live_enabled: { type: 'boolean', default: true },
  /** Highest stake of a bet with a live selection (whole units; the normal sports maximum still applies). */
  sports_live_max_stake: { type: 'integer', default: 20, min: 1, max: 1000 },
  /** A live bet is accepted only after this many seconds, when the score and the price have not changed. */
  sports_live_delay_seconds: { type: 'integer', default: 8, min: 3, max: 30 },
} as const;

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as (keyof typeof SETTING_DEFINITIONS)[];
export type SettingKey = keyof typeof SETTING_DEFINITIONS;

export interface Settings {
  registration_open: boolean;
  withdrawals_open: boolean;
  welcome_gift_cents: number;
  free_spins_one_in: number;
  admin_secret_link_enabled: boolean;
  withdrawal_expiry_hours: number;
  game_max_stake: number;
  game_max_win: number;
  game_wheel_enabled: boolean;
  game_coin_enabled: boolean;
  game_dice_enabled: boolean;
  game_slots_enabled: boolean;
  game_crash_enabled: boolean;
  game_roulette_enabled: boolean;
  game_plinko_enabled: boolean;
  game_keno_enabled: boolean;
  game_mines_enabled: boolean;
  game_dragontiger_enabled: boolean;
  game_baccarat_enabled: boolean;
  game_sicbo_enabled: boolean;
  game_pairplus_enabled: boolean;
  game_scratch_enabled: boolean;
  game_goldrush_enabled: boolean;
  game_strike_enabled: boolean;
  game_raptor_enabled: boolean;
  game_candy_enabled: boolean;
  game_thunder_enabled: boolean;
  game_ocean_enabled: boolean;
  game_aztec_enabled: boolean;
  game_hotfruits_enabled: boolean;
  game_ancientbook_enabled: boolean;
  game_andarbahar_enabled: boolean;
  game_casinowar_enabled: boolean;
  game_desert_enabled: boolean;
  game_chilli_enabled: boolean;
  game_candyburst_enabled: boolean;
  game_lionsroar_enabled: boolean;
  game_tidal_enabled: boolean;
  game_olympusstorm_enabled: boolean;
  game_diamondblitz_enabled: boolean;
  game_vesuvius_enabled: boolean;
  game_deepcatch_enabled: boolean;
  game_luckyclover_enabled: boolean;
  game_jestersdice_enabled: boolean;
  game_pharaohcodex_enabled: boolean;
  game_treasurestack_enabled: boolean;
  game_icefortune_enabled: boolean;
  game_sevenorchard_enabled: boolean;
  game_savannacharge_enabled: boolean;
  game_vaultheist_enabled: boolean;
  game_lavadragon_enabled: boolean;
  game_foresthowl_enabled: boolean;
  game_carthagecards_enabled: boolean;
  game_palacecrown_enabled: boolean;
  game_lionpride_enabled: boolean;
  game_genielamp_enabled: boolean;
  game_luckyjig_enabled: boolean;
  game_hannibal_enabled: boolean;
  game_cherryparty_enabled: boolean;
  game_luckybell_enabled: boolean;
  game_powerhot_enabled: boolean;
  game_goldencoins_enabled: boolean;
  game_extracrown_enabled: boolean;
  game_jewelroulette_enabled: boolean;
  game_lucky7_enabled: boolean;
  game_teenpatti_enabled: boolean;
  game_sugarhannibal_enabled: boolean;
  game_crazytime_enabled: boolean;
  game_thunderroulette_enabled: boolean;
  game_chilliheat_enabled: boolean;
  game_ultimatestriker_enabled: boolean;
  game_bigbass_enabled: boolean;
  game_blackjack_enabled: boolean;
  game_glossy10_enabled: boolean;
  game_jester10_enabled: boolean;
  game_wild2_enabled: boolean;
  game_fruitata30_enabled: boolean;
  game_ways2_enabled: boolean;
  game_kings2_enabled: boolean;
  game_mafia_enabled: boolean;
  game_hunter3021_enabled: boolean;
  game_amigomonkeys_enabled: boolean;
  game_wolves10k_enabled: boolean;
  game_rush10kx_enabled: boolean;
  game_nights10001_enabled: boolean;
  game_superhot100_enabled: boolean;
  game_supericy100_enabled: boolean;
  game_wonders10k_enabled: boolean;
  game_olympus1000_enabled: boolean;
  game_winning10kn_enabled: boolean;
  game_moongirls1000_enabled: boolean;
  game_rush1000x_enabled: boolean;
  game_artofgold100_enabled: boolean;
  game_reelfish100_enabled: boolean;
  game_winning1kn_enabled: boolean;
  game_burningbrilliants_enabled: boolean;
  game_dragonpearls15_enabled: boolean;
  game_spins1001_enabled: boolean;
  game_geniefortune1001_enabled: boolean;
  game_burninghotbb_enabled: boolean;
  game_artofgolddice_enabled: boolean;
  game_goldencoinsdice_enabled: boolean;
  sports_enabled: boolean;
  sports_max_stake: number;
  sports_max_win: number;
  sports_max_selections: number;
  gift_enabled: boolean;
  gift_min_cents: number;
  gift_max_cents: number;
  gift_daily_limit: number;
  gift_need_deposit: boolean;
  buy_spins_enabled: boolean;
  buy_spins_discount_pct: number;
  buy_spins_pack1: number;
  buy_spins_pack2: number;
  buy_spins_pack3: number;
  buy_spins_pack4: number;
  sports_live_enabled: boolean;
  sports_live_max_stake: number;
  sports_live_delay_seconds: number;
}

export function isSettingKey(value: string): value is SettingKey {
  return Object.hasOwn(SETTING_DEFINITIONS, value);
}

function coerceSetting(key: SettingKey, value: unknown): boolean | number {
  const def = SETTING_DEFINITIONS[key];
  if (def.type === 'boolean') return typeof value === 'boolean' ? value : def.default;
  return typeof value === 'number' && Number.isInteger(value) && value >= def.min && value <= def.max ? value : def.default;
}

export async function getSettings(q: Queryable): Promise<Settings> {
  const { rows } = await q.query<{ key: string; value: unknown }>('select key, value from site_settings');
  const out: Record<string, boolean | number> = {};
  for (const key of SETTING_KEYS) out[key] = coerceSetting(key, rows.find((r) => r.key === key)?.value);
  return out as unknown as Settings;
}

/** Throws a validation error when the value does not fit the setting's type and limits. */
export function validateSetting(key: SettingKey, value: unknown): boolean | number {
  const def = SETTING_DEFINITIONS[key];
  if (def.type === 'boolean') {
    if (typeof value !== 'boolean') throw new AppError('validation', { fields: { value: 'invalidFormat' } });
    return value;
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new AppError('validation', { fields: { value: 'invalidNumber' } });
  if (value < def.min || value > def.max) throw new AppError('validation', { fields: { value: 'outOfRange' } });
  return value;
}

export async function setSetting(ctx: Ctx, key: SettingKey, value: unknown): Promise<void> {
  const checked = validateSetting(key, value);
  await ctx.db.transaction(async (tx) => {
    const before = await getSettings(tx);
    await tx.query(
      `insert into site_settings (key, value, updated_by) values ($1, $2::jsonb, $3::uuid)
       on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
      [key, JSON.stringify(checked), ctx.principal().id],
    );
    await audit(tx, auditActor(ctx), { action: 'settings.changed', targetType: 'setting', targetId: key, details: { from: before[key], to: checked } });
  });
}

// --- languages -------------------------------------------------------------
export interface LanguageDTO {
  code: string;
  nativeName: string;
  englishName: string;
  direction: 'ltr' | 'rtl';
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  /** true when the interface has a message catalogue for this language (it can be enabled). */
  hasCatalog: boolean;
}

interface LanguageRow {
  code: string;
  native_name: string;
  english_name: string;
  direction: 'ltr' | 'rtl';
  is_enabled: boolean;
  is_default: boolean;
  sort_order: number;
}

const toLanguage = (r: LanguageRow): LanguageDTO => ({
  code: r.code,
  nativeName: r.native_name,
  englishName: r.english_name,
  direction: r.direction,
  isEnabled: r.is_enabled,
  isDefault: r.is_default,
  sortOrder: r.sort_order,
  hasCatalog: (LOCALES as readonly string[]).includes(r.code),
});

export async function listLanguages(q: Queryable, options: { enabledOnly?: boolean } = {}): Promise<LanguageDTO[]> {
  const { rows } = await q.query<LanguageRow>(
    `select code, native_name, english_name, direction, is_enabled, is_default, sort_order from languages
      ${options.enabledOnly ? 'where is_enabled' : ''} order by sort_order, code`,
  );
  return rows.map(toLanguage);
}

export async function updateLanguage(ctx: Ctx, code: string, patch: { isEnabled?: boolean | undefined; isDefault?: boolean | undefined; sortOrder?: number | undefined }): Promise<LanguageDTO> {
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<LanguageRow>('select code, native_name, english_name, direction, is_enabled, is_default, sort_order from languages where code = $1 for update', [code]);
    const before = rows[0];
    if (!before) throw new AppError('not_found');
    const isEnabled = patch.isEnabled ?? before.is_enabled;
    const isDefault = patch.isDefault ?? before.is_default;
    if ((isEnabled || isDefault) && !(LOCALES as readonly string[]).includes(code)) {
      throw new AppError('validation', { fields: { isEnabled: 'noCatalog' } });
    }
    if (isDefault && !isEnabled) throw new AppError('validation', { fields: { isEnabled: 'defaultMustBeEnabled' } });
    if (before.is_default && !isDefault) throw new AppError('validation', { fields: { isDefault: 'defaultRequired' } });
    if (isDefault && !before.is_default) await tx.query('update languages set is_default = false where is_default');
    const updated = await tx.query<LanguageRow>(
      `update languages set is_enabled = $2, is_default = $3, sort_order = $4 where code = $1
       returning code, native_name, english_name, direction, is_enabled, is_default, sort_order`,
      [code, isEnabled, isDefault, patch.sortOrder ?? before.sort_order],
    );
    await audit(tx, auditActor(ctx), { action: 'language.updated', targetType: 'language', targetId: code, details: { isEnabled, isDefault } });
    return toLanguage(updated.rows[0] as LanguageRow);
  });
}

// --- countries -------------------------------------------------------------
export interface CountryDTO {
  code: string;
  callingCode: string;
  isEnabled: boolean;
  sortOrder: number;
}

export async function listCountries(q: Queryable, options: { enabledOnly?: boolean } = {}): Promise<CountryDTO[]> {
  const { rows } = await q.query<{ code: string; calling_code: string; is_enabled: boolean; sort_order: number }>(
    `select code, calling_code, is_enabled, sort_order from countries ${options.enabledOnly ? 'where is_enabled' : ''} order by sort_order, code`,
  );
  return rows.map((r) => ({ code: r.code, callingCode: r.calling_code, isEnabled: r.is_enabled, sortOrder: r.sort_order }));
}

export async function setCountryEnabled(ctx: Ctx, code: string, isEnabled: boolean): Promise<CountryDTO> {
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ code: string; calling_code: string; is_enabled: boolean; sort_order: number }>(
      'update countries set is_enabled = $2 where code = $1 returning code, calling_code, is_enabled, sort_order',
      [code, isEnabled],
    );
    const row = rows[0];
    if (!row) throw new AppError('not_found');
    await audit(tx, auditActor(ctx), { action: 'country.updated', targetType: 'country', targetId: code, details: { isEnabled } });
    return { code: row.code, callingCode: row.calling_code, isEnabled: row.is_enabled, sortOrder: row.sort_order };
  });
}

// --- exchange rates (append-only, entered by hand) -------------------------
export interface RateDTO {
  id: string;
  base: string;
  quote: string;
  rate: string;
  source: string;
  note: string | null;
  effectiveAt: string;
  createdBy: string | null;
  createdAt: string;
}

export async function listRates(q: Queryable, options: { base?: string; quote?: string; limit?: number } = {}): Promise<RateDTO[]> {
  const { rows } = await q.query<{
    id: string; base_currency: string; quote_currency: string; rate: string; source: string; note: string | null;
    effective_at: Date; created_by: string | null; created_at: Date;
  }>(
    `select id::text, base_currency, quote_currency, rate::text, source, note, effective_at, created_by::text, created_at
       from exchange_rates
      where ($1::text is null or base_currency = $1) and ($2::text is null or quote_currency = $2)
      order by effective_at desc, id desc limit $3`,
    [options.base ?? null, options.quote ?? null, Math.min(options.limit ?? 100, 500)],
  );
  return rows.map((r) => ({
    id: r.id,
    base: r.base_currency,
    quote: r.quote_currency,
    rate: r.rate.includes('.') ? r.rate.replace(/0+$/, '').replace(/\.$/, '') : r.rate,
    source: r.source,
    note: r.note,
    effectiveAt: r.effective_at.toISOString(),
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
  }));
}

export interface NewRateInput {
  base: string;
  quote: string;
  rate: string;
  source: string;
  note?: string | undefined;
  effectiveAt?: string | undefined;
}

/**
 * Records an exchange rate entered by the Super Admin. Rates are never edited or deleted
 * (the table is append-only): a correction is a newer rate. Nothing here fetches rates from
 * the internet, so no rate is ever invented.
 */
export async function addRate(ctx: Ctx, input: NewRateInput): Promise<RateDTO> {
  if (input.base === input.quote) throw new AppError('validation', { fields: { quote: 'invalidChoice' } });
  money(() => parseRate(input.rate));
  return ctx.db.transaction(async (tx) => {
    const known = await tx.query<{ code: string }>('select code from currencies where code = any($1::text[])', [[input.base, input.quote]]);
    if (known.rowCount !== 2) throw new AppError('currency_unavailable', { fields: { base: 'invalidChoice' } });
    const { rows } = await tx.query<{ id: string }>(
      `insert into exchange_rates (base_currency, quote_currency, rate, source, note, effective_at, created_by)
       values ($1, $2, $3::numeric, $4, $5, coalesce($6::timestamptz, now()), $7::uuid) returning id::text`,
      [input.base, input.quote, input.rate, input.source, input.note ?? null, input.effectiveAt ?? null, ctx.principal().id],
    );
    const id = (rows[0] as { id: string }).id;
    await audit(tx, auditActor(ctx), { action: 'rate.added', targetType: 'exchange_rate', targetId: id, details: { base: input.base, quote: input.quote, rate: input.rate, source: input.source } });
    const list = await listRates(tx, { base: input.base, quote: input.quote, limit: 500 });
    return list.find((r) => r.id === id) as RateDTO;
  });
}
