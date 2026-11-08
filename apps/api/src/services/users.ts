/**
 * Staff-side account management: the player list and detail, status changes, temporary
 * passwords, and (Super Admin only) admin accounts with their permissions.
 */
import { randomInt } from 'node:crypto';
import type { Queryable } from '@aurum/db';
import type { MoneyDTO } from '@aurum/money';
import { AppError, MIN_AGE, TERMS_VERSION, ageOn, isPermission, normalizeEmail, passwordProblem, todayUtc, toE164 } from '@aurum/shared';
import type { Permission, Role, UserStatus } from '@aurum/shared';
import type { Ctx } from '../http/types.ts';
import { hashPassword } from '../security/password.ts';
import { revokeUserSessions } from '../security/session.ts';
import { audit } from './audit.ts';
import { auditActor } from './accounts.ts';
import type { Page } from './balances.ts';

const money = (amountMinor: string, currency: string): MoneyDTO => ({ amountMinor, currency });

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------
export interface PlayerListItemDTO {
  id: string;
  accountNo: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  country: string | null;
  status: UserStatus;
  accountCurrency: string | null;
  balance: MoneyDTO | null;
  /** username of the admin who created the player (null = website sign-up or Super Admin) */
  owner: string | null;
  createdAt: string;
  lastLoginAt: string | null;
}

interface PlayerRow {
  id: string;
  account_no: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  country_code: string | null;
  status: UserStatus;
  account_currency: string | null;
  balance_minor: string | null;
  owner_username: string | null;
  created_at: Date;
  last_login_at: Date | null;
}

const PLAYER_COLUMNS = `u.id::text, u.account_no::text, u.username, u.email, u.first_name, u.last_name, u.phone,
  u.country_code, u.status::text, u.account_currency, w.balance_minor::text,
  (select o.username from users o where o.id = u.owner_id) as owner_username, u.created_at, u.last_login_at`;

function toPlayerItem(r: PlayerRow): PlayerListItemDTO {
  return {
    id: r.id,
    accountNo: r.account_no,
    username: r.username,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    phone: r.phone,
    country: r.country_code,
    status: r.status,
    accountCurrency: r.account_currency,
    balance: r.balance_minor !== null && r.account_currency ? money(r.balance_minor, r.account_currency) : null,
    owner: r.owner_username,
    createdAt: r.created_at.toISOString(),
    lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
  };
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export interface PlayerFilter {
  search?: string | undefined;
  status?: UserStatus | undefined;
  /** Keyset cursor: account numbers lower than this one (newest first). */
  before?: string | undefined;
  limit?: number | undefined;
  /** An admin (not the Super Admin) only sees the players he created. */
  ownerId?: string | undefined;
}

export async function listPlayers(q: Queryable, filter: PlayerFilter): Promise<Page<PlayerListItemDTO>> {
  const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
  const where: string[] = ["u.role = 'user'"];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace(/\?/g, `$${params.length}`));
  };
  const search = filter.search?.trim().toLowerCase();
  if (search) {
    const like = `${escapeLike(search)}%`;
    const clauses: string[] = [];
    params.push(like);
    clauses.push(`lower(u.username) like $${params.length}`, `lower(u.email) like $${params.length}`);
    if (/^\d{1,15}$/.test(search)) {
      params.push(search);
      clauses.push(`u.account_no = $${params.length}::bigint`);
    }
    if (/^\+\d{6,15}$/.test(search)) {
      params.push(search);
      clauses.push(`u.phone = $${params.length}`);
    }
    where.push(`(${clauses.join(' or ')})`);
  }
  if (filter.status) add('u.status = ?::user_status', filter.status);
  if (filter.before) add('u.account_no < ?::bigint', filter.before);
  if (filter.ownerId) add('u.owner_id = ?::uuid', filter.ownerId);
  params.push(limit + 1);
  const { rows } = await q.query<PlayerRow>(
    `select ${PLAYER_COLUMNS}
       from users u left join wallets w on w.user_id = u.id and w.kind = 'main'
      where ${where.join(' and ')}
      order by u.account_no desc
      limit $${params.length}`,
    params,
  );
  const items = rows.slice(0, limit).map(toPlayerItem);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? last.accountNo : null };
}

export interface PlayerDetailDTO extends PlayerListItemDTO {
  dateOfBirth: string | null;
  preferredLocale: string | null;
  displayCurrency: string | null;
  marketingOptIn: boolean;
  termsAcceptedAt: string | null;
  termsVersion: string | null;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  wallets: { id: string; kind: 'main' | 'bonus'; currency: string; balance: MoneyDTO }[];
}

/** `ownerId`: an admin (not the Super Admin) only sees the players he created. */
export async function getPlayer(q: Queryable, id: string, ownerId?: string): Promise<PlayerDetailDTO | null> {
  const { rows } = await q.query<
    PlayerRow & {
      date_of_birth: string | null;
      preferred_locale: string | null;
      display_currency: string | null;
      marketing_opt_in: boolean;
      terms_accepted_at: Date | null;
      terms_version: string | null;
      must_change_password: boolean;
      failed_login_count: number;
      locked_until: Date | null;
    }
  >(
    `select ${PLAYER_COLUMNS}, to_char(u.date_of_birth, 'YYYY-MM-DD') as date_of_birth, u.preferred_locale,
            u.display_currency, u.marketing_opt_in, u.terms_accepted_at, u.terms_version,
            u.must_change_password, u.failed_login_count, u.locked_until
       from users u left join wallets w on w.user_id = u.id and w.kind = 'main'
      where u.id = $1::uuid and u.role = 'user' and ($2::uuid is null or u.owner_id = $2::uuid)`,
    [id, ownerId ?? null],
  );
  const r = rows[0];
  if (!r) return null;
  const wallets = await q.query<{ id: string; kind: 'main' | 'bonus'; currency: string; balance_minor: string }>(
    'select id::text, kind, currency, balance_minor::text from wallets where user_id = $1::uuid order by kind, id',
    [id],
  );
  return {
    ...toPlayerItem(r),
    dateOfBirth: r.date_of_birth,
    preferredLocale: r.preferred_locale,
    displayCurrency: r.display_currency,
    marketingOptIn: r.marketing_opt_in,
    termsAcceptedAt: r.terms_accepted_at ? r.terms_accepted_at.toISOString() : null,
    termsVersion: r.terms_version,
    mustChangePassword: r.must_change_password,
    failedLoginCount: r.failed_login_count,
    lockedUntil: r.locked_until ? r.locked_until.toISOString() : null,
    wallets: wallets.rows.map((w) => ({ id: w.id, kind: w.kind, currency: w.currency, balance: money(w.balance_minor, w.currency) })),
  };
}

export interface PlayerPatch {
  status?: UserStatus | undefined;
  reason?: string | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | undefined;
  callingCode?: string | undefined;
  mobile?: string | undefined;
}

const ALLOWED_TRANSITIONS: Readonly<Record<UserStatus, readonly UserStatus[]>> = {
  active: ['suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
};

export async function updatePlayer(ctx: Ctx, id: string, patch: PlayerPatch): Promise<void> {
  if ((patch.callingCode === undefined) !== (patch.mobile === undefined)) {
    throw new AppError('validation', { fields: { mobile: 'required' } });
  }
  const phone = patch.mobile !== undefined && patch.callingCode !== undefined ? toE164(patch.callingCode, patch.mobile) : undefined;
  if (phone === null) throw new AppError('validation', { fields: { mobile: 'invalidPhone' } });

  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ first_name: string; last_name: string; email: string; phone: string | null; status: UserStatus }>(
      "select first_name, last_name, email, phone, status::text from users where id = $1::uuid and role = 'user' for update",
      [id],
    );
    const before = rows[0];
    if (!before) throw new AppError('user_not_found');

    const sets: string[] = [];
    const params: unknown[] = [id];
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const add = (column: string, key: string, from: unknown, to: unknown, cast = '') => {
      if (to === undefined || to === from) return;
      params.push(to);
      sets.push(`${column} = $${params.length}${cast}`);
      changes[key] = { from, to };
    };
    add('first_name', 'firstName', before.first_name, patch.firstName);
    add('last_name', 'lastName', before.last_name, patch.lastName);
    add('email', 'email', before.email, patch.email === undefined ? undefined : normalizeEmail(patch.email));
    add('phone', 'phone', before.phone, phone);

    if (patch.status !== undefined && patch.status !== before.status) {
      if (!ALLOWED_TRANSITIONS[before.status].includes(patch.status)) throw new AppError('conflict', { fields: { status: 'invalidChoice' } });
      if (!patch.reason || patch.reason.trim().length < 3) throw new AppError('reason_required', { fields: { reason: 'required' } });
      if (patch.status === 'closed') {
        const balance = await tx.query<{ total: string }>('select coalesce(sum(balance_minor), 0)::text as total from wallets where user_id = $1::uuid', [id]);
        if (BigInt(balance.rows[0]?.total ?? '0') > 0n) throw new AppError('conflict', { fields: { status: 'balanceNotZero' } });
        // reserved withdrawal money still belongs to the player: settle the requests first
        const pending = await tx.query("select 1 from withdrawal_requests where user_id = $1::uuid and status = 'pending' limit 1", [id]);
        if (pending.rowCount > 0) throw new AppError('conflict', { fields: { status: 'pendingWithdrawals' } });
      }
      add('status', 'status', before.status, patch.status, '::user_status');
    }
    if (sets.length === 0) return;
    await tx.query(`update users set ${sets.join(', ')} where id = $1::uuid`, params);
    if (patch.status === 'suspended' || patch.status === 'closed') await revokeUserSessions(tx, id, ctx.now);
    await audit(tx, auditActor(ctx), {
      action: changes.status ? 'user.status_changed' : 'user.updated',
      targetType: 'user',
      targetId: id,
      details: { changes, ...(patch.reason ? { reason: patch.reason.trim() } : {}) },
    });
  });
}

// ---------------------------------------------------------------------------
// Temporary passwords
// ---------------------------------------------------------------------------
const TEMP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generateTemporaryPassword(length = 16): string {
  for (;;) {
    let out = '';
    for (let i = 0; i < length; i++) out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
    if (/[a-zA-Z]/.test(out) && /\d/.test(out) && passwordProblem(out) === null) return out;
  }
}

/**
 * Sets a new random password that must be changed at the next sign-in, signs the person out
 * everywhere, and returns the password ONCE for the staff member to pass on securely.
 */
export async function resetPassword(ctx: Ctx, id: string, allowedRoles: readonly Role[]): Promise<string> {
  const temporary = generateTemporaryPassword();
  const hash = await hashPassword(temporary, ctx.config.scryptLog2N);
  await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ role: Role }>('select role::text from users where id = $1::uuid for update', [id]);
    const row = rows[0];
    if (!row || !allowedRoles.includes(row.role)) throw new AppError('user_not_found');
    await tx.query(
      `update users set password_hash = $2, must_change_password = true, password_changed_at = $3::timestamptz,
                        failed_login_count = 0, locked_until = null
        where id = $1::uuid`,
      [id, hash, ctx.now.toISOString()],
    );
    await revokeUserSessions(tx, id, ctx.now);
    await audit(tx, auditActor(ctx), { action: 'user.password_reset', targetType: 'user', targetId: id });
  });
  return temporary;
}

// ---------------------------------------------------------------------------
// Staff (Super Admin only)
// ---------------------------------------------------------------------------
export interface StaffDTO {
  id: string;
  accountNo: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  permissions: Permission[];
  status: UserStatus;
  mustChangePassword: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

interface StaffRow {
  id: string;
  account_no: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  permissions: string[];
  status: UserStatus;
  must_change_password: boolean;
  created_at: Date;
  last_login_at: Date | null;
}

const STAFF_COLUMNS = `id::text, account_no::text, username, email, first_name, last_name, role::text, permissions,
  status::text, must_change_password, created_at, last_login_at`;

function toStaff(r: StaffRow): StaffDTO {
  return {
    id: r.id,
    accountNo: r.account_no,
    username: r.username,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    permissions: r.permissions.filter(isPermission),
    status: r.status,
    mustChangePassword: r.must_change_password,
    createdAt: r.created_at.toISOString(),
    lastLoginAt: r.last_login_at ? r.last_login_at.toISOString() : null,
  };
}

export async function listStaff(q: Queryable): Promise<StaffDTO[]> {
  // dashboard staff only; shop workers are listed with their shop
  const { rows } = await q.query<StaffRow>(`select ${STAFF_COLUMNS} from users where role in ('admin', 'super_admin') and status <> 'closed' order by role desc, account_no`);
  return rows.map(toStaff);
}

/** One staff account (not a deleted one), for the Super Admin's admin page. */
export async function getStaff(q: Queryable, id: string): Promise<StaffDTO | null> {
  const { rows } = await q.query<StaffRow>(
    `select ${STAFF_COLUMNS} from users where id = $1::uuid and role in ('admin', 'super_admin') and status <> 'closed'`,
    [id],
  );
  return rows[0] ? toStaff(rows[0]) : null;
}

export interface NewAdminInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  permissions: Permission[];
}

export async function createAdmin(ctx: Ctx, input: NewAdminInput): Promise<{ staff: StaffDTO; temporaryPassword: string }> {
  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword, ctx.config.scryptLog2N);
  const permissions = [...new Set(input.permissions)];
  const staff = await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<StaffRow>(
      `insert into users (username, email, password_hash, first_name, last_name, role, permissions, must_change_password, created_by)
       values ($1, $2, $3, $4, $5, 'admin', $6::text[], true, $7::uuid)
       returning ${STAFF_COLUMNS}`,
      [input.username, normalizeEmail(input.email), hash, input.firstName, input.lastName, permissions, ctx.principal().id],
    );
    const row = rows[0] as StaffRow;
    await audit(tx, auditActor(ctx), { action: 'staff.created', targetType: 'user', targetId: row.id, details: { permissions } });
    return toStaff(row);
  });
  return { staff, temporaryPassword };
}

export interface AdminPatch {
  permissions?: Permission[] | undefined;
  status?: 'active' | 'suspended' | undefined;
  firstName?: string | undefined;
  lastName?: string | undefined;
  email?: string | undefined;
}

export async function updateAdmin(ctx: Ctx, id: string, patch: AdminPatch): Promise<StaffDTO> {
  return ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<StaffRow>(`select ${STAFF_COLUMNS} from users where id = $1::uuid and role in ('admin', 'super_admin') for update`, [id]);
    const before = rows[0];
    if (!before) throw new AppError('user_not_found');
    // Super Admin accounts are never edited through the application.
    if (before.role !== 'admin') throw new AppError('forbidden');
    // a deleted (closed) admin stays closed
    if (before.status === 'closed') throw new AppError('user_not_found');

    const sets: string[] = [];
    const params: unknown[] = [id];
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const add = (column: string, key: string, from: unknown, to: unknown, cast = '') => {
      if (to === undefined) return;
      if (JSON.stringify(to) === JSON.stringify(from)) return;
      params.push(to);
      sets.push(`${column} = $${params.length}${cast}`);
      changes[key] = { from, to };
    };
    add('first_name', 'firstName', before.first_name, patch.firstName);
    add('last_name', 'lastName', before.last_name, patch.lastName);
    add('email', 'email', before.email, patch.email === undefined ? undefined : normalizeEmail(patch.email));
    add('status', 'status', before.status, patch.status, '::user_status');
    if (patch.permissions) {
      const next = [...new Set(patch.permissions)].sort();
      add('permissions', 'permissions', [...before.permissions].sort(), next, '::text[]');
    }
    if (sets.length === 0) return toStaff(before);
    const updated = await tx.query<StaffRow>(`update users set ${sets.join(', ')} where id = $1::uuid returning ${STAFF_COLUMNS}`, params);
    // a change of permissions or status takes effect immediately: sign the admin out everywhere
    if (changes.permissions || changes.status) await revokeUserSessions(tx, id, ctx.now);
    await audit(tx, auditActor(ctx), { action: 'staff.updated', targetType: 'user', targetId: id, details: { changes } });
    return toStaff(updated.rows[0] as StaffRow);
  });
}

// ---------------------------------------------------------------------------
// Players created by staff (shop or counter sign-up)
// ---------------------------------------------------------------------------
export interface StaffPlayerInput {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string | undefined;
  country: string;
  currency: string;
  callingCode?: string | undefined;
  mobile?: string | undefined;
  /** The staff member confirms the player is an adult and accepted the terms. */
  confirmed: boolean;
}

/**
 * Creates a player account. An admin becomes the owner of the player (his game rules then apply to him).
 * The player gets a one-time temporary password and must change it at the first sign-in.
 */
export async function createPlayerByStaff(ctx: Ctx, input: StaffPlayerInput): Promise<{ id: string; accountNo: string; username: string; temporaryPassword: string }> {
  const actor = ctx.principal();
  if (!input.confirmed) throw new AppError('terms_required', { fields: { confirmed: 'mustAcceptTerms' } });
  // Date of birth and phone are optional; when given they are still checked.
  if (input.dateOfBirth && ageOn(input.dateOfBirth, todayUtc(ctx.now)) < MIN_AGE) throw new AppError('under_age', { fields: { dateOfBirth: 'mustBeAdult' } });
  const mobile = input.mobile?.trim() ?? '';
  const phone = mobile ? toE164(input.callingCode ?? '', mobile) : null;
  if (mobile && !phone) throw new AppError('validation', { fields: { mobile: 'invalidPhone' } });
  const country = await ctx.db.query('select 1 from countries where code = $1 and is_enabled', [input.country]);
  if (country.rowCount === 0) throw new AppError('country_unavailable', { fields: { country: 'invalidChoice' } });
  const currency = await ctx.db.query('select 1 from currencies where code = $1 and is_enabled', [input.currency]);
  if (currency.rowCount === 0) throw new AppError('currency_unavailable', { fields: { currency: 'invalidChoice' } });

  const temporaryPassword = generateTemporaryPassword();
  const hash = await hashPassword(temporaryPassword, ctx.config.scryptLog2N);
  const owner = actor.role === 'admin' ? actor.id : null;
  const row = await ctx.db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: string; account_no: string }>(
      `insert into users (username, email, phone, password_hash, first_name, last_name, date_of_birth, country_code, account_currency,
                          must_change_password, terms_accepted_at, terms_version, created_by, owner_id)
       values ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, true, $10::timestamptz, $11, $12::uuid, $13::uuid)
       returning id::text, account_no::text`,
      [input.username, normalizeEmail(input.email), phone, hash, input.firstName, input.lastName, input.dateOfBirth ?? null, input.country, input.currency, ctx.now.toISOString(), TERMS_VERSION, actor.id, owner],
    );
    const r = rows[0] as { id: string; account_no: string };
    await audit(tx, auditActor(ctx), { action: 'player.created_by_staff', targetType: 'user', targetId: r.id, details: { currency: input.currency, owner } });
    return r;
  });
  return { id: row.id, accountNo: row.account_no, username: input.username, temporaryPassword };
}
