/**
 * Two-factor sign-in (authenticator app codes) for every account: players, cashiers, admins.
 *
 * The state is kept in site_settings under "two_factor.<user id>" so no database migration is
 * needed. Only this module reads those rows; settings screens list known keys only.
 *
 * Sign-in with 2FA on: the password step returns a short-lived ticket (5 minutes, 5 tries) instead
 * of a session; the code step exchanges ticket + code for the session.
 */
import { randomBytes } from 'node:crypto';
import type { Queryable } from '@aurum/db';
import { AppError } from '@aurum/shared';
import type { Ctx } from '../http/types.ts';
import { newTotpSecret, otpauthUrl, verifyTotp } from '../security/totp.ts';
import { verifyPassword } from '../security/password.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';

interface TwoFactorState {
  enabled: boolean;
  secret: string | null;
  pending: string | null;
  lastStep: number | null;
  enabledAt: string | null;
}

const EMPTY: TwoFactorState = { enabled: false, secret: null, pending: null, lastStep: null, enabledAt: null };

const keyFor = (userId: string) => `two_factor.${userId.replace(/-/g, '').toLowerCase()}`;

export async function loadTwoFactor(q: Queryable, userId: string): Promise<TwoFactorState> {
  const { rows } = await q.query<{ value: unknown }>('select value from site_settings where key = $1', [keyFor(userId)]);
  const v = rows[0]?.value as Partial<TwoFactorState> | undefined;
  if (!v || typeof v !== 'object') return { ...EMPTY };
  return {
    enabled: v.enabled === true && typeof v.secret === 'string',
    secret: typeof v.secret === 'string' ? v.secret : null,
    pending: typeof v.pending === 'string' ? v.pending : null,
    lastStep: typeof v.lastStep === 'number' ? v.lastStep : null,
    enabledAt: typeof v.enabledAt === 'string' ? v.enabledAt : null,
  };
}

async function saveTwoFactor(q: Queryable, userId: string, state: TwoFactorState): Promise<void> {
  await q.query(
    `insert into site_settings (key, value, updated_by) values ($1, $2::jsonb, $3::uuid)
     on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by`,
    [keyFor(userId), JSON.stringify(state), userId],
  );
}

// --- sign-in tickets (memory, single API process) ----------------------------------------
interface Ticket {
  userId: string;
  expiresAt: number;
  attempts: number;
}
const TICKET_MS = 5 * 60_000;
const TICKET_TRIES = 5;
const tickets = new Map<string, Ticket>();

export function issueTicket(userId: string, now: Date): string {
  for (const [k, t] of tickets) if (t.expiresAt <= now.getTime()) tickets.delete(k);
  const token = randomBytes(32).toString('base64url');
  tickets.set(token, { userId, expiresAt: now.getTime() + TICKET_MS, attempts: 0 });
  return token;
}

/** Checks ticket + code. Returns the user id on success; the ticket is used up either way after 5 tries. */
export async function redeemTicket(ctx: Ctx, token: string, code: string): Promise<string> {
  const t = tickets.get(token);
  if (!t || t.expiresAt <= ctx.now.getTime()) {
    tickets.delete(token);
    throw new AppError('two_factor_expired');
  }
  const perUser = ctx.services.limiter.hit(`2fa:${t.userId}`, 10, 15 * 60_000);
  if (!perUser.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: perUser.retryAfterSeconds } });
  t.attempts += 1;
  if (t.attempts > TICKET_TRIES) {
    tickets.delete(token);
    throw new AppError('two_factor_expired');
  }
  const ok = await ctx.db.transaction(async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [keyFor(t.userId)]);
    const state = await loadTwoFactor(tx, t.userId);
    if (!state.enabled || !state.secret) return true; // switched off meanwhile: password was already checked
    const step = verifyTotp(state.secret, code, ctx.now, state.lastStep);
    if (step === null) return false;
    await saveTwoFactor(tx, t.userId, { ...state, lastStep: step });
    return true;
  });
  if (!ok) {
    await audit(ctx.db, auditActor(ctx, null), { action: 'auth.two_factor_failed', targetType: 'user', targetId: t.userId, details: { attempt: t.attempts } });
    throw new AppError('two_factor_invalid');
  }
  tickets.delete(token);
  return t.userId;
}

// --- account screens ------------------------------------------------------------------------
export async function twoFactorStatus(ctx: Ctx): Promise<{ enabled: boolean; enabledAt: string | null }> {
  const s = await loadTwoFactor(ctx.db, ctx.principal().id);
  return { enabled: s.enabled, enabledAt: s.enabled ? s.enabledAt : null };
}

/** Starts (or restarts) setup: a new secret waits until the first correct code confirms it. */
export async function beginTwoFactorSetup(ctx: Ctx): Promise<{ secret: string; otpauthUrl: string }> {
  const user = ctx.principal();
  const state = await loadTwoFactor(ctx.db, user.id);
  if (state.enabled) throw new AppError('two_factor_already_on');
  const secret = newTotpSecret();
  await saveTwoFactor(ctx.db, user.id, { ...state, pending: secret });
  return { secret, otpauthUrl: otpauthUrl(secret, user.username, 'Hannibal') };
}

export async function confirmTwoFactor(ctx: Ctx, code: string): Promise<void> {
  const user = ctx.principal();
  await ctx.db.transaction(async (tx) => {
    const state = await loadTwoFactor(tx, user.id);
    if (state.enabled) throw new AppError('two_factor_already_on');
    if (!state.pending) throw new AppError('two_factor_expired');
    const step = verifyTotp(state.pending, code, ctx.now);
    if (step === null) throw new AppError('two_factor_invalid');
    await saveTwoFactor(tx, user.id, { enabled: true, secret: state.pending, pending: null, lastStep: step, enabledAt: ctx.now.toISOString() });
    await audit(tx, auditActor(ctx), { action: 'auth.two_factor_enabled', targetType: 'user', targetId: user.id });
  });
}

/** Turning 2FA off needs the password AND a current code. */
export async function disableTwoFactor(ctx: Ctx, password: string, code: string): Promise<void> {
  const user = ctx.principal();
  const { rows } = await ctx.db.query<{ password_hash: string }>('select password_hash from users where id = $1::uuid', [user.id]);
  const hash = rows[0]?.password_hash;
  if (!hash || !(await verifyPassword(password, hash))) throw new AppError('invalid_credentials');
  await ctx.db.transaction(async (tx) => {
    const state = await loadTwoFactor(tx, user.id);
    if (!state.enabled || !state.secret) return;
    if (verifyTotp(state.secret, code, ctx.now, state.lastStep) === null) throw new AppError('two_factor_invalid');
    await saveTwoFactor(tx, user.id, { ...EMPTY });
    await audit(tx, auditActor(ctx), { action: 'auth.two_factor_disabled', targetType: 'user', targetId: user.id });
  });
}

/** Super Admin: remove 2FA from an account whose phone was lost (audited). */
export async function resetTwoFactor(ctx: Ctx, userId: string): Promise<void> {
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>('select id::text from users where id = $1::uuid', [userId]);
    if (!rows[0]) throw new AppError('not_found');
    await saveTwoFactor(tx, userId, { ...EMPTY });
    await audit(tx, auditActor(ctx), { action: 'auth.two_factor_reset', targetType: 'user', targetId: userId });
  });
}
