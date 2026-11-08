/**
 * Provider games through a game aggregator, "seamless wallet" model.
 *
 * The games themselves (graphics, sounds, maths, RNG) run on the provider's servers and are shown in an
 * iframe. The money never leaves this platform: for every bet, win and rollback the aggregator calls the
 * wallet endpoints below, and each call becomes one ledger entry (bet_stake / bet_win / bet_refund).
 *
 * Every aggregator names its fields a little differently. All of that lives in ADAPTER at the top of
 * this file, so connecting a specific aggregator means editing ADAPTER to match its documentation.
 * See docs/AGGREGATOR.md.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getWallet, getWalletByUser, postEntry } from '@aurum/ledger';
import { parseAmountInput } from '@aurum/money';
import { AppError, isAppError } from '@aurum/shared';
import type { Queryable } from '@aurum/db';
import type { AggregatorConfig } from '../config.ts';
import type { Ctx, Reply } from '../http/types.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import { apilxProviderForSlug, launchApilxGame } from './apilx-launch.ts';

// --- aggregator-specific mapping ---------------------------------------------------------------------
export const ADAPTER = {
  /** Path (after AGGREGATOR_API_URL) that returns a launch URL for one game. */
  launchPath: '/games/launch',
  /** Path that returns the aggregator's game list. */
  gamesPath: '/games',
  launchBody: (a: { operatorId: string; gameId: string; token: string; currency: string; language: string; playerId: string; returnUrl: string }) => ({
    operatorId: a.operatorId,
    gameId: a.gameId,
    token: a.token,
    currency: a.currency,
    language: a.language,
    playerId: a.playerId,
    returnUrl: a.returnUrl,
    mode: 'real',
  }),
  /** Reads the launch URL out of the aggregator's reply. */
  launchUrl: (reply: unknown): string | null => {
    const r = reply as { url?: unknown; data?: { url?: unknown }; gameUrl?: unknown };
    const url = r?.url ?? r?.gameUrl ?? r?.data?.url;
    return typeof url === 'string' ? url : null;
  },
  /** Reads the game list: id, name, provider and image of each game. */
  games: (reply: unknown): { id: string; name: string; provider: string; image: string | null }[] => {
    const r = reply as { items?: unknown[]; games?: unknown[]; data?: unknown[] } | unknown[];
    const list = Array.isArray(r) ? r : (r?.items ?? r?.games ?? r?.data ?? []);
    const out: { id: string; name: string; provider: string; image: string | null }[] = [];
    for (const g of list as Record<string, unknown>[]) {
      const id = g.id ?? g.gameId ?? g.identifier;
      const name = g.name ?? g.title;
      if ((typeof id !== 'string' && typeof id !== 'number') || typeof name !== 'string') continue;
      const provider = String(g.provider ?? g.vendor ?? g.producer ?? '');
      const image = g.image ?? g.thumbnail ?? g.icon ?? null;
      out.push({ id: String(id), name, provider, image: typeof image === 'string' ? image : null });
    }
    return out;
  },
  /** Field names of the wallet callbacks. */
  fields: { token: 'token', transactionId: 'transactionId', roundId: 'roundId', amount: 'amount', refTransactionId: 'refTransactionId' },
} as const;

// --- signatures ---------------------------------------------------------------------------------------
export function sign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

function signatureOk(cfg: AggregatorConfig, raw: string, header: string | string[] | undefined): boolean {
  if (typeof header !== 'string' || !/^[0-9a-fA-F]{64}$/.test(header)) return false;
  const want = Buffer.from(sign(cfg.secret, raw), 'hex');
  const got = Buffer.from(header.toLowerCase(), 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}

function requireConfig(ctx: Ctx): AggregatorConfig {
  const cfg = ctx.config.aggregator;
  if (!cfg) throw new AppError('provider_unavailable');
  return cfg;
}

async function callAggregator(cfg: AggregatorConfig, path: string, body: unknown | null): Promise<unknown> {
  const raw = body === null ? '' : JSON.stringify(body);
  const url = `${cfg.apiUrl}${path}${body === null ? `?operatorId=${encodeURIComponent(cfg.operatorId)}` : ''}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: body === null ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', [cfg.signatureHeader]: sign(cfg.secret, body === null ? cfg.operatorId : raw) },
      ...(body === null ? {} : { body: raw }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new AppError('provider_unavailable', { message: 'aggregator unreachable', cause: error });
  }
  if (!res.ok) throw new AppError('provider_unavailable', { message: `aggregator replied ${res.status}` });
  try {
    return (await res.json()) as unknown;
  } catch (error) {
    throw new AppError('provider_unavailable', { message: 'aggregator reply is not JSON', cause: error });
  }
}

// --- amounts ------------------------------------------------------------------------------------------
async function currencyDecimals(q: Queryable, code: string): Promise<number> {
  const { rows } = await q.query<{ decimals: number }>('select decimals::int from currencies where code = $1', [code]);
  const d = rows[0]?.decimals;
  if (d === undefined) throw new AppError('internal_error', { message: `currency ${code} is missing` });
  return d;
}

function toDecimal(minor: bigint, decimals: number): string {
  if (decimals === 0) return minor.toString();
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const unit = 10n ** BigInt(decimals);
  return `${neg ? '-' : ''}${abs / unit}.${(abs % unit).toString().padStart(decimals, '0')}`;
}

function parseAmount(value: unknown, decimals: number): bigint | null {
  const text = typeof value === 'number' ? value.toFixed(decimals) : value;
  if (typeof text !== 'string') return null;
  if (/^0+(\.0+)?$/.test(text.trim())) return 0n;
  try {
    return parseAmountInput(text, decimals, { allowNegative: false });
  } catch {
    return null;
  }
}

// --- launch -------------------------------------------------------------------------------------------
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export async function launchGame(ctx: Ctx, slug: string, input: { language: string; returnUrl: string }): Promise<{ url: string }> {
  const user = ctx.principal();
  const limit = ctx.services.limiter.hit(`launch:${user.id}`, 20, 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });

  const { rows } = await ctx.db.query<{ id: string; external_id: string | null; provider_slug: string }>(
    `select g.id::text, g.external_id, p.slug as provider_slug from games g join game_providers p on p.id = g.provider_id
      where g.slug = $1 and g.is_active and p.is_active and g.art->>'source' = 'aggregator'`,
    [slug],
  );
  const game = rows[0];
  if (!game) throw new AppError('not_found');
  if (!game.external_id) throw new AppError('provider_unavailable', { message: 'game not synced with the aggregator yet' });

  const wallet = await getWalletByUser(ctx.db, user.id);
  if (!wallet) throw new AppError('wallet_not_found');

  const apilx = ctx.config.apilx;
  if (apilx && apilxProviderForSlug(apilx, game.provider_slug)) {
    return launchApilxGame(ctx, {
      accountNo: user.accountNo,
      externalGameId: game.external_id,
      language: input.language,
      lobbyUrl: input.returnUrl,
      providerSlug: game.provider_slug,
    });
  }

  const cfg = requireConfig(ctx);

  const token = randomBytes(32).toString('base64url');
  await ctx.db.query(
    `insert into provider_sessions (token_hash, user_id, wallet_id, game_id, aggregator, currency, expires_at)
     values ($1, $2::uuid, $3::bigint, $4::bigint, $5, $6, now() + make_interval(mins => $7::int))`,
    [hashToken(token), user.id, wallet.id, game.id, cfg.name, wallet.currency, cfg.sessionMinutes],
  );

  const reply = await callAggregator(
    cfg,
    ADAPTER.launchPath,
    ADAPTER.launchBody({ operatorId: cfg.operatorId, gameId: game.external_id, token, currency: wallet.currency, language: input.language, playerId: user.accountNo, returnUrl: input.returnUrl }),
  );
  const url = ADAPTER.launchUrl(reply);
  if (!url || !/^https:\/\//.test(url)) throw new AppError('provider_unavailable', { message: 'aggregator returned no https launch URL' });
  return { url };
}

// --- catalogue sync -----------------------------------------------------------------------------------
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function syncCatalogue(ctx: Ctx): Promise<{ matched: string[]; missing: string[] }> {
  const cfg = requireConfig(ctx);
  const remote = ADAPTER.games(await callAggregator(cfg, ADAPTER.gamesPath, null));
  const byName = new Map<string, (typeof remote)[number][]>();
  for (const g of remote) byName.set(norm(g.name), [...(byName.get(norm(g.name)) ?? []), g]);

  const { rows } = await ctx.db.query<{ id: string; name: string; provider: string }>(
    `select g.id::text, g.name, p.name as provider from games g join game_providers p on p.id = g.provider_id where g.art->>'source' = 'aggregator'`,
  );
  const matched: string[] = [];
  const missing: string[] = [];
  await ctx.db.transaction(async (tx) => {
    for (const row of rows) {
      const candidates = byName.get(norm(row.name)) ?? [];
      const hit = candidates.find((c) => norm(c.provider).includes(norm(row.provider).slice(0, 6))) ?? (candidates.length === 1 ? candidates[0] : undefined);
      if (!hit) {
        missing.push(row.name);
        continue;
      }
      matched.push(row.name);
      await tx.query(
        `update games set external_id = $2, is_active = true,
                art = case when $3::text is null then art else art || jsonb_build_object('image', $3::text) end
          where id = $1::bigint`,
        [row.id, hit.id, hit.image && /^https:\/\//.test(hit.image) ? hit.image : null],
      );
    }
    await audit(tx, auditActor(ctx), { action: 'aggregator.synced', targetType: 'provider', targetId: cfg.name, details: { matched: matched.length, missing } });
  });
  return { matched, missing };
}

// --- wallet callbacks ---------------------------------------------------------------------------------
interface SessionRow {
  id: string;
  wallet_id: string;
  currency: string;
  expired: boolean;
}

type WalletKind = 'balance' | 'debit' | 'credit' | 'rollback';

function walletReply(status: number, body: Record<string, unknown>): Reply {
  return { type: 'raw', status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: Buffer.from(JSON.stringify(body)) };
}

const fail = (code: string, status = 200): Reply => walletReply(status, { status: 'error', code });

async function balanceOf(q: Queryable, walletId: string, currency: string): Promise<Record<string, unknown>> {
  const wallet = await getWallet(q, walletId);
  if (!wallet) throw new AppError('wallet_not_found');
  return { status: 'ok', balance: toDecimal(wallet.balanceMinor, await currencyDecimals(q, currency)), currency };
}

export async function walletCallback(ctx: Ctx, kind: WalletKind): Promise<Reply> {
  const cfg = ctx.config.aggregator;
  if (!cfg) return fail('not_configured', 503);
  const { raw, value } = await ctx.rawJson();
  if (!signatureOk(cfg, raw, ctx.headers[cfg.signatureHeader])) return fail('invalid_signature', 401);
  const body = (value ?? {}) as Record<string, unknown>;
  const f = ADAPTER.fields;
  const token = body[f.token];
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return fail('invalid_token');

  const { rows } = await ctx.db.query<SessionRow>(
    `select id::text, wallet_id::text, currency, expires_at < now() as expired from provider_sessions where token_hash = $1 and aggregator = $2`,
    [hashToken(token), cfg.name],
  );
  const session = rows[0];
  if (!session) return fail('invalid_token');
  // Wins and rollbacks of a round that started in time are always accepted; new bets need a live session.
  if ((kind === 'balance' || kind === 'debit') && session.expired) return fail('session_expired');

  if (kind === 'balance') return walletReply(200, await balanceOf(ctx.db, session.wallet_id, session.currency));

  const txId = body[f.transactionId];
  if ((typeof txId !== 'string' && typeof txId !== 'number') || String(txId).length > 200 || String(txId) === '') return fail('invalid_transaction');
  const transactionId = String(txId);
  const roundRaw = body[f.roundId];
  const roundId = typeof roundRaw === 'string' || typeof roundRaw === 'number' ? String(roundRaw).slice(0, 200) : null;
  const decimals = await currencyDecimals(ctx.db, session.currency);
  const scope = `agg:${cfg.name}`;
  const reference = `${cfg.name}:${roundId ?? transactionId}`;

  try {
    return await ctx.db.transaction(async (tx) => {
      if (kind === 'rollback') {
        const refRaw = body[f.refTransactionId];
        const ref = typeof refRaw === 'string' || typeof refRaw === 'number' ? String(refRaw) : null;
        if (!ref) return fail('invalid_transaction');
        const inserted = await tx.query<{ id: string }>(
          `insert into provider_transactions (aggregator, tx_id, kind, session_id, round_id, ref_tx_id, amount_minor)
           values ($1, $2, 'rollback', $3::bigint, $4, $5, 0) on conflict (aggregator, tx_id) do nothing returning id::text`,
          [cfg.name, transactionId, session.id, roundId, ref],
        );
        if (inserted.rows.length === 0) return walletReply(200, await balanceOf(tx, session.wallet_id, session.currency));
        const orig = await tx.query<{ id: string; kind: string; amount_minor: string; rolled_back: boolean }>(
          `select id::text, kind, amount_minor::text, rolled_back from provider_transactions where aggregator = $1 and tx_id = $2 for update`,
          [cfg.name, ref],
        );
        const o = orig.rows[0];
        // Unknown original: remembered above, so a late debit with that id is refused.
        if (!o || o.rolled_back) return walletReply(200, await balanceOf(tx, session.wallet_id, session.currency));
        if (o.kind !== 'debit') return fail('rollback_not_supported');
        const amount = BigInt(o.amount_minor);
        if (amount > 0n) {
          await postEntry(tx, { walletId: session.wallet_id, entryType: 'bet_refund', amountMinor: amount, scope, idempotencyKey: `rollback:${ref}`, reference, reason: 'provider rollback', metadata: { aggregator: cfg.name, transactionId, ref } });
        }
        await tx.query('update provider_transactions set rolled_back = true where id = $1::bigint', [o.id]);
        return walletReply(200, await balanceOf(tx, session.wallet_id, session.currency));
      }

      const amount = parseAmount(body[f.amount], decimals);
      if (amount === null) return fail('invalid_amount');
      if (kind === 'debit') {
        const tomb = await tx.query('select 1 from provider_transactions where aggregator = $1 and kind = $2 and ref_tx_id = $3', [cfg.name, 'rollback', transactionId]);
        if (tomb.rows.length > 0) return fail('transaction_rolled_back');
      }
      const inserted = await tx.query<{ id: string }>(
        `insert into provider_transactions (aggregator, tx_id, kind, session_id, round_id, amount_minor)
         values ($1, $2, $3, $4::bigint, $5, $6::bigint) on conflict (aggregator, tx_id) do nothing returning id::text`,
        [cfg.name, transactionId, kind, session.id, roundId, amount.toString()],
      );
      if (inserted.rows.length === 0) return walletReply(200, await balanceOf(tx, session.wallet_id, session.currency));
      if (amount > 0n) {
        const entry = await postEntry(tx, {
          walletId: session.wallet_id,
          entryType: kind === 'debit' ? 'bet_stake' : 'bet_win',
          amountMinor: amount,
          scope,
          idempotencyKey: `${kind}:${transactionId}`,
          reference,
          reason: 'provider game',
          metadata: { aggregator: cfg.name, transactionId, roundId },
        });
        await tx.query('update provider_transactions set ledger_entry_id = $2 where id = $1::bigint', [inserted.rows[0]?.id, entry.id]);
      }
      return walletReply(200, await balanceOf(tx, session.wallet_id, session.currency));
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'insufficient_funds') return fail('insufficient_funds');
    throw error;
  }
}
