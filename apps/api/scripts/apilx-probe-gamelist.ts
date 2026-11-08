/**
 * One provider gamelist probe — prints counts and sample game ids only (no secrets).
 */
import { loadConfig } from '../src/config.ts';
import { fetchApilxGamelist } from '../src/services/apilx-gamelist.ts';

const provider = (process.argv[2] ?? 'pragmatic').trim().toLowerCase();
const config = loadConfig();
if (!config.apilx) {
  console.error('APILX_* missing');
  process.exit(1);
}
const vendor = config.apilx.providers.find((p) => p.id === provider);
if (!vendor) {
  console.error(`provider ${provider} not configured`);
  process.exit(1);
}

const games = await fetchApilxGamelist(config.apilx, vendor);
console.log(`provider=${provider} count=${games.length}`);
for (const g of games.slice(0, 8)) {
  console.log(`  id=${g.externalId} name=${g.name.slice(0, 48)} image=${g.image ? 'yes' : 'no'}`);
}
