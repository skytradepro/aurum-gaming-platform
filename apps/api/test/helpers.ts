import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTestDatabase } from '@aurum/db/testing';
import type { Db } from '@aurum/db';
import type { TestDatabase } from '@aurum/db/testing';
import type { Permission } from '@aurum/shared';
import { createApp } from '../src/app.ts';
import type { App } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import type { Config } from '../src/config.ts';
import { RateLimiter } from '../src/http/ratelimit.ts';
import type { RateLimitResult } from '../src/http/ratelimit.ts';
import { allRoutes } from '../src/routes/index.ts';
import { hashPassword } from '../src/security/password.ts';
import { createSuperAdmin } from '../src/services/bootstrap.ts';

export const ORIGIN = 'http://localhost:3000';
export const STRONG_PASSWORD = 'Blue-Falcon-77x';

export interface ApiResponse {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Headers;
  setCookie: string[];
}

export interface RequestOptions {
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  /** Send the browser headers (Origin and x-aurum-client). Default true. */
  browserHeaders?: boolean;
}

/** A minimal browser: keeps cookies between requests and sends the headers the website sends. */
export class Browser {
  readonly cookies = new Map<string, string>();
  readonly baseUrl: string;
  readonly cookieName: string;

  constructor(baseUrl: string, cookieName: string) {
    this.baseUrl = baseUrl;
    this.cookieName = cookieName;
  }

  get sessionCookie(): string | undefined {
    return this.cookies.get(this.cookieName);
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> {
    const headers: Record<string, string> = { ...options.headers };
    if (options.browserHeaders !== false) {
      headers.origin ??= ORIGIN;
      headers['x-aurum-client'] ??= 'web';
    }
    if (this.cookies.size > 0) headers.cookie = [...this.cookies].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('; ');
    let body: RequestInit['body'] | undefined;
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form) {
      body = options.form;
    }
    const response = await fetch(`${this.baseUrl}${path}`, { method, headers, ...(body !== undefined ? { body } : {}) });
    const setCookie = response.headers.getSetCookie();
    for (const line of setCookie) {
      const [pair = '', ...attributes] = line.split(';').map((s) => s.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const value = decodeURIComponent(pair.slice(eq + 1));
      const maxAge = attributes.find((a) => a.toLowerCase().startsWith('max-age='));
      if (value === '' || (maxAge && Number(maxAge.slice(8)) <= 0)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    const text = await response.text();
    let parsed: unknown = undefined;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    return { status: response.status, body: parsed, headers: response.headers, setCookie };
  }

  get = (path: string, options?: RequestOptions) => this.request('GET', path, options);
  post = (path: string, json?: unknown, options: RequestOptions = {}) => this.request('POST', path, { ...options, ...(json !== undefined ? { json } : {}) });
  put = (path: string, json?: unknown, options: RequestOptions = {}) => this.request('PUT', path, { ...options, ...(json !== undefined ? { json } : {}) });
  patch = (path: string, json?: unknown, options: RequestOptions = {}) => this.request('PATCH', path, { ...options, ...(json !== undefined ? { json } : {}) });
  delete = (path: string, options?: RequestOptions) => this.request('DELETE', path, options);
}

/** Lets every request through, so tests that register many players are not slowed down by the per-IP limits. */
class OpenLimiter extends RateLimiter {
  override hit(): RateLimitResult {
    return { allowed: true, remaining: 1_000_000, retryAfterSeconds: 0 };
  }
}

export interface TestServer {
  db: Db;
  app: App;
  config: Config;
  baseUrl: string;
  limiter: RateLimiter;
  uploadDir: string;
  browser(): Browser;
  stop(): Promise<void>;
}

export interface StartOptions {
  env?: Record<string, string>;
  config?: Partial<Config>;
  database?: TestDatabase;
  /** 'real' uses the production rate limiter (for the tests of the limits themselves). Default 'off'. */
  rateLimits?: 'off' | 'real';
}

export async function startServer(options: StartOptions = {}): Promise<TestServer> {
  const database = options.database ?? (await createTestDatabase());
  const uploadDir = mkdtempSync(join(tmpdir(), 'aurum-uploads-'));
  const base = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: database.url,
    WEB_ORIGIN: ORIGIN,
    UPLOAD_DIR: uploadDir,
    SHOW_DEMO_DATA: 'false',
    ...options.env,
  });
  const config: Config = { ...base, port: 0, ...options.config };
  const limiter = options.rateLimits === 'real' ? new RateLimiter() : new OpenLimiter();
  const app = createApp({ config, db: database.db, routes: allRoutes, limiter });
  const address = await app.listen();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    db: database.db,
    app,
    config,
    baseUrl,
    limiter,
    uploadDir,
    browser: () => new Browser(baseUrl, config.cookieName),
    async stop() {
      await app.close();
      rmSync(uploadDir, { recursive: true, force: true });
      if (!options.database) await database.drop();
    },
  };
}

let counter = 0;
export const unique = (): string => `${Date.now().toString(36)}${(counter++).toString(36)}${randomBytes(2).toString('hex')}`;

export interface Account {
  id: string;
  username: string;
  email: string;
  password: string;
}

export async function createStaff(
  server: TestServer,
  options: { permissions?: Permission[]; password?: string; mustChangePassword?: boolean; status?: 'active' | 'suspended' } = {},
): Promise<Account> {
  const u = unique();
  const password = options.password ?? STRONG_PASSWORD;
  const username = `staff_${u}`;
  const email = `${username}@example.test`;
  const { rows } = await server.db.query<{ id: string }>(
    `insert into users (username, email, password_hash, first_name, last_name, role, permissions, must_change_password, status)
     values ($1, $2, $3, 'Staff', 'Member', 'admin', $4::text[], $5, $6::user_status) returning id::text`,
    [username, email, await hashPassword(password, server.config.scryptLog2N), options.permissions ?? [], options.mustChangePassword ?? false, options.status ?? 'active'],
  );
  return { id: (rows[0] as { id: string }).id, username, email, password };
}

export async function createSuperAdminAccount(server: TestServer, password = STRONG_PASSWORD): Promise<Account> {
  const u = unique();
  const username = `boss_${u}`;
  const email = `${username}@example.test`;
  const created = await createSuperAdmin(server.db, { username, email, firstName: 'Super', lastName: 'Admin', password }, server.config.scryptLog2N);
  return { id: created.id, username, email, password };
}

export function registrationPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const u = unique();
  const phone = String(20_000_000 + Math.floor(Math.random() * 70_000_000));
  return {
    username: `player_${u}`,
    email: `player_${u}@example.test`,
    callingCode: '216',
    mobile: phone,
    password: STRONG_PASSWORD,
    firstName: 'Amina',
    lastName: 'Ben Salah',
    dateOfBirth: '1990-05-17',
    country: 'TN',
    currency: 'TND',
    acceptTerms: true,
    marketingOptIn: false,
    ...overrides,
  };
}

export async function login(browser: Browser, account: { username: string; password: string }): Promise<ApiResponse> {
  return browser.post('/v1/auth/login', { identifier: account.username, password: account.password });
}

/** A signed-in browser for an existing account. */
export async function signedIn(server: TestServer, account: { username: string; password: string }): Promise<Browser> {
  const browser = server.browser();
  const response = await login(browser, account);
  if (response.status !== 200) throw new Error(`login failed for ${account.username}: ${response.status} ${JSON.stringify(response.body)}`);
  return browser;
}

/** Registers a player through the API; the returned browser is signed in as that player. */
export async function registerPlayer(server: TestServer, overrides: Record<string, unknown> = {}): Promise<{ browser: Browser; account: Account; id: string; walletId: string }> {
  const payload = registrationPayload(overrides);
  const browser = server.browser();
  const response = await browser.post('/v1/auth/register', payload);
  if (response.status !== 201) throw new Error(`registration failed: ${response.status} ${JSON.stringify(response.body)}`);
  const me = response.body.data.user as { id: string; wallet: { id: string } };
  return {
    browser,
    account: { id: me.id, username: payload.username as string, email: payload.email as string, password: payload.password as string },
    id: me.id,
    walletId: me.wallet.id,
  };
}

// a 1x1 transparent PNG and a few invalid payloads for upload tests
export function tinyPng(width = 1, height = 1): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    return Buffer.concat([length, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]); // CRC is not checked by our inspector
  };
  // random bytes in IDAT so that each call can produce a different file
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', randomBytes(16)), chunk('IEND', Buffer.alloc(0))]);
}

export function uploadForm(bytes: Buffer | Uint8Array, name = 'banner.png', type = 'image/png'): FormData {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], name, { type }));
  return form;
}
