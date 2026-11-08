import { createHash, randomBytes } from 'node:crypto';
import type { Queryable } from '@aurum/db';
import { isPermission } from '@aurum/shared';
import type { Role, ShopRole, UserStatus } from '@aurum/shared';
import type { Config } from '../config.ts';
import type { SessionUser } from '../http/types.ts';

/** The browser holds a random token; the database keeps only its SHA-256 hash. */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

export interface NewSession {
  token: string;
  expiresAt: Date;
  maxAgeSeconds: number;
}

export async function createSession(
  q: Queryable,
  args: { userId: string; role: Role; ip: string; userAgent: string; now: Date; config: Config },
): Promise<NewSession> {
  const token = newToken();
  const staff = args.role !== 'user';
  const ttl = staff ? args.config.sessions.staffMs : args.config.sessions.userMs;
  const expiresAt = new Date(args.now.getTime() + ttl);
  await q.query(
    `insert into sessions (token_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent)
     values ($1::bytea, $2::uuid, $3::timestamptz, $3::timestamptz, $4::timestamptz, $5::inet, $6)`,
    [hashToken(token), args.userId, args.now.toISOString(), expiresAt.toISOString(), normalizeIp(args.ip), args.userAgent.slice(0, 400) || null],
  );
  return { token, expiresAt, maxAgeSeconds: Math.floor(ttl / 1000) };
}

/** Returns an address PostgreSQL's inet type accepts, or null. */
export function normalizeIp(ip: string): string | null {
  const stripped = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  return /^[0-9a-fA-F:.]+$/.test(stripped) && stripped.length <= 45 ? stripped : null;
}

interface SessionRow {
  session_id: string;
  last_seen_at: Date;
  id: string;
  account_no: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  permissions: string[];
  status: UserStatus;
  account_currency: string | null;
  preferred_locale: string | null;
  display_currency: string | null;
  must_change_password: boolean;
  shop_id: string | null;
  shop_role: ShopRole | null;
}

/** Resolves a session cookie to the signed-in user, or null (unknown, revoked, expired, idle, disabled). */
export async function loadSession(q: Queryable, token: string, now: Date, config: Config): Promise<SessionUser | null> {
  if (!isWellFormedToken(token)) return null;
  const { rows } = await q.query<SessionRow>(
    `select s.id::text as session_id, s.last_seen_at,
            u.id::text, u.account_no::text, u.username, u.email, u.first_name, u.last_name,
            u.role::text, u.permissions, u.status::text, u.account_currency, u.preferred_locale,
            u.display_currency, u.must_change_password, u.shop_id::text, u.shop_role
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1::bytea and s.revoked_at is null and s.expires_at > $2::timestamptz`,
    [hashToken(token), now.toISOString()],
  );
  const row = rows[0];
  if (!row || row.status !== 'active') return null;
  const staff = row.role !== 'user';
  const idleMs = staff ? config.sessions.staffIdleMs : config.sessions.userIdleMs;
  if (now.getTime() - row.last_seen_at.getTime() > idleMs) {
    await q.query('update sessions set revoked_at = $2::timestamptz where id = $1::bigint', [row.session_id, now.toISOString()]);
    return null;
  }
  // refresh "last seen" at most once a minute
  if (now.getTime() - row.last_seen_at.getTime() > 60_000) {
    await q.query('update sessions set last_seen_at = $2::timestamptz where id = $1::bigint', [row.session_id, now.toISOString()]);
  }
  return {
    sessionId: row.session_id,
    id: row.id,
    accountNo: row.account_no,
    username: row.username,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role,
    permissions: row.permissions.filter(isPermission),
    status: row.status,
    accountCurrency: row.account_currency,
    preferredLocale: row.preferred_locale,
    displayCurrency: row.display_currency,
    mustChangePassword: row.must_change_password,
    shopId: row.shop_id,
    shopRole: row.shop_role,
  };
}

export async function revokeSession(q: Queryable, sessionId: string, now: Date): Promise<void> {
  await q.query('update sessions set revoked_at = $2::timestamptz where id = $1::bigint and revoked_at is null', [sessionId, now.toISOString()]);
}

/** Signs a user out everywhere (optionally keeping the current session). */
export async function revokeUserSessions(q: Queryable, userId: string, now: Date, exceptSessionId?: string): Promise<void> {
  await q.query(
    `update sessions set revoked_at = $2::timestamptz
      where user_id = $1::uuid and revoked_at is null and ($3::bigint is null or id <> $3::bigint)`,
    [userId, now.toISOString(), exceptSessionId ?? null],
  );
}
