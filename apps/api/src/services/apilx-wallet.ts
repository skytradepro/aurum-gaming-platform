/**
 * API LX Seamless Wallet callbacks (GetBalance, Withdraw, Deposit, BetWin, RollbackTransaction).
 * Uses the same wallets + ledger as the rest of Hannibal; does not replace /v1/aggregator/wallet/*.
 */
import { createHash, randomBytes } from 'node:crypto';
import { getWallet, postEntry } from '@aurum/ledger';
import { parseAmountInput } from '@aurum/money';
import { AppError, isAppError } from '@aurum/shared';
import type { Queryable } from '@aurum/db';
import type { ApilxConfig } from '../config.ts';
import type { Ctx, Reply } from '../http/types.ts';
import { APILX_SIGN, apilxSignAny } from './apilx-sign.ts';

const SCOPE = 'agg:apilx';
const AGGREGATOR = 'apilx';

type Op = 'GetBalance' | 'Withdraw' | 'Deposit' | 'BetWin' | 'RollbackTransaction';

const CODES = {
  ok: 0,
  general: 1,
  badParams: 2,
  badSign: 3,
  badAgent: 4,
  noUser: 5,
  noFunds: 6,
  dup: 11,
} as const;

function reply(status: number, body: Record<string, unknown>): Reply {
  return {
    type: 'raw',
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: Buffer.from(JSON.stringify(body)),
  };
}

function err(code: number, message: string): Reply {
  return reply(200, { code, message });
}

async function currencyDecimals(q: Queryable, code: string): Promise<number> {
  const { rows } = await q.query<{ decimals: number }>('select decimals::int from currencies where code = $1', [code]);
  const d = rows[0]?.decimals;
  if (d === undefined) throw new AppError('internal_error', { message: `currency ${code} is missing` });
  return d;
}

function balanceNumber(minor: bigint, decimals: number): number {
  if (decimals === 0) return Number(minor);
  const unit = 10n ** BigInt(decimals);
  const whole = minor / unit;
  const frac = minor % unit;
  const frac2 = Number(frac) / Number(unit);
  return Math.round((Number(whole) + frac2) * 100) / 100;
}

function parseWireAmount(value: unknown, decimals: number): bigint | null {
  const text = apilxAmountText(value);
  if (text === null) return null;
  if (/^0+(\.0+)?$/.test(text)) return 0n;
  try {
    return parseAmountInput(text, decimals, { allowNegative: false });
  } catch {
    return null;
  }
}

function apilxAmountText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return n.toFixed(2);
}

async function resolvePlayer(q: Queryable, userID: unknown) {
  const raw = typeof userID === 'number' ? String(userID) : typeof userID === 'string' ? userID.trim() : '';
  if (!/^\d+$/.test(raw)) return null;
  const { rows } = await q.query<{ user_id: string; wallet_id: string; currency: string }>(
    `select u.id::text as user_id, w.id::text as wallet_id, w.currency
       from users u
       join wallets w on w.user_id = u.id and w.kind = 'main'
      where u.account_no = $1::bigint and u.role = 'user' and u.status = 'active'`,
    [raw],
  );
  return rows[0] ?? null;
}

async function resolveGameId(q: Queryable, gameID: unknown): Promise<string | null> {
  if (gameID === null || gameID === undefined) return null;
  const ext = String(gameID).trim();
  if (!ext) return null;
  const { rows } = await q.query<{ id: string }>(
    `select id::text from games where external_id = $1 and is_active limit 1`,
    [ext],
  );
  if (rows[0]) return rows[0].id;
  const stripped = ext.replace(/^0+/, '') || ext;
  if (stripped !== ext) {
    const { rows: rowsAlt } = await q.query<{ id: string }>(
      `select id::text from games where external_id = $1 and is_active limit 1`,
      [stripped],
    );
    if (rowsAlt[0]) return rowsAlt[0].id;
  }
  const { rows: rows2 } = await q.query<{ id: string }>(
    `select id::text from games where external_id is null and slug = $1 and art->>'source' = 'aggregator' limit 1`,
    [ext],
  );
  return rows2[0]?.id ?? null;
}

/** LX gameID sometimes disagrees with catalog; reuse the player’s latest API LX session game. */
async function resolveGameForWallet(q: Queryable, userId: string, gameID: unknown): Promise<string | null> {
  const direct = await resolveGameId(q, gameID);
  if (direct) return direct;
  const { rows } = await q.query<{ game_id: string }>(
    `select game_id::text
       from provider_sessions
      where user_id = $1::uuid and aggregator = $2 and expires_at > now()
      order by expires_at desc
      limit 1`,
    [userId, AGGREGATOR],
  );
  if (rows[0]) return rows[0].game_id;
  const { rows: anyGame } = await q.query<{ id: string }>(
    `select id::text from games where art->>'source' = 'aggregator' and is_active order by id limit 1`,
  );
  return anyGame[0]?.id ?? null;
}

function sessionHash(userId: string, gameId: string): string {
  return createHash('sha256').update(`apilx:${userId}:${gameId}`, 'utf8').digest('hex');
}

async function ensureSession(q: Queryable, userId: string, walletId: string, gameId: string, currency: string): Promise<string> {
  const tokenHash = sessionHash(userId, gameId);
  const { rows } = await q.query<{ id: string }>(
    `insert into provider_sessions (token_hash, user_id, wallet_id, game_id, aggregator, currency, expires_at)
     values ($1, $2::uuid, $3::bigint, $4::bigint, $5, $6, now() + interval '24 hours')
     on conflict (token_hash) do update set expires_at = excluded.expires_at
     returning id::text`,
    [tokenHash, userId, walletId, gameId, AGGREGATOR, currency],
  );
  const id = rows[0]?.id;
  if (!id) {
    const sel = await q.query<{ id: string }>('select id::text from provider_sessions where token_hash = $1', [tokenHash]);
    return sel.rows[0]?.id ?? '';
  }
  return id;
}

function platformTxId(): string {
  return randomBytes(16).toString('hex');
}

function verify(cfg: ApilxConfig, body: Record<string, unknown>, op: Op): Reply | null {
  const agent = body.agentID;
  if (typeof agent !== 'string' || agent !== cfg.agentId) return err(CODES.badAgent, 'Invalid Agent');
  const sign = body.sign;
  const builders: Record<Op, string> = {
    GetBalance: APILX_SIGN.getBalance(body),
    Withdraw: APILX_SIGN.withdraw(body),
    Deposit: APILX_SIGN.deposit(body),
    BetWin: APILX_SIGN.betWin(body),
    RollbackTransaction: APILX_SIGN.rollback(body),
  };
  if (!apilxSignAny(cfg.callbackSecrets, builders[op], sign)) return err(CODES.badSign, 'Invalid Sign');
  return null;
}

export async function apilxWalletCallback(ctx: Ctx, op: Op): Promise<Reply> {
  const cfg = ctx.config.apilx;
  if (!cfg) return err(CODES.general, 'not_configured');

  const { value } = await ctx.rawJson();
  const body = (value ?? {}) as Record<string, unknown>;
  const badSign = verify(cfg, body, op);
  if (badSign) return badSign;

  const player = await resolvePlayer(ctx.db, body.userID);
  if (!player) return err(CODES.noUser, 'Cannot find specified user id');

  const gameDbId = await resolveGameForWallet(ctx.db, player.user_id, body.gameID);
  if (!gameDbId) return err(CODES.badParams, 'Wrong input parameters');

  const decimals = await currencyDecimals(ctx.db, player.currency);
  const sessionId = await ensureSession(ctx.db, player.user_id, player.wallet_id, gameDbId, player.currency);

  if (op === 'GetBalance') {
    const wallet = await getWallet(ctx.db, player.wallet_id);
    if (!wallet) return err(CODES.noUser, 'Cannot find specified user id');
    return reply(200, { code: CODES.ok, message: '', balance: balanceNumber(wallet.balanceMinor, decimals) });
  }

  try {
    return await ctx.db.transaction(async (tx) => {
      if (op === 'RollbackTransaction') {
        const ref = body.refTransactionID;
        if (typeof ref !== 'string' && typeof ref !== 'number') return err(CODES.badParams, 'Wrong input parameters');
        const refId = String(ref);
        const inserted = await tx.query<{ id: string }>(
          `insert into provider_transactions (aggregator, tx_id, kind, session_id, round_id, ref_tx_id, amount_minor)
           values ($1, $2, 'rollback', $3::bigint, null, $4, 0)
           on conflict (aggregator, tx_id) do nothing returning id::text`,
          [AGGREGATOR, `rollback:${refId}`, sessionId, refId],
        );
        if (inserted.rows.length === 0) return reply(200, { code: CODES.ok, message: '' });

        const orig = await tx.query<{
          id: string;
          kind: string;
          amount_minor: string;
          win_amount_minor: string | null;
          rolled_back: boolean;
        }>(
          `select id::text, kind, amount_minor::text, win_amount_minor::text, rolled_back
             from provider_transactions where aggregator = $1 and tx_id = $2 for update`,
          [AGGREGATOR, refId],
        );
        const o = orig.rows[0];
        if (!o || o.rolled_back) return reply(200, { code: CODES.ok, message: '' });

        const reference = `${AGGREGATOR}:${refId}`;
        if (o.kind === 'debit' || o.kind === 'betwin') {
          const stake = BigInt(o.amount_minor);
          if (stake > 0n) {
            await postEntry(tx, {
              walletId: player.wallet_id,
              entryType: 'bet_refund',
              amountMinor: stake,
              scope: SCOPE,
              idempotencyKey: `apilx:rollback:stake:${refId}`,
              reference,
              reason: 'API LX rollback',
              metadata: { aggregator: AGGREGATOR, refTransactionID: refId },
            });
          }
          if (o.kind === 'betwin') {
            const win = BigInt(o.win_amount_minor ?? '0');
            if (win > 0n) {
              await postEntry(tx, {
                walletId: player.wallet_id,
                entryType: 'bet_stake',
                amountMinor: win,
                scope: SCOPE,
                idempotencyKey: `apilx:rollback:win:${refId}`,
                reference,
                reason: 'API LX rollback win',
                metadata: { aggregator: AGGREGATOR, refTransactionID: refId },
              });
            }
          }
          await tx.query('update provider_transactions set rolled_back = true where id = $1::bigint', [o.id]);
        } else if (o.kind === 'credit') {
          const win = BigInt(o.amount_minor);
          if (win > 0n) {
            await postEntry(tx, {
              walletId: player.wallet_id,
              entryType: 'bet_stake',
              amountMinor: win,
              scope: SCOPE,
              idempotencyKey: `apilx:rollback:credit:${refId}`,
              reference,
              reason: 'API LX rollback deposit',
              metadata: { aggregator: AGGREGATOR, refTransactionID: refId },
            });
          }
          await tx.query('update provider_transactions set rolled_back = true where id = $1::bigint', [o.id]);
        }
        return reply(200, { code: CODES.ok, message: '' });
      }

      const txId = body.transactionID;
      if ((typeof txId !== 'string' && typeof txId !== 'number') || String(txId).length > 200 || String(txId) === '') {
        return err(CODES.badParams, 'Wrong input parameters');
      }
      const transactionId = String(txId);
      const roundRaw = body.roundID;
      const roundId = typeof roundRaw === 'string' || typeof roundRaw === 'number' ? String(roundRaw).slice(0, 200) : null;
      const reference = `${AGGREGATOR}:${roundId ?? transactionId}`;
      const platId = platformTxId();

      if (op === 'BetWin') {
        const bet = parseWireAmount(body.betAmount, decimals);
        const win = parseWireAmount(body.winAmount, decimals);
        if (bet === null || win === null) return err(CODES.badParams, 'Wrong input parameters');
        const inserted = await tx.query<{ id: string }>(
          `insert into provider_transactions (aggregator, tx_id, kind, session_id, round_id, amount_minor, win_amount_minor)
           values ($1, $2, 'betwin', $3::bigint, $4, $5::bigint, $6::bigint)
           on conflict (aggregator, tx_id) do nothing returning id::text`,
          [AGGREGATOR, transactionId, sessionId, roundId, bet.toString(), win.toString()],
        );
        if (inserted.rows.length === 0) {
          const wallet = await getWallet(tx, player.wallet_id);
          return reply(200, {
            code: CODES.ok,
            message: '',
            platformTransactionID: platId,
            balance: balanceNumber(wallet?.balanceMinor ?? 0n, decimals),
          });
        }
        if (bet > 0n) {
          await postEntry(tx, {
            walletId: player.wallet_id,
            entryType: 'bet_stake',
            amountMinor: bet,
            scope: SCOPE,
            idempotencyKey: `apilx:betwin:stake:${transactionId}`,
            reference,
            reason: 'API LX BetWin',
            metadata: { aggregator: AGGREGATOR, transactionId, roundId },
          });
        }
        if (win > 0n) {
          await postEntry(tx, {
            walletId: player.wallet_id,
            entryType: 'bet_win',
            amountMinor: win,
            scope: SCOPE,
            idempotencyKey: `apilx:betwin:win:${transactionId}`,
            reference,
            reason: 'API LX BetWin',
            metadata: { aggregator: AGGREGATOR, transactionId, roundId },
          });
        }
        const wallet = await getWallet(tx, player.wallet_id);
        return reply(200, {
          code: CODES.ok,
          message: '',
          platformTransactionID: platId,
          balance: balanceNumber(wallet?.balanceMinor ?? 0n, decimals),
        });
      }

      const amount = parseWireAmount(body.amount, decimals);
      if (amount === null) return err(CODES.badParams, 'Wrong input parameters');

      if (op === 'Withdraw') {
        const tomb = await tx.query('select 1 from provider_transactions where aggregator = $1 and kind = $2 and ref_tx_id = $3', [
          AGGREGATOR,
          'rollback',
          transactionId,
        ]);
        if (tomb.rows.length > 0) return err(CODES.general, 'transaction rolled back');
      }

      const kind = op === 'Withdraw' ? 'debit' : 'credit';
      const refDeposit = op === 'Deposit' ? body.refTransactionID : null;
      const refTx = typeof refDeposit === 'string' || typeof refDeposit === 'number' ? String(refDeposit) : null;

      const inserted = await tx.query<{ id: string }>(
        `insert into provider_transactions (aggregator, tx_id, kind, session_id, round_id, ref_tx_id, amount_minor)
         values ($1, $2, $3, $4::bigint, $5, $6, $7::bigint)
         on conflict (aggregator, tx_id) do nothing returning id::text`,
        [AGGREGATOR, transactionId, kind, sessionId, roundId, refTx, amount.toString()],
      );
      if (inserted.rows.length === 0) {
        const wallet = await getWallet(tx, player.wallet_id);
        return reply(200, {
          code: CODES.ok,
          message: '',
          platformTransactionID: platId,
          balance: balanceNumber(wallet?.balanceMinor ?? 0n, decimals),
        });
      }

      if (amount > 0n) {
        await postEntry(tx, {
          walletId: player.wallet_id,
          entryType: kind === 'debit' ? 'bet_stake' : 'bet_win',
          amountMinor: amount,
          scope: SCOPE,
          idempotencyKey: `apilx:${kind}:${transactionId}`,
          reference,
          reason: op === 'Withdraw' ? 'API LX Withdraw' : 'API LX Deposit',
          metadata: { aggregator: AGGREGATOR, transactionId, roundId, refTransactionID: refTx },
        });
      }

      const wallet = await getWallet(tx, player.wallet_id);
      return reply(200, {
        code: CODES.ok,
        message: '',
        platformTransactionID: platId,
        balance: balanceNumber(wallet?.balanceMinor ?? 0n, decimals),
      });
    });
  } catch (error) {
    if (isAppError(error) && error.code === 'insufficient_funds') return err(CODES.noFunds, 'Insufficient funds');
    throw error;
  }
}
