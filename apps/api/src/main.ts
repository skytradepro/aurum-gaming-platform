import { LOCALES, LOCALE_META } from '@aurum/i18n';
/**
 * API entry point:  node --env-file-if-exists=../../.env src/main.ts
 * Reads configuration from the environment (see .env.example), connects to PostgreSQL,
 * checks that the schema is up to date and starts the HTTP server.
 */
import { MIGRATIONS_DIR, createDb, loadMigrations } from '@aurum/db';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { createLogger, errorFields } from './log.ts';
import { allRoutes } from './routes/index.ts';
import { settleDueBets } from './services/bets.ts';
import { syncRates } from './services/rates-sync.ts';
import { expireDueWithdrawals } from './services/withdrawals.ts';
import { seedStarterPromotions } from './services/seed-promotions.ts';

const config = loadConfig();
const logger = createLogger(config.logLevel);

const db = createDb({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl,
  applicationName: 'aurum-api',
  onError: (error) => logger.error('database pool error', errorFields(error)),
});

async function assertSchemaIsCurrent(): Promise<void> {
  const expected = loadMigrations(MIGRATIONS_DIR).map((m) => m.version);
  let applied: string[];
  try {
    const { rows } = await db.query<{ version: string }>('select version from schema_migrations order by version');
    applied = rows.map((r) => r.version);
  } catch {
    throw new Error('The database has no schema yet. Run "npm run db:migrate" first.');
  }
  const missing = expected.filter((v) => !applied.includes(v));
  if (missing.length > 0) throw new Error(`The database is missing migrations: ${missing.join(', ')}. Run "npm run db:migrate".`);
}

try {
  await db.query('select 1');
  await assertSchemaIsCurrent();
} catch (error) {
  logger.error('startup check failed', errorFields(error));
  await db.close().catch(() => undefined);
  process.exit(1);
}

// Every interface language that has a translation file gets a row in "languages" (enabled the first time).
// Existing rows are never changed, so a language the Super Admin turned off stays off.
try {
  const metas = LOCALES.map((code) => LOCALE_META[code]);
  for (const [i, m] of metas.entries()) {
    await db.query(
      `insert into languages (code, native_name, english_name, direction, is_enabled, is_default, sort_order)
       values ($1, $2, $3, $4, true, false, $5) on conflict (code) do nothing`,
      [m.code, m.nativeName, m.englishName, m.direction, i + 1],
    );
  }
} catch (error) {
  logger.warn('could not register interface languages', errorFields(error));
}

// Starter promotions, added once (the admin can edit or delete them; they are never recreated).
try {
  const added = await seedStarterPromotions(db);
  if (added > 0) logger.info('starter promotions added', { count: added });
} catch (error) {
  logger.warn('could not add starter promotions', errorFields(error));
}

const app = createApp({ config, db, routes: allRoutes, logger });
const address = await app.listen();
logger.info('api listening', { ...address, env: config.env, demoData: config.showDemoData });
if (config.showDemoData) logger.warn('SHOW_DEMO_DATA is on: demo games, winners and jackpots are visible. Never enable it in production.');

// Pickup codes that ran out: return the reserved money to the players' wallets.
const sweep = async () => {
  try {
    const released = await expireDueWithdrawals(db);
    if (released > 0) logger.info('expired withdrawal requests released', { released });
  } catch (error) {
    logger.error('withdrawal expiry sweep failed', errorFields(error));
  }
};
const sweeper = setInterval(() => void sweep(), 60_000);
sweeper.unref();
void sweep();

// Sports bets: look up the results of finished matches and pay or close the bets (every 5 minutes).
let betsTimer: ReturnType<typeof setInterval> | undefined;
if (config.footballApiKey) {
  const settle = async () => {
    try {
      const r = await settleDueBets(db, config);
      if (r.settled > 0) logger.info('sports bets settled', { matches: r.matches, settled: r.settled });
    } catch (error) {
      logger.error('bet settlement failed', errorFields(error));
    }
  };
  betsTimer = setInterval(() => void settle(), 5 * 60_000);
  betsTimer.unref();
  void settle();
}

// Market exchange rates (display only). Set RATES_API_URL in .env, e.g. https://open.er-api.com/v6/latest/{BASE}
const ratesUrl = process.env.RATES_API_URL?.trim();
let ratesTimer: ReturnType<typeof setInterval> | undefined;
if (ratesUrl && ratesUrl.includes('{BASE}')) {
  const pull = async () => {
    try {
      const r = await syncRates(db, ratesUrl);
      logger.info('exchange rates updated', { stored: r.stored, failed: r.failed.join(',') });
    } catch (error) {
      logger.error('exchange rate update failed', errorFields(error));
    }
  };
  ratesTimer = setInterval(() => void pull(), 6 * 60 * 60_000);
  ratesTimer.unref();
  void pull();
} else {
  logger.info('RATES_API_URL not set: exchange rates come only from manual entry');
}

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  logger.info('shutting down', { signal });
  const force = setTimeout(() => process.exit(1), 10_000);
  force.unref();
  clearInterval(sweeper);
  if (ratesTimer) clearInterval(ratesTimer);
  if (betsTimer) clearInterval(betsTimer);
  try {
    await app.close();
    await db.close();
    process.exit(0);
  } catch (error) {
    logger.error('shutdown failed', errorFields(error));
    process.exit(1);
  }
}
process.on('SIGINT', () => void stop('SIGINT'));
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('unhandledRejection', (reason) => logger.error('unhandled rejection', errorFields(reason)));
process.on('uncaughtException', (error) => {
  logger.error('uncaught exception', errorFields(error));
  process.exit(1);
});
