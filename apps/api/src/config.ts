/** Runtime configuration, read once from environment variables (see .env.example). */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repository root (apps/api/src -> three levels up). Relative paths in .env resolve from here, not from the cwd. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export type ApilxProviderId = 'pragmatic' | 'amatic' | 'pgsoft' | 'amusnet';

export interface ApilxProviderConfig {
  id: ApilxProviderId;
  apiUrl: string;
  apiToken: string;
  secretKey: string;
}

export interface ApilxConfig {
  agentId: string;
  providers: ApilxProviderConfig[];
  /** All provider secret keys (sign validation tries each). */
  callbackSecrets: string[];
}

export interface AggregatorConfig {
  /** Short name of the aggregator, used in ledger scopes (e.g. "softswiss"). */
  name: string;
  /** Base URL of the aggregator API (launch URLs, game list). */
  apiUrl: string;
  operatorId: string;
  /** Shared secret for HMAC-SHA256 signatures, both directions. */
  secret: string;
  /** Header that carries the signature. */
  signatureHeader: string;
  /** Session lifetime in minutes. */
  sessionMinutes: number;
}

export interface Config {
  env: 'development' | 'production' | 'test';
  host: string;
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  /** Origins allowed to send state-changing requests (the website). */
  webOrigins: string[];
  cookieSecure: boolean;
  cookieName: string;
  uploadDir: string;
  showDemoData: boolean;
  /** In-house games (Aurum Wheel). Off unless INHOUSE_GAMES=true; needs GAME_SECRET. */
  inhouseGames: boolean;
  gameSecret: string;
  /** API-Football key (api-sports.io). Empty = the football sections stay on "not available yet". */
  footballApiKey: string;
  /** How long live results are cached, in seconds. Protects the provider's daily request limit (use 900 on the free plan). */
  footballLiveCacheSeconds: number;
  /** Percent taken off the provider's odds (the operator's margin). 0 = the provider's odds as they are. */
  footballOddsMarginPercent: number;
  /** Preferred bookmaker of the odds feed (API-Football bookmaker id); 0 = the first one that offers the market. */
  footballBookmakerId: number;
  /** Pages of the daily odds list read from API-Football (the Free plan allows at most 3). */
  footballOddsMaxPages: number;
  /** API-Football address (tests point it to a local copy of the provider). */
  footballApiBase: string;
  /** How long live (in-play) odds are cached, in seconds. Lower = fresher prices, more provider requests. */
  footballLiveOddsSeconds: number;
  /** How long the timeline and statistics of a live match are cached, in seconds. */
  footballDetailLiveSeconds: number;
  /** Game aggregator (seamless wallet). null = not configured: provider games cannot be launched. */
  aggregator: AggregatorConfig | null;
  /** API LX multi-provider staging/production. null = callbacks and userAuth off. */
  apilx: ApilxConfig | null;
  /** AI assistant through OpenRouter. null = no key: the assistant answers "not available". */
  ai: { apiKey: string; model: string } | null;
  /** Bank account shown to players for deposits by bank transfer. null = the bank option is hidden (all five values are needed). */
  /** Brevo transactional e-mail. null = no e-mails are sent (codes are still shown in the player's account). */
  mail: { brevoApiKey: string; fromEmail: string; fromName: string } | null;
  bankTransfer: { accountName: string; iban: string; bankName: string; bankAddress: string; bic: string } | null;
  /** Number of reverse proxies in front of the API (0 = none: ignore X-Forwarded-For). */
  trustProxyHops: number;
  sessions: { userMs: number; staffMs: number; userIdleMs: number; staffIdleMs: number };
  /** scrypt cost exponent: N = 2^scryptLog2N (15 in production, lower only in tests). */
  scryptLog2N: number;
  /** Optional CAPTCHA (Cloudflare Turnstile). Disabled unless both values are set. */
  turnstile: { secret: string; siteKey: string } | null;
  logLevel: LogLevel;
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

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function loadApilxProvider(env: Env, id: ApilxProviderId, urlKey: string, tokenKey: string, secretKey: string): ApilxProviderConfig | null {
  const apiUrl = (env[urlKey] ?? '').trim().replace(/\/$/, '');
  const apiToken = (env[tokenKey] ?? '').trim();
  const secretKeyVal = (env[secretKey] ?? '').trim();
  if (!apiUrl && !apiToken && !secretKeyVal) return null;
  if (!apiUrl || !apiToken || secretKeyVal.length < 16) {
    throw new Error(`API LX ${id}: set ${urlKey}, ${tokenKey}, and ${secretKey} (secret 16+ chars) together or leave all empty`);
  }
  try {
    new URL(apiUrl);
  } catch {
    throw new Error(`${urlKey} must be a valid URL`);
  }
  return { id, apiUrl, apiToken, secretKey: secretKeyVal };
}

function loadApilx(env: Env): ApilxConfig | null {
  const agentId = (env.APILX_AGENT_ID ?? '').trim();
  const providers = [
    loadApilxProvider(env, 'pragmatic', 'APILX_PRAGMATIC_API_URL', 'APILX_PRAGMATIC_TOKEN', 'APILX_PRAGMATIC_SECRET'),
    loadApilxProvider(env, 'amatic', 'APILX_AMATIC_API_URL', 'APILX_AMATIC_TOKEN', 'APILX_AMATIC_SECRET'),
    loadApilxProvider(env, 'pgsoft', 'APILX_PGSOFT_API_URL', 'APILX_PGSOFT_TOKEN', 'APILX_PGSOFT_SECRET'),
    loadApilxProvider(env, 'amusnet', 'APILX_AMUSNET_API_URL', 'APILX_AMUSNET_TOKEN', 'APILX_AMUSNET_SECRET'),
  ].filter((p): p is ApilxProviderConfig => p !== null);
  if (!agentId && providers.length === 0) return null;
  if (!agentId) throw new Error('APILX_AGENT_ID is required when any APILX_*_API_URL is set');
  const secrets = [...new Set(providers.map((p) => p.secretKey))];
  return { agentId, providers, callbackSecrets: secrets };
}

function loadAggregator(env: Env): AggregatorConfig | null {
  const name = (env.AGGREGATOR_NAME ?? '').trim().toLowerCase();
  const apiUrl = (env.AGGREGATOR_API_URL ?? '').trim().replace(/\/$/, '');
  const operatorId = (env.AGGREGATOR_OPERATOR_ID ?? '').trim();
  const secret = env.AGGREGATOR_SECRET ?? '';
  if (!name && !apiUrl && !operatorId && !secret) return null;
  if (!/^[a-z0-9-]{2,40}$/.test(name)) throw new Error('AGGREGATOR_NAME must be 2-40 characters a-z 0-9 -');
  try {
    new URL(apiUrl);
  } catch {
    throw new Error('AGGREGATOR_API_URL must be a valid URL');
  }
  if (!operatorId) throw new Error('AGGREGATOR_OPERATOR_ID is required');
  if (secret.length < 16) throw new Error('AGGREGATOR_SECRET (at least 16 characters) is required');
  return {
    name,
    apiUrl,
    operatorId,
    secret,
    signatureHeader: (env.AGGREGATOR_SIGNATURE_HEADER ?? 'x-signature').trim().toLowerCase(),
    sessionMinutes: int(env.AGGREGATOR_SESSION_MINUTES, 240, 'AGGREGATOR_SESSION_MINUTES', 5, 1440),
  };
}

/** All five BANK_TRANSFER_* values must be set, and the IBAN must pass its check digits, or the bank option stays hidden. */
function loadBankTransfer(env: Env): Config['bankTransfer'] {
  const accountName = (env.BANK_TRANSFER_ACCOUNT_NAME ?? '').trim();
  const iban = (env.BANK_TRANSFER_IBAN ?? '').replace(/\s+/g, '').toUpperCase();
  const bankName = (env.BANK_TRANSFER_BANK_NAME ?? '').trim();
  const bankAddress = (env.BANK_TRANSFER_BANK_ADDRESS ?? '').trim();
  const bic = (env.BANK_TRANSFER_BIC ?? '').replace(/\s+/g, '').toUpperCase();
  if (!accountName && !iban && !bankName && !bankAddress && !bic) return null;
  if (!accountName || !iban || !bankName || !bankAddress || !bic) throw new Error('BANK_TRANSFER_*: set all five values or none');
  if (!ibanValid(iban)) throw new Error('BANK_TRANSFER_IBAN: the IBAN check digits are wrong');
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) throw new Error('BANK_TRANSFER_BIC: not a valid BIC');
  return { accountName, iban, bankName, bankAddress, bic };
}

/** ISO 13616 check: move the first 4 characters to the end, letters become 10..35, the number mod 97 must be 1. */
export function ibanValid(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

export function loadConfig(env: Env = process.env): Config {
  const nodeEnv = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const production = nodeEnv === 'production';

  const databaseUrl = env.DATABASE_URL ?? '';
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const webOrigins = (env.WEB_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  for (const origin of webOrigins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`WEB_ORIGIN contains an invalid URL: ${origin}`);
    }
    if (url.origin !== origin) throw new Error(`WEB_ORIGIN must be an origin without a path: ${origin}`);
    if (production && url.protocol !== 'https:') throw new Error(`WEB_ORIGIN must use https in production: ${origin}`);
  }

  const cookieSecure = bool(env.COOKIE_SECURE, production);
  if (production && !cookieSecure) throw new Error('COOKIE_SECURE must be true in production');

  const showDemoData = bool(env.SHOW_DEMO_DATA, false);
  if (production && showDemoData) {
    throw new Error('SHOW_DEMO_DATA must be false in production: demo data would be shown to real players');
  }

  const inhouseGames = bool(env.INHOUSE_GAMES, false);
  const gameSecret = env.GAME_SECRET ?? '';
  if (inhouseGames && gameSecret.length < 32) throw new Error('GAME_SECRET (at least 32 characters) is required when INHOUSE_GAMES=true');

  const secret = env.TURNSTILE_SECRET ?? '';
  const siteKey = env.TURNSTILE_SITE_KEY ?? '';
  if (Boolean(secret) !== Boolean(siteKey)) {
    throw new Error('TURNSTILE_SECRET and TURNSTILE_SITE_KEY must be set together (or both left empty)');
  }

  const logLevel = (env.LOG_LEVEL ?? (nodeEnv === 'test' ? 'silent' : 'info')) as LogLevel;
  if (!['debug', 'info', 'warn', 'error', 'silent'].includes(logLevel)) throw new Error(`Invalid LOG_LEVEL "${logLevel}"`);

  return {
    env: nodeEnv,
    host: env.API_HOST ?? '127.0.0.1',
    port: int(env.API_PORT, 4000, 'API_PORT', 1, 65535),
    databaseUrl,
    databaseSsl: bool(env.DATABASE_SSL, false),
    webOrigins,
    cookieSecure,
    cookieName: cookieSecure ? '__Host-aurum_session' : 'aurum_session',
    uploadDir: resolve(REPO_ROOT, env.UPLOAD_DIR ?? './storage/uploads'),
    showDemoData,
    inhouseGames,
    gameSecret,
    footballApiKey: (env.FOOTBALL_API_KEY ?? '').trim(),
    footballLiveCacheSeconds: int(env.FOOTBALL_LIVE_CACHE_SECONDS, 20, 'FOOTBALL_LIVE_CACHE_SECONDS', 10, 3600),
    footballOddsMarginPercent: int(env.FOOTBALL_ODDS_MARGIN_PERCENT, 0, 'FOOTBALL_ODDS_MARGIN_PERCENT', 0, 30),
    footballBookmakerId: int(env.FOOTBALL_BOOKMAKER_ID, 0, 'FOOTBALL_BOOKMAKER_ID', 0, 100000),
    footballOddsMaxPages: int(env.FOOTBALL_ODDS_MAX_PAGES, 30, 'FOOTBALL_ODDS_MAX_PAGES', 1, 50),
    footballApiBase: (env.FOOTBALL_API_BASE ?? 'https://v3.football.api-sports.io').trim().replace(/\/+$/, ''),
    footballLiveOddsSeconds: int(env.FOOTBALL_LIVE_ODDS_SECONDS, 10, 'FOOTBALL_LIVE_ODDS_SECONDS', 3, 300),
    footballDetailLiveSeconds: int(env.FOOTBALL_DETAIL_LIVE_SECONDS, 15, 'FOOTBALL_DETAIL_LIVE_SECONDS', 5, 600),
    aggregator: loadAggregator(env),
    apilx: loadApilx(env),
    ai: (env.OPENROUTER_API_KEY ?? '').trim()
      ? { apiKey: (env.OPENROUTER_API_KEY ?? '').trim(), model: (env.OPENROUTER_MODEL ?? 'openai/gpt-4o-mini').trim() || 'openai/gpt-4o-mini' }
      : null,
    bankTransfer: loadBankTransfer(env),
    mail:
      (env.BREVO_API_KEY ?? '').trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((env.MAIL_FROM_EMAIL ?? '').trim())
        ? { brevoApiKey: (env.BREVO_API_KEY ?? '').trim(), fromEmail: (env.MAIL_FROM_EMAIL ?? '').trim(), fromName: (env.MAIL_FROM_NAME ?? 'Hannibal').trim() || 'Hannibal' }
        : null,
    trustProxyHops: int(env.TRUST_PROXY_HOPS, 0, 'TRUST_PROXY_HOPS', 0, 5),
    sessions: {
      userMs: int(env.SESSION_USER_DAYS, 30, 'SESSION_USER_DAYS', 1, 365) * DAY,
      staffMs: int(env.SESSION_STAFF_HOURS, 12, 'SESSION_STAFF_HOURS', 1, 72) * HOUR,
      userIdleMs: int(env.SESSION_USER_IDLE_DAYS, 7, 'SESSION_USER_IDLE_DAYS', 1, 90) * DAY,
      staffIdleMs: int(env.SESSION_STAFF_IDLE_MINUTES, 120, 'SESSION_STAFF_IDLE_MINUTES', 5, 480) * 60_000,
    },
    scryptLog2N: int(env.SCRYPT_LOG2N, production ? 15 : nodeEnv === 'test' ? 10 : 15, 'SCRYPT_LOG2N', 10, 20),
    turnstile: secret && siteKey ? { secret, siteKey } : null,
    logLevel,
  };
}
