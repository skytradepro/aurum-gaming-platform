/**
 * Player and staff accounts: registration, login, profile and password.
 * Passwords are hashed with scrypt, sessions are random tokens (only their hash is stored),
 * failed logins lock the account for a while, and everything important is written to the audit log.
 */
import { createHash } from 'node:crypto';
import type { Queryable } from '@aurum/db';
import { getWalletByUser, postEntry } from '@aurum/ledger';
import type { MoneyDTO } from '@aurum/money';
import { AppError, MIN_AGE, TERMS_VERSION, ageOn, normalizeEmail, passwordProblem, todayUtc, toE164 } from '@aurum/shared';
import type { Permission, Role, ShopRole, UserStatus } from '@aurum/shared';
import { serializeCookie } from '../http/cookies.ts';
import type { Ctx, SessionUser } from '../http/types.ts';
import { hashPassword, needsRehash, burnPasswordCheck, verifyPassword } from '../security/password.ts';
import { createSession, loadSession, revokeSession, revokeUserSessions } from '../security/session.ts';
import { audit } from './audit.ts';
import { issueTicket, loadTwoFactor, redeemTicket } from './two-factor.ts';
import type { AuditActor } from './audit.ts';

export interface MeDTO {
  id: string;
  accountNo: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  permissions: Permission[];
  status: UserStatus;
  accountCurrency: string | null;
  preferredLocale: string | null;
  displayCurrency: string | null;
  mustChangePassword: boolean;
  wallet: { id: string; currency: string; balance: MoneyDTO } | null;
  /** Players only (false for staff). */
  marketingOptIn: boolean;
  /** Shop workers only. */
  shop: { id: string; code: string; name: string; currency: string; status: string; role: ShopRole } | null;
}

export async function buildMe(q: Queryable, user: SessionUser): Promise<MeDTO> {
  const wallet = user.role === 'user' ? await getWalletByUser(q, user.id) : null;
  let marketingOptIn = false;
  if (user.role === 'user') {
    const pref = await q.query<{ marketing_opt_in: boolean }>('select marketing_opt_in from users where id = $1::uuid', [user.id]);
    marketingOptIn = pref.rows[0]?.marketing_opt_in ?? false;
  }
  let shop: MeDTO['shop'] = null;
  if (user.role === 'cashier' && user.shopId && user.shopRole) {
    const { rows } = await q.query<{ id: string; code: string; name: string; currency: string; status: string }>(
      'select id::text, code, name, currency, status from shops where id = $1::bigint',
      [user.shopId],
    );
    if (rows[0]) shop = { ...rows[0], role: user.shopRole };
  }
  return {
    id: user.id,
    accountNo: user.accountNo,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    permissions: user.permissions,
    status: user.status,
    accountCurrency: user.accountCurrency,
    preferredLocale: user.preferredLocale,
    displayCurrency: user.displayCurrency,
    mustChangePassword: user.mustChangePassword,
    wallet: wallet
      ? { id: wallet.id, currency: wallet.currency, balance: { amountMinor: wallet.balanceMinor.toString(), currency: wallet.currency } }
      : null,
    marketingOptIn,
    shop,
  };
}

export function auditActor(ctx: Ctx, user: SessionUser | null = ctx.user): AuditActor {
  return { actorId: user?.id ?? null, actorRole: user?.role ?? null, ip: ctx.ip, userAgent: ctx.userAgent, requestId: ctx.requestId };
}

export function sessionCookie(ctx: Ctx, token: string, maxAgeSeconds: number): string {
  return serializeCookie(ctx.config.cookieName, token, { secure: ctx.config.cookieSecure, maxAgeSeconds });
}

export function clearedSessionCookie(ctx: Ctx): string {
  return serializeCookie(ctx.config.cookieName, '', { secure: ctx.config.cookieSecure, maxAgeSeconds: 0 });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
export interface RegisterInput {
  username: string;
  email: string;
  callingCode?: string | undefined;
  mobile?: string | undefined;
  password: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  dateOfBirth?: string | undefined;
  country: string;
  currency: string;
  acceptTerms: boolean;
  marketingOptIn: boolean;
  preferredLocale?: string | undefined;
  captchaToken?: string | undefined;
}

export interface AuthResult {
  me: MeDTO;
  cookie: string;
}

/** Password was right, but the account has 2FA on: the code step must follow. */
export interface TwoFactorChallenge {
  twoFactorTicket: string;
}

export async function registerPlayer(ctx: Ctx, input: RegisterInput): Promise<AuthResult> {
  const { db, config, services } = ctx;

  if (!(await services.captcha.verify(input.captchaToken, ctx.ip))) {
    throw new AppError('forbidden', { message: 'captcha failed', fields: { captchaToken: 'required' } });
  }

  const setting = await db.query<{ value: unknown }>("select value from site_settings where key = 'registration_open'");
  if (setting.rows[0]?.value === false) throw new AppError('registration_closed');

  if (!input.acceptTerms) throw new AppError('terms_required', { fields: { acceptTerms: 'mustAcceptTerms' } });
  // Date of birth and phone are optional (simple sign-up); when given they are still checked.
  if (input.dateOfBirth && ageOn(input.dateOfBirth, todayUtc(ctx.now)) < MIN_AGE) {
    throw new AppError('under_age', { fields: { dateOfBirth: 'mustBeAdult' } });
  }
  const mobile = input.mobile?.trim() ?? '';
  const phone = mobile ? toE164(input.callingCode ?? '', mobile) : null;
  if (mobile && !phone) throw new AppError('validation', { fields: { mobile: 'invalidPhone' } });
  const problem = passwordProblem(input.password, { username: input.username, email: input.email });
  if (problem) throw new AppError('weak_password', { fields: { password: problem } });

  const country = await db.query<{ code: string }>('select code from countries where code = $1 and is_enabled', [input.country]);
  if (country.rowCount === 0) throw new AppError('country_unavailable', { fields: { country: 'invalidChoice' } });
  const currency = await db.query<{ code: string }>('select code from currencies where code = $1 and is_enabled', [input.currency]);
  if (currency.rowCount === 0) throw new AppError('currency_unavailable', { fields: { currency: 'invalidChoice' } });

  const passwordHash = await hashPassword(input.password, config.scryptLog2N);

  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `insert into users (username, email, phone, password_hash, first_name, last_name, date_of_birth,
                          country_code, account_currency, preferred_locale, marketing_opt_in,
                          terms_accepted_at, terms_version)
       values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12::timestamptz, $13)
       returning id::text`,
      [
        input.username, normalizeEmail(input.email), phone, passwordHash, input.firstName ?? '', input.lastName ?? '', input.dateOfBirth ?? null,
        input.country, input.currency, input.preferredLocale ?? null, input.marketingOptIn, ctx.now.toISOString(), TERMS_VERSION,
      ],
    );
    const id = (rows[0] as { id: string }).id;
    await creditWelcomeGift(tx, id);
    const session = await createSession(tx, { userId: id, role: 'user', ip: ctx.ip, userAgent: ctx.userAgent, now: ctx.now, config });
    const user = await loadSession(tx, session.token, ctx.now, config);
    if (!user) throw new AppError('internal_error', { message: 'new session could not be loaded' });
    await audit(tx, auditActor(ctx, user), { action: 'auth.register', targetType: 'user', targetId: id, details: { country: input.country, currency: input.currency } });
    return { me: await buildMe(tx, user), cookie: sessionCookie(ctx, session.token, session.maxAgeSeconds) };
  });
}

/** Welcome gift: a small credit once per new player (setting welcome_gift_cents, hundredths of the currency; 0 = off). */
async function creditWelcomeGift(tx: Queryable, userId: string): Promise<void> {
  const setting = await tx.query<{ value: unknown }>("select value from site_settings where key = 'welcome_gift_cents'");
  const raw = setting.rows[0]?.value;
  const cents = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 1000 ? raw : 50;
  if (cents === 0) return;
  const { rows } = await tx.query<{ id: string; decimals: number }>(
    `select w.id::text, c.decimals::int as decimals from wallets w join currencies c on c.code = w.currency
      where w.user_id = $1::uuid and w.kind = 'main'`,
    [userId],
  );
  const wallet = rows[0];
  if (!wallet) return;
  const amountMinor = wallet.decimals >= 2 ? BigInt(cents) * 10n ** BigInt(wallet.decimals - 2) : BigInt(Math.floor(cents / 10 ** (2 - wallet.decimals)));
  if (amountMinor < 1n) return;
  await postEntry(tx, { walletId: wallet.id, entryType: 'welcome_gift', amountMinor, scope: `welcome:${userId}`, idempotencyKey: 'welcome', reason: 'Welcome gift' });
}

// ---------------------------------------------------------------------------
// Login / logout
// ---------------------------------------------------------------------------
const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60_000;

interface LoginRow {
  id: string;
  username: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  failed_login_count: number;
  locked_until: Date | null;
}

function idHash(identifier: string): string {
  return createHash('sha256').update(identifier.toLowerCase()).digest('hex').slice(0, 16);
}

export async function login(ctx: Ctx, input: { identifier: string; password: string }): Promise<AuthResult | TwoFactorChallenge> {
  const { db, config, services } = ctx;
  const identifier = input.identifier.trim();
  const perIdentifier = services.limiter.hit(`login-id:${identifier.toLowerCase()}`, 10, 15 * 60_000);
  if (!perIdentifier.allowed) {
    throw new AppError('rate_limited', { details: { retryAfterSeconds: perIdentifier.retryAfterSeconds } });
  }

  // Username, e-mail or phone (international format, or 8 Tunisian digits). A username or e-mail match wins.
  const compact = identifier.replace(/[\s.()-]/g, '');
  const phone = /^(\+|00)[1-9]\d{5,14}$/.test(compact)
    ? `+${compact.replace(/^(\+|00)/, '')}`
    : /^\d{8}$/.test(compact)
      ? `+216${compact}`
      : null;
  const { rows } = await db.query<LoginRow>(
    `select id::text, username, password_hash, role::text, status::text, failed_login_count, locked_until
       from users
      where lower(username) = lower($1) or lower(email) = lower($1) or ($2::text is not null and phone = $2::text)
      order by (lower(username) = lower($1) or lower(email) = lower($1)) desc
      limit 1`,
    [identifier, phone],
  );
  const row = rows[0];
  if (!row) {
    await burnPasswordCheck(input.password, config.scryptLog2N);
    await audit(db, auditActor(ctx, null), { action: 'auth.login_failed', details: { identifier: idHash(identifier), reason: 'unknown_user' } });
    throw new AppError('invalid_credentials');
  }

  if (row.locked_until && row.locked_until.getTime() > ctx.now.getTime()) {
    await audit(db, auditActor(ctx, null), { action: 'auth.login_blocked', targetType: 'user', targetId: row.id, details: { reason: 'locked' } });
    throw new AppError('account_locked', { details: { retryAfterSeconds: Math.ceil((row.locked_until.getTime() - ctx.now.getTime()) / 1000) } });
  }

  const valid = await verifyPassword(input.password, row.password_hash);
  if (!valid) {
    const failures = row.failed_login_count + 1;
    const lock = failures >= MAX_FAILED_LOGINS;
    await db.query(
      `update users set failed_login_count = $2, locked_until = $3::timestamptz where id = $1::uuid`,
      [row.id, lock ? 0 : failures, lock ? new Date(ctx.now.getTime() + LOCK_MS).toISOString() : null],
    );
    await audit(db, auditActor(ctx, null), { action: lock ? 'auth.account_locked' : 'auth.login_failed', targetType: 'user', targetId: row.id, details: { failures } });
    throw new AppError(lock ? 'account_locked' : 'invalid_credentials', lock ? { details: { retryAfterSeconds: LOCK_MS / 1000 } } : {});
  }

  if (row.status !== 'active') {
    await audit(db, auditActor(ctx, null), { action: 'auth.login_blocked', targetType: 'user', targetId: row.id, details: { reason: row.status } });
    throw new AppError('account_suspended');
  }
  if (row.role === 'cashier') {
    // the workers of a closed shop cannot sign in any more
    const shop = await db.query<{ status: string }>('select s.status from users u join shops s on s.id = u.shop_id where u.id = $1::uuid', [row.id]);
    if (shop.rows[0]?.status === 'closed') {
      await audit(db, auditActor(ctx, null), { action: 'auth.login_blocked', targetType: 'user', targetId: row.id, details: { reason: 'shop_closed' } });
      throw new AppError('account_suspended');
    }
  }

  services.limiter.reset(`login-id:${identifier.toLowerCase()}`);
  if (needsRehash(row.password_hash, config.scryptLog2N)) {
    await db.query('update users set password_hash = $2 where id = $1::uuid', [row.id, await hashPassword(input.password, config.scryptLog2N)]);
  }
  const twoFactor = await loadTwoFactor(db, row.id);
  if (twoFactor.enabled) {
    await db.query('update users set failed_login_count = 0, locked_until = null where id = $1::uuid', [row.id]);
    await audit(db, auditActor(ctx, null), { action: 'auth.two_factor_requested', targetType: 'user', targetId: row.id });
    return { twoFactorTicket: issueTicket(row.id, ctx.now) };
  }
  return startSession(ctx, row.id, row.role);
}

/** Second step of a 2FA sign-in: ticket from the password step + the authenticator code. */
export async function loginWithCode(ctx: Ctx, input: { ticket: string; code: string }): Promise<AuthResult> {
  const userId = await redeemTicket(ctx, input.ticket, input.code);
  const { rows } = await ctx.db.query<{ role: Role; status: UserStatus }>('select role::text, status::text from users where id = $1::uuid', [userId]);
  const row = rows[0];
  if (!row || row.status !== 'active') throw new AppError('account_suspended');
  return startSession(ctx, userId, row.role);
}

async function startSession(ctx: Ctx, userId: string, role: Role): Promise<AuthResult> {
  const { db, config } = ctx;
  const row = { id: userId, role };
  return db.transaction(async (tx) => {
    await tx.query('update users set failed_login_count = 0, locked_until = null, last_login_at = $2::timestamptz where id = $1::uuid', [row.id, ctx.now.toISOString()]);
    const session = await createSession(tx, { userId: row.id, role: row.role, ip: ctx.ip, userAgent: ctx.userAgent, now: ctx.now, config });
    const user = await loadSession(tx, session.token, ctx.now, config);
    if (!user) throw new AppError('internal_error', { message: 'new session could not be loaded' });
    await audit(tx, auditActor(ctx, user), { action: 'auth.login', targetType: 'user', targetId: row.id });
    return { me: await buildMe(tx, user), cookie: sessionCookie(ctx, session.token, session.maxAgeSeconds) };
  });
}

export async function logout(ctx: Ctx): Promise<string> {
  const user = ctx.principal();
  await revokeSession(ctx.db, user.sessionId, ctx.now);
  await audit(ctx.db, auditActor(ctx), { action: 'auth.logout', targetType: 'user', targetId: user.id });
  return clearedSessionCookie(ctx);
}

// ---------------------------------------------------------------------------
// Password and preferences
// ---------------------------------------------------------------------------
export async function changePassword(ctx: Ctx, input: { currentPassword: string; newPassword: string }): Promise<void> {
  const user = ctx.principal();
  const limit = ctx.services.limiter.hit(`pwchange:${user.id}`, 5, 15 * 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });

  const { rows } = await ctx.db.query<{ password_hash: string }>('select password_hash from users where id = $1::uuid', [user.id]);
  const stored = rows[0]?.password_hash;
  if (!stored || !(await verifyPassword(input.currentPassword, stored))) {
    await audit(ctx.db, auditActor(ctx), { action: 'auth.password_change_failed', targetType: 'user', targetId: user.id });
    throw new AppError('invalid_credentials', { fields: { currentPassword: 'invalidCredentials' } });
  }
  const problem = passwordProblem(input.newPassword, { username: user.username, email: user.email });
  if (problem) throw new AppError('weak_password', { fields: { newPassword: problem } });
  if (input.newPassword === input.currentPassword) {
    throw new AppError('weak_password', { fields: { newPassword: 'passwordTooCommon' } });
  }
  const hash = await hashPassword(input.newPassword, ctx.config.scryptLog2N);
  await ctx.db.transaction(async (tx) => {
    await tx.query(
      'update users set password_hash = $2, password_changed_at = $3::timestamptz, must_change_password = false where id = $1::uuid',
      [user.id, hash, ctx.now.toISOString()],
    );
    await revokeUserSessions(tx, user.id, ctx.now, user.sessionId);
    await audit(tx, auditActor(ctx), { action: 'auth.password_changed', targetType: 'user', targetId: user.id });
  });
}

export async function updatePreferences(
  ctx: Ctx,
  input: { preferredLocale?: string | undefined; displayCurrency?: string | null | undefined; marketingOptIn?: boolean | undefined },
): Promise<void> {
  const user = ctx.principal();
  if (input.displayCurrency) {
    const c = await ctx.db.query('select 1 from currencies where code = $1 and is_enabled', [input.displayCurrency]);
    if (c.rowCount === 0) throw new AppError('currency_unavailable', { fields: { displayCurrency: 'invalidChoice' } });
  }
  const sets: string[] = [];
  const params: unknown[] = [user.id];
  const add = (column: string, value: unknown) => {
    params.push(value);
    sets.push(`${column} = $${params.length}`);
  };
  if (input.preferredLocale !== undefined) add('preferred_locale', input.preferredLocale);
  if (input.displayCurrency !== undefined) add('display_currency', input.displayCurrency);
  if (input.marketingOptIn !== undefined) add('marketing_opt_in', input.marketingOptIn);
  if (sets.length === 0) return;
  await ctx.db.query(`update users set ${sets.join(', ')} where id = $1::uuid`, params);
}
