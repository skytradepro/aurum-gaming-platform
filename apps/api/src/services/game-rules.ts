import type { Queryable } from '@aurum/db';
import { AppError, BATCH21_SLOT_IDS, GAME_IDS, GAME_MAX_MULTIPLIER, wheelLimits } from '@aurum/shared';
import type { GameId } from '@aurum/shared';
import type { Ctx } from '../http/types.ts';
import { auditActor } from './accounts.ts';
import { audit } from './audit.ts';
import { getSettings } from './settings.ts';
import type { Settings } from './settings.ts';

export interface GameRules {
  enabled: boolean;
  minMinor: bigint;
  maxMinor: bigint;
}

/** An admin's own limits for the players he owns. They can only be stricter than the site-wide rules. */
export interface OwnerRules {
  maxStake: number | null;
  maxWin: number | null;
  disabled: GameId[];
}

const SWITCH: Record<GameId, keyof Settings> = {
  wheel: 'game_wheel_enabled',
  coin: 'game_coin_enabled',
  dice: 'game_dice_enabled',
  slots: 'game_slots_enabled',
  crash: 'game_crash_enabled',
  roulette: 'game_roulette_enabled',
  plinko: 'game_plinko_enabled',
  keno: 'game_keno_enabled',
  mines: 'game_mines_enabled',
  dragontiger: 'game_dragontiger_enabled',
  baccarat: 'game_baccarat_enabled',
  sicbo: 'game_sicbo_enabled',
  pairplus: 'game_pairplus_enabled',
  scratch: 'game_scratch_enabled',
  goldrush: 'game_goldrush_enabled',
  strike: 'game_strike_enabled',
  raptor: 'game_raptor_enabled',
  candy: 'game_candy_enabled',
  thunder: 'game_thunder_enabled',
  ocean: 'game_ocean_enabled',
  aztec: 'game_aztec_enabled',
  hotfruits: 'game_hotfruits_enabled',
  ancientbook: 'game_ancientbook_enabled',
  andarbahar: 'game_andarbahar_enabled',
  casinowar: 'game_casinowar_enabled',
  desert: 'game_desert_enabled',
  chilli: 'game_chilli_enabled',
  candyburst: 'game_candyburst_enabled',
  lionsroar: 'game_lionsroar_enabled',
  tidal: 'game_tidal_enabled',
  olympusstorm: 'game_olympusstorm_enabled',
  diamondblitz: 'game_diamondblitz_enabled',
  vesuvius: 'game_vesuvius_enabled',
  deepcatch: 'game_deepcatch_enabled',
  luckyclover: 'game_luckyclover_enabled',
  jestersdice: 'game_jestersdice_enabled',
  pharaohcodex: 'game_pharaohcodex_enabled',
  treasurestack: 'game_treasurestack_enabled',
  icefortune: 'game_icefortune_enabled',
  sevenorchard: 'game_sevenorchard_enabled',
  savannacharge: 'game_savannacharge_enabled',
  vaultheist: 'game_vaultheist_enabled',
  lavadragon: 'game_lavadragon_enabled',
  foresthowl: 'game_foresthowl_enabled',
  carthagecards: 'game_carthagecards_enabled',
  palacecrown: 'game_palacecrown_enabled',
  lionpride: 'game_lionpride_enabled',
  genielamp: 'game_genielamp_enabled',
  luckyjig: 'game_luckyjig_enabled',
  hannibal: 'game_hannibal_enabled',
  cherryparty: 'game_cherryparty_enabled',
  luckybell: 'game_luckybell_enabled',
  powerhot: 'game_powerhot_enabled',
  goldencoins: 'game_goldencoins_enabled',
  extracrown: 'game_extracrown_enabled',
  jewelroulette: 'game_jewelroulette_enabled',
  lucky7: 'game_lucky7_enabled',
  teenpatti: 'game_teenpatti_enabled',
  sugarhannibal: 'game_sugarhannibal_enabled',
  crazytime: 'game_crazytime_enabled',
  thunderroulette: 'game_thunderroulette_enabled',
  chilliheat: 'game_chilliheat_enabled',
  ultimatestriker: 'game_ultimatestriker_enabled',
  bigbass: 'game_bigbass_enabled',
  blackjack: 'game_blackjack_enabled',
  ...Object.fromEntries(BATCH21_SLOT_IDS.map((id) => [id, `game_${id}_enabled`])),
} as Record<GameId, keyof Settings>;

export function parseOwnerRules(raw: unknown): OwnerRules {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const num = (x: unknown): number | null => (typeof x === 'number' && Number.isInteger(x) && x > 0 ? x : null);
  const disabled = Array.isArray(o.disabled) ? GAME_IDS.filter((g) => (o.disabled as unknown[]).includes(g)) : [];
  return { maxStake: num(o.maxStake), maxWin: num(o.maxWin), disabled };
}

/**
 * The rules every in-house game goes through: the game's switch, the smallest stake, and the largest stake,
 * which is the lower of the maximum stake and (maximum win / the game's highest multiplier).
 * The site-wide rules come first; the admin who owns the player may only tighten them.
 * Whole units of the player's currency; `decimals` turns them into minor units.
 */
export function rulesFor(settings: Settings, game: GameId, decimals: number, owner: OwnerRules = { maxStake: null, maxWin: null, disabled: [] }): GameRules {
  const unit = 10n ** BigInt(decimals);
  const { min } = wheelLimits(decimals);
  const stakeUnits = Math.min(settings.game_max_stake, owner.maxStake ?? Number.MAX_SAFE_INTEGER);
  const winUnits = Math.min(settings.game_max_win, owner.maxWin ?? Number.MAX_SAFE_INTEGER);
  const byStake = BigInt(stakeUnits) * unit;
  const cap = GAME_MAX_MULTIPLIER[game] ?? 100;
  const byWin = (BigInt(winUnits) * unit) / BigInt(cap);
  let max = byStake < byWin ? byStake : byWin;
  if (max < min) max = min;
  const toggle = SWITCH[game] ?? (`game_${game}_enabled` as keyof Settings);
  return { enabled: settings[toggle] === true && !owner.disabled.includes(game), minMinor: min, maxMinor: max };
}

/** The rules of the admin who owns this player (none for a normal website sign-up). */
export async function ownerRulesOf(db: Queryable, userId: string): Promise<OwnerRules> {
  const { rows } = await db.query<{ game_rules: unknown }>(
    'select o.game_rules from users u join users o on o.id = u.owner_id where u.id = $1::uuid',
    [userId],
  );
  return parseOwnerRules(rows[0]?.game_rules);
}

/** Rules for one game and player, or throws when the game is switched off for him. */
export async function requireRules(db: Queryable, game: GameId, decimals: number, userId: string): Promise<GameRules> {
  const rules = rulesFor(await getSettings(db), game, decimals, await ownerRulesOf(db, userId));
  if (!rules.enabled) throw new AppError('game_unavailable');
  return rules;
}

export async function allRules(db: Queryable, decimals: number, userId: string): Promise<Record<GameId, { enabled: boolean; min: string; max: string }>> {
  const settings = await getSettings(db);
  const owner = await ownerRulesOf(db, userId);
  const out = {} as Record<GameId, { enabled: boolean; min: string; max: string }>;
  for (const g of GAME_IDS) {
    const r = rulesFor(settings, g, decimals, owner);
    out[g] = { enabled: r.enabled, min: r.minMinor.toString(), max: r.maxMinor.toString() };
  }
  return out;
}

// --- an admin's own rules -----------------------------------------------------
export async function getMyRules(ctx: Ctx): Promise<{ rules: OwnerRules; site: { maxStake: number; maxWin: number } }> {
  const { rows } = await ctx.db.query<{ game_rules: unknown }>('select game_rules from users where id = $1::uuid', [ctx.principal().id]);
  const s = await getSettings(ctx.db);
  return { rules: parseOwnerRules(rows[0]?.game_rules), site: { maxStake: s.game_max_stake, maxWin: s.game_max_win } };
}

export async function setMyRules(ctx: Ctx, input: { maxStake: number | null; maxWin: number | null; disabled: GameId[] }): Promise<void> {
  const s = await getSettings(ctx.db);
  if (input.maxStake !== null && (input.maxStake < 1 || input.maxStake > s.game_max_stake)) throw new AppError('validation', { fields: { maxStake: 'outOfRange' } });
  if (input.maxWin !== null && (input.maxWin < 10 || input.maxWin > s.game_max_win)) throw new AppError('validation', { fields: { maxWin: 'outOfRange' } });
  const next = { maxStake: input.maxStake, maxWin: input.maxWin, disabled: GAME_IDS.filter((g) => input.disabled.includes(g)) };
  await ctx.db.transaction(async (tx) => {
    await tx.query('update users set game_rules = $2::jsonb where id = $1::uuid', [ctx.principal().id, JSON.stringify(next)]);
    await audit(tx, auditActor(ctx), { action: 'game_rules.changed', targetType: 'user', targetId: ctx.principal().id, details: next });
  });
}
