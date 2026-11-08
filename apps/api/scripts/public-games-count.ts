import { createDb } from '@aurum/db';
import { loadConfig } from '../src/config.ts';
import { listGames } from '../src/services/games.ts';

const c = loadConfig();
const db = createDb({ connectionString: c.databaseUrl, ssl: c.databaseSsl });
const page = await listGames(db, { activeOnly: true, includeDemo: c.showDemoData, limit: 3, offset: 0 });
console.log('total', page.total, 'sample', page.items.map((g) => ({ slug: g.slug, provider: g.provider.name, ext: g.externalId })));
await db.close();
