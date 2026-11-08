import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';
import type { Db } from '@aurum/db';
import type { Permission, Role, Schema, ShopRole, UserStatus } from '@aurum/shared';
import type { Config } from '../config.ts';
import type { Logger } from '../log.ts';
import type { Captcha } from '../services/captcha.ts';
import type { RateLimiter } from './ratelimit.ts';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** The signed-in person behind a request. */
export interface SessionUser {
  sessionId: string;
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
  /** Shop workers (role 'cashier') only: their shop and their role in it. */
  shopId: string | null;
  shopRole: ShopRole | null;
}

export type Access =
  | { kind: 'public'; optionalAuth?: boolean }
  | { kind: 'user' } // any signed-in account
  | { kind: 'player' } // role "user"
  | { kind: 'staff'; anyOf?: readonly Permission[] } // admin or super admin, optionally with one of the permissions
  | { kind: 'super' } // Super Admin only
  | { kind: 'cashier'; managerOnly?: boolean }; // shop worker (role "cashier"), optionally the shop manager only

export const access = {
  public: { kind: 'public' } as Access,
  publicOptionalAuth: { kind: 'public', optionalAuth: true } as Access,
  user: { kind: 'user' } as Access,
  player: { kind: 'player' } as Access,
  anyStaff: { kind: 'staff' } as Access,
  staff: (...anyOf: Permission[]): Access => ({ kind: 'staff', anyOf }),
  super: { kind: 'super' } as Access,
  cashier: { kind: 'cashier' } as Access,
  shopManager: { kind: 'cashier', managerOnly: true } as Access,
} as const;

export interface JsonReply {
  type: 'json';
  status: number;
  body: unknown;
  headers?: Record<string, string>;
  cookies?: string[];
}

export interface RawReply {
  type: 'raw';
  status: number;
  headers: Record<string, string>;
  body: Buffer | Readable;
}

export type Reply = JsonReply | RawReply;

export interface AppServices {
  captcha: Captcha;
  limiter: RateLimiter;
  logger: Logger;
}

export interface Ctx {
  method: Method;
  path: string;
  query: URLSearchParams;
  params: Readonly<Record<string, string>>;
  headers: IncomingHttpHeaders;
  ip: string;
  userAgent: string;
  requestId: string;
  now: Date;
  config: Config;
  db: Db;
  services: AppServices;
  /** The signed-in user, or null for anonymous requests. */
  user: SessionUser | null;
  /** The raw session token from the cookie (only set when it was valid). */
  sessionToken: string | null;
  /** Returns the signed-in user. Routes with a non-public access rule can rely on it. */
  principal(): SessionUser;
  /** Reads and validates a JSON body (max 256 KB, content-type application/json). */
  json<T>(schema: Schema<T>): Promise<T>;
  /** Reads a JSON body and keeps the exact bytes (for signature checks of server-to-server callbacks). */
  rawJson(): Promise<{ raw: string; value: unknown }>;
  /** Reads a binary body (content-type application/octet-stream) up to `limit` bytes. */
  rawBody(limit: number): Promise<Buffer>;
  /** Reads a multipart/form-data body (max ~6.5 MB). */
  formData(): Promise<FormData>;
}

export interface Route {
  method: Method;
  path: string;
  access: Access;
  /** Extra per-IP limit on top of the global one. */
  limit?: { name: string; max: number; windowMs: number };
  handler: (ctx: Ctx) => Promise<Reply>;
}

export function ok(data: unknown, init: { status?: number; headers?: Record<string, string>; cookies?: string[] } = {}): JsonReply {
  return { type: 'json', status: init.status ?? 200, body: { data }, ...(init.headers ? { headers: init.headers } : {}), ...(init.cookies ? { cookies: init.cookies } : {}) };
}

export function created(data: unknown): JsonReply {
  return ok(data, { status: 201 });
}

export function noContent(cookies?: string[]): JsonReply {
  return { type: 'json', status: 204, body: undefined, ...(cookies ? { cookies } : {}) };
}

/** Public data that browsers and CDNs may cache briefly. */
export function cacheable(data: unknown, maxAgeSeconds: number): JsonReply {
  return ok(data, { headers: { 'cache-control': `public, max-age=${maxAgeSeconds}` } });
}
