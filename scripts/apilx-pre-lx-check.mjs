/**
 * Pre-LX call checklist (public probes only). Run: node scripts/apilx-pre-lx-check.mjs [baseUrl]
 */
const base = (process.argv[2] ?? 'https://hanibalgamer.fr').replace(/\/$/, '');

const paths = [
  ['GET', '/api/v1/health', null],
  ['POST', '/api/v1/apilx/wallet/GetBalance', '{}'],
];

async function probe(method, path, body) {
  const url = `${base}${path}`;
  const init = { method, headers: { accept: 'application/json' } };
  if (body !== null) {
    init.headers['content-type'] = 'application/json';
    init.body = body;
  }
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(25_000) });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 200) };
    }
    return { ok: true, ms: Date.now() - t0, status: res.status, json };
  } catch (e) {
    return { ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
}

async function catalogStats() {
  const url = `${base}/api/v1/public/games?limit=2000`;
  const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
  const data = await res.json();
  const items = data?.data?.items ?? [];
  const agg = items.filter((g) => g.art?.source === 'aggregator');
  const withExt = agg.filter((g) => g.externalId);
  const withImg = agg.filter((g) => typeof g.art?.image === 'string' && g.art.image.startsWith('https://'));
  const noImg = agg.filter((g) => !g.art?.image);
  return { total: items.length, aggregator: agg.length, withExt: withExt.length, withImg: withImg.length, noImg: noImg.length, sampleNoImg: noImg.slice(0, 5).map((g) => g.slug) };
}

console.log(`\n=== APILX pre-call check: ${base} ===\n`);
for (const [method, path, body] of paths) {
  const r = await probe(method, path, body);
  console.log(`${method} ${path} -> ${r.ok ? `HTTP ${r.status} (${r.ms}ms)` : `FAIL ${r.error}`}`);
  if (r.json) console.log('  ', JSON.stringify(r.json).slice(0, 280));
}

try {
  const cat = await catalogStats();
  console.log('\nCatalog:', cat);
  const gate = await probe('GET', `/api/v1/public/games/gates-of-olympus`, null);
  console.log('\nSample game gates-of-olympus:', gate.ok ? `HTTP ${gate.status} externalId=${gate.json?.data?.game?.externalId ?? '?'}` : gate.error);
} catch (e) {
  console.log('\nCatalog probe failed:', e instanceof Error ? e.message : e);
}

console.log('\n=== Our side checklist (code — verify deploy separately) ===');
console.log('- 5 wallet routes: GetBalance, Withdraw, Deposit, BetWin, RollbackTransaction');
console.log('- userID = player account_no; sign HMAC 2-decimal amounts');
console.log('- Launch: userAuth via APILX; money stays on Hannibal ledger');
console.log('- DNS: callback host must resolve (hanibalgamer.fr not hannibalgamer.fr)');
console.log('- WEB_ORIGIN must include every player domain (.fr / .tn if used)');
