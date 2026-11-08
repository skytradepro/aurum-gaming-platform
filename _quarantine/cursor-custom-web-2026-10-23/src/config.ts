/** Website configuration, read once from environment variables (see .env.example). */
import { randomBytes } from 'node:crypto';

export interface WebConfig {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  /** The public origin of the website, e.g. https://www.example.com (first entry of WEB_ORIGIN). */
  publicOrigin: string;
  /** Where this server reaches the API (never exposed to browsers). */
  apiUrl: string;
  cookieSecure: boolean;
  /** Must match the API's cookie name (both derive it from COOKIE_SECURE). */
  sessionCookie: string;
  /** Number of reverse proxies in front of the website (0 = none). */
  trustProxyHops: number;
  /** Secret for CSRF tokens. Required in production. */
  secret: string;
  /** IANA time zone used to display dates (statements, dashboards, receipts). */
  timeZone: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
}

type Env = Record<string, string | undefined>;

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value.toLowerCase())) return true;
  if (['0', 'false', 'no', 'off'].includes(value.toLowerCase())) return false;
  throw new Error(`Invalid boolean value "${value}"`);
}

function int(value: string | undefined, fallback: number, name: string, min: number, max: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${name} must be an integer between ${min} and ${max}`);
  return n;
}

export function loadWebConfig(env: Env = process.env): WebConfig {
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const production = nodeEnv === 'production';

  const origins = (env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const publicOrigin = origins[0] ?? 'http://localhost:3000';
  let parsed: URL;
  try {
    parsed = new URL(publicOrigin);
  } catch {
    throw new Error(`WEB_ORIGIN contains an invalid URL: ${publicOrigin}`);
  }
  if (parsed.origin !== publicOrigin) throw new Error(`WEB_ORIGIN must be an origin without a path: ${publicOrigin}`);
  if (production && parsed.protocol !== 'https:') throw new Error('WEB_ORIGIN must use https in production');

  const cookieSecure = bool(env.COOKIE_SECURE, production);
  if (production && !cookieSecure) throw new Error('COOKIE_SECURE must be true in production');

  let secret = env.WEB_SECRET ?? '';
  if (!secret) {
    if (production) throw new Error('WEB_SECRET is required in production (at least 32 random characters)');
    secret = randomBytes(32).toString('hex'); // development: forms expire when the server restarts
  }
  if (secret.length < 32) throw new Error('WEB_SECRET must be at least 32 characters long');

  const apiUrl = (env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000').replace(/\/$/, '');
  try {
    new URL(apiUrl);
  } catch {
    throw new Error(`API_INTERNAL_URL is not a valid URL: ${apiUrl}`);
  }

  const timeZone = env.DISPLAY_TIMEZONE || 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(0);
  } catch {
    throw new Error(`DISPLAY_TIMEZONE is not a valid IANA time zone: ${timeZone}`);
  }

  const logLevel = (env.LOG_LEVEL ?? (nodeEnv === 'test' ? 'silent' : 'info')) as WebConfig['logLevel'];
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) throw new Error(`Invalid LOG_LEVEL "${logLevel}"`);

  return {
    env: nodeEnv,
    host: env.WEB_HOST ?? '127.0.0.1',
    port: int(env.WEB_PORT, 3000, 'WEB_PORT', 0, 65535),
    publicOrigin,
    apiUrl,
    cookieSecure,
    sessionCookie: cookieSecure ? '__Host-aurum_session' : 'aurum_session',
    trustProxyHops: int(env.WEB_TRUST_PROXY_HOPS, 0, 'WEB_TRUST_PROXY_HOPS', 0, 5),
    secret,
    timeZone,
    logLevel,
  };
}
