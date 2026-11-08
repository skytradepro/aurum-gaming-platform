/**
 * Pulls game lists from API LX staging and upserts Hannibal catalogue rows (external_id + artwork).
 *
 *   npm run apilx:sync-catalog -w @aurum/api
 *   npm run apilx:sync-catalog -w @aurum/api -- --provider pragmatic
 */
import { createDb } from '@aurum/db';
import { loadConfig } from '../src/config.ts';
import { syncApilxCatalog } from '../src/services/apilx-catalog.ts';
import type { Ctx } from '../src/http/types.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

const config = loadConfig();
if (!config.apilx) {
  console.error('APILX_* is not configured in .env');
  process.exit(1);
}

const db = createDb({ connectionString: config.databaseUrl, ssl: config.databaseSsl, applicationName: 'apilx-sync' });
const ctx = {
  config,
  db,
  ip: '127.0.0.1',
  userAgent: 'apilx-sync-catalog',
  requestId: 'cli-apilx-sync',
  user: null,
  principal() {
    throw new Error('cli');
  },
} as unknown as Ctx;

const provider = arg('provider');
const { results } = await syncApilxCatalog(ctx, provider ? { provider } : undefined);
for (const r of results) {
  console.log(
    `${r.provider}: remote=${r.remoteCount} matched=${r.matched} inserted=${r.inserted} updated=${r.updated} sampleIds=${r.sampleIds.join(',')}`,
  );
}
await db.close();
