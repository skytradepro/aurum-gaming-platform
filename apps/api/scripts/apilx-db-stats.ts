import { createDb } from '@aurum/db';
import { loadConfig } from '../src/config.ts';

const c = loadConfig();
const db = createDb({ connectionString: c.databaseUrl, ssl: c.databaseSsl });
const ext = await db.query<{ n: number }>(
  'select count(*)::int as n from games where is_active and external_id is not null',
);
const demo = await db.query<{ n: number }>('select count(*)::int as n from games where is_active and is_demo');
const byP = await db.query<{ slug: string; name: string; n: number; with_ext: number }>(
  `select p.slug, p.name, count(*)::int as n,
          count(*) filter (where g.external_id is not null)::int as with_ext
     from games g join game_providers p on p.id = g.provider_id
    where g.is_active group by p.slug, p.name order by n desc`,
);
console.log('SHOW_DEMO_DATA env=', process.env.SHOW_DEMO_DATA);
console.log('active with external_id:', ext.rows[0]?.n);
console.log('active demo:', demo.rows[0]?.n);
for (const r of byP.rows) console.log(`${r.slug}: total=${r.n} with_ext=${r.with_ext}`);
await db.close();
