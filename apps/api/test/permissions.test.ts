import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { TEST_DATABASE_URL } from '@aurum/db/testing';
import { PERMISSIONS } from '@aurum/shared';
import type { Permission } from '@aurum/shared';
import type { Route } from '../src/http/types.ts';
import { allRoutes } from '../src/routes/index.ts';
import { hashPassword } from '../src/security/password.ts';
import { STRONG_PASSWORD, createStaff, createSuperAdminAccount, registerPlayer, signedIn, startServer } from './helpers.ts';
import type { Account, Browser, TestServer } from './helpers.ts';

const UUID = '00000000-0000-4000-8000-000000000001';
const PARAMS: Record<string, string> = { id: '1', slug: 'about-us', code: 'TND', key: 'a'.repeat(32) + '.png' };

function concretePath(route: Route): string {
  return route.path.replace(/:(\w+)/g, (_m, name: string) => {
    if (name === 'id' && (route.path.includes('/players/') || route.path.includes('/staff/') || route.path.includes('/workers/'))) return UUID;
    if (name === 'code' && route.path.includes('/languages/')) return 'en';
    if (name === 'code' && route.path.includes('/countries/')) return 'TN';
    if (name === 'key' && route.path.includes('/settings/')) return 'registration_open';
    return PARAMS[name] ?? '1';
  });
}

const denied = (status: number) => status === 401 || status === 403;

/**
 * The access policy, written out independently of the route files. Changing who may call a route
 * means changing this table too, which makes every such change visible in review.
 */
const POLICY: Record<string, string> = {
  'GET /v1/health': 'public',
  'GET /v1/public/config': 'public',
  'GET /v1/public/banners': 'public',
  'GET /v1/public/promotions': 'public',
  'GET /v1/public/promotions/:slug': 'public',
  'GET /v1/public/pages/:slug': 'public',
  'GET /v1/public/providers': 'public',
  'GET /v1/public/games': 'public',
  'GET /v1/public/games/:slug': 'public',
  'GET /v1/public/demo/winners': 'public',
  'GET /v1/public/demo/jackpots': 'public',
  'GET /v1/media/:key': 'public',
  'POST /v1/auth/register': 'public',
  'POST /v1/auth/login': 'public',
  'POST /v1/auth/logout': 'user',
  'GET /v1/auth/me': 'user',
  'POST /v1/auth/change-password': 'user',
  'PATCH /v1/account/preferences': 'user',
  'GET /v1/account/wallet': 'player',
  'GET /v1/account/transactions': 'player',
  'GET /v1/admin/dashboard': 'staff:reports.view',
  'GET /v1/admin/reports/ledger-health': 'staff:reports.view',
  'GET /v1/admin/players': 'staff:balances.manage|balances.view|users.manage|users.view',
  'GET /v1/admin/players/:id': 'staff:balances.manage|balances.view|users.manage|users.view',
  'PATCH /v1/admin/players/:id': 'staff:users.manage',
  'POST /v1/admin/players/:id/reset-password': 'staff:users.manage',
  'POST /v1/admin/players/:id/balance': 'staff:balances.manage',
  'GET /v1/admin/players/:id/ledger': 'staff:balances.manage|balances.view',
  'GET /v1/admin/ledger': 'staff:balances.manage|balances.view',
  'GET /v1/admin/audit': 'staff:audit.view',
  'GET /v1/admin/staff': 'super',
  'POST /v1/admin/staff': 'super',
  'PATCH /v1/admin/staff/:id': 'super',
  'POST /v1/admin/staff/:id/reset-password': 'super',
  'GET /v1/admin/currencies': 'staff:any',
  'POST /v1/admin/currencies': 'super',
  'PUT /v1/admin/currencies/:code': 'super',
  'GET /v1/admin/exchange-rates': 'staff:any',
  'POST /v1/admin/exchange-rates': 'super',
  'GET /v1/admin/languages': 'super',
  'PATCH /v1/admin/languages/:code': 'super',
  'GET /v1/admin/countries': 'super',
  'PATCH /v1/admin/countries/:code': 'super',
  'GET /v1/admin/settings': 'super',
  'PUT /v1/admin/settings/:key': 'super',
  'GET /v1/admin/banners': 'staff:banners.manage',
  'POST /v1/admin/banners': 'staff:banners.manage',
  'GET /v1/admin/banners/:id': 'staff:banners.manage',
  'PUT /v1/admin/banners/:id': 'staff:banners.manage',
  'DELETE /v1/admin/banners/:id': 'staff:banners.manage',
  'GET /v1/admin/promotions': 'staff:promotions.manage',
  'POST /v1/admin/promotions': 'staff:promotions.manage',
  'GET /v1/admin/promotions/:id': 'staff:promotions.manage',
  'PUT /v1/admin/promotions/:id': 'staff:promotions.manage',
  'DELETE /v1/admin/promotions/:id': 'staff:promotions.manage',
  'GET /v1/admin/pages': 'staff:pages.manage',
  'GET /v1/admin/pages/:slug': 'staff:pages.manage',
  'PUT /v1/admin/pages/:slug': 'staff:pages.manage',
  'GET /v1/admin/game-providers': 'staff:games.manage',
  'POST /v1/admin/game-providers': 'staff:games.manage',
  'PUT /v1/admin/game-providers/:id': 'staff:games.manage',
  'GET /v1/admin/games': 'staff:games.manage',
  'POST /v1/admin/games': 'staff:games.manage',
  'GET /v1/admin/games/:id': 'staff:games.manage',
  'PUT /v1/admin/games/:id': 'staff:games.manage',
  'GET /v1/admin/media': 'staff:banners.manage|games.manage|promotions.manage',
  'POST /v1/admin/media': 'staff:banners.manage|games.manage|promotions.manage',
  // shops, shop workers, shop cash, withdrawals collected at shops (migration 0006)
  'GET /v1/public/shops': 'public',
  'GET /v1/account/withdrawals': 'player',
  'POST /v1/account/withdrawals': 'player',
  'POST /v1/account/withdrawals/:id/cancel': 'player',
  'GET /v1/admin/shops': 'staff:shops.cash|shops.manage|shops.view',
  'POST /v1/admin/shops': 'staff:shops.manage',
  'GET /v1/admin/shops/:id': 'staff:shops.cash|shops.manage|shops.view',
  'PUT /v1/admin/shops/:id': 'staff:shops.manage',
  'GET /v1/admin/shops/:id/cash': 'staff:shops.cash|shops.manage|shops.view',
  'POST /v1/admin/shops/:id/cash': 'staff:shops.cash',
  'GET /v1/admin/shops/:id/cash-counts': 'staff:shops.cash|shops.manage|shops.view',
  'POST /v1/admin/shops/:id/cash-counts': 'staff:shops.cash',
  'GET /v1/admin/shop-cash': 'staff:shops.cash|shops.manage|shops.view',
  'GET /v1/admin/reports/shops': 'staff:reports.view|shops.cash|shops.manage|shops.view',
  'GET /v1/admin/reports/shop-cash-health': 'staff:reports.view|shops.cash|shops.manage|shops.view',
  'GET /v1/admin/workers': 'staff:shops.cash|shops.manage|shops.view',
  'POST /v1/admin/workers': 'staff:shops.manage',
  'GET /v1/admin/workers/:id': 'staff:shops.cash|shops.manage|shops.view',
  'PATCH /v1/admin/workers/:id': 'staff:shops.manage',
  'POST /v1/admin/workers/:id/reset-password': 'staff:shops.manage',
  'GET /v1/admin/withdrawals': 'staff:shops.manage|shops.view|withdrawals.manage|withdrawals.view',
  'GET /v1/admin/withdrawals/:id': 'staff:shops.manage|shops.view|withdrawals.manage|withdrawals.view',
  'POST /v1/admin/withdrawals/:id/reject': 'staff:withdrawals.manage',
  'GET /v1/shop/summary': 'cashier',
  'GET /v1/shop/players': 'cashier',
  'POST /v1/shop/players': 'cashier',
  'POST /v1/shop/deposits': 'cashier',
  'POST /v1/shop/payouts/lookup': 'cashier',
  'POST /v1/shop/payouts/:id': 'cashier',
  'GET /v1/shop/transactions': 'cashier',
  'GET /v1/shop/receipts/:id': 'cashier',
  'GET /v1/shop/cash-counts': 'cashier:manager',
  'POST /v1/shop/cash-counts': 'cashier:manager',
};

function describeAccess(a: Route['access']): string {
  if (a.kind === 'staff') return a.anyOf && a.anyOf.length > 0 ? `staff:${[...a.anyOf].sort().join('|')}` : 'staff:any';
  if (a.kind === 'cashier') return a.managerOnly ? 'cashier:manager' : 'cashier';
  return a.kind;
}

describe('route access rules', () => {
  it('every admin route requires staff or the Super Admin', () => {
    for (const route of allRoutes.filter((r) => r.path.startsWith('/v1/admin'))) {
      assert.ok(route.access.kind === 'staff' || route.access.kind === 'super', `${route.method} ${route.path} is ${route.access.kind}`);
    }
  });

  it('shop counter routes are for shop workers only', () => {
    for (const route of allRoutes.filter((r) => r.path.startsWith('/v1/shop/'))) {
      assert.equal(route.access.kind, 'cashier', `${route.method} ${route.path}`);
    }
  });

  it('account routes are for signed-in players or users', () => {
    for (const route of allRoutes.filter((r) => r.path.startsWith('/v1/account'))) {
      assert.ok(route.access.kind === 'player' || route.access.kind === 'user', `${route.method} ${route.path}`);
    }
  });

  it('public routes are read-only apart from registration, login and the CSRF-protected auth entry points', () => {
    const writable = allRoutes.filter((r) => r.access.kind === 'public' && r.method !== 'GET');
    const allowed = [
      'POST /v1/aggregator/wallet/balance',
      'POST /v1/aggregator/wallet/credit',
      'POST /v1/aggregator/wallet/debit',
      'POST /v1/aggregator/wallet/rollback',
      'POST /v1/ai/chat',
      'POST /v1/apilx/wallet/BetWin',
      'POST /v1/apilx/wallet/Deposit',
      'POST /v1/apilx/wallet/GetBalance',
      'POST /v1/apilx/wallet/RollbackTransaction',
      'POST /v1/apilx/wallet/Withdraw',
      'POST /v1/auth/login',
      'POST /v1/auth/login/2fa',
      'POST /v1/auth/register',
    ].sort();
    assert.deepEqual(writable.map((r) => `${r.method} ${r.path}`).sort(), allowed);
  });

  it('matches the written access policy exactly (no route added, removed or loosened unnoticed)', () => {
    const actual = Object.fromEntries(allRoutes.map((r) => [`${r.method} ${r.path}`, describeAccess(r.access)]));
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(POLICY).sort(), 'the set of routes differs from the policy table');
    for (const [route, expected] of Object.entries(POLICY)) assert.equal(actual[route], expected, route);
  });

  it('has no duplicate routes', () => {
    const seen = new Set<string>();
    for (const r of allRoutes) {
      const key = `${r.method} ${r.path}`;
      assert.ok(!seen.has(key), key);
      seen.add(key);
    }
  });
});

describe('permission matrix', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let server: TestServer;
  let player: Account;
  let superAdmin: Account;
  let noPermissions: Account;
  const cache = new Map<string, Account>();

  before(async () => {
    server = await startServer();
    player = (await registerPlayer(server)).account;
    superAdmin = await createSuperAdminAccount(server);
    noPermissions = await createStaff(server, { permissions: [] });
  });
  after(async () => {
    await server?.stop();
  });

  async function staffWith(...permissions: Permission[]): Promise<Account> {
    const key = permissions.slice().sort().join(',');
    let account = cache.get(key);
    if (!account) {
      account = await createStaff(server, { permissions });
      cache.set(key, account);
    }
    return account;
  }

  async function call(route: Route, who: Account | null): Promise<number> {
    const browser: Browser = who ? await signedIn(server, who) : server.browser();
    const body = route.method === 'GET' || route.method === 'DELETE' ? undefined : {};
    const response = await browser.request(route.method, concretePath(route), body === undefined ? {} : { json: body });
    return response.status;
  }

  const guarded = allRoutes.filter((r) => r.access.kind !== 'public');

  it('refuses anonymous visitors on every protected route (401)', async () => {
    for (const route of guarded) {
      assert.equal(await call(route, null), 401, `${route.method} ${route.path}`);
    }
  });

  it('keeps players out of every staff route (403) but lets them into their own', async () => {
    for (const route of guarded) {
      const status = await call(route, player);
      const playerAllowed = route.access.kind === 'user' || route.access.kind === 'player';
      if (playerAllowed) assert.ok(!denied(status), `${route.method} ${route.path} -> ${status}`);
      else assert.equal(status, 403, `${route.method} ${route.path} -> ${status}`);
    }
  });

  it('admins without permissions only reach routes open to any staff member', async () => {
    for (const route of guarded) {
      const status = await call(route, noPermissions);
      const a = route.access;
      const allowed = a.kind === 'user' || (a.kind === 'staff' && (!a.anyOf || a.anyOf.length === 0));
      if (allowed) assert.ok(!denied(status), `${route.method} ${route.path} -> ${status}`);
      else assert.equal(status, 403, `${route.method} ${route.path} -> ${status}`);
    }
  });

  it('an admin with the required permission gets in; with only unrelated permissions does not', async () => {
    for (const route of guarded) {
      const a = route.access;
      if (a.kind !== 'staff' || !a.anyOf || a.anyOf.length === 0) continue;
      for (const needed of a.anyOf) {
        const status = await call(route, await staffWith(needed));
        assert.ok(!denied(status), `${route.method} ${route.path} with ${needed} -> ${status}`);
      }
      const unrelated = PERMISSIONS.filter((p) => !(a.anyOf as readonly string[]).includes(p));
      const status = await call(route, await staffWith(...unrelated));
      assert.equal(status, 403, `${route.method} ${route.path} with all unrelated permissions -> ${status}`);
    }
  });

  it('the Super Admin reaches everything except the player-only and shop-counter routes', async () => {
    for (const route of guarded) {
      const status = await call(route, superAdmin);
      if (route.access.kind === 'player' || route.access.kind === 'cashier') assert.equal(status, 403, `${route.method} ${route.path}`);
      else assert.ok(!denied(status), `${route.method} ${route.path} -> ${status}`);
    }
  });

  it('a shop cashier reaches the counter routes and their own account, and nothing else', async () => {
    const shop = await server.db.query<{ id: string }>(
      "insert into shops (code, name, currency) values ('PERM-1', 'Permission test shop', 'TND') returning id::text",
    );
    const shopId = (shop.rows[0] as { id: string }).id;
    const accounts: Account[] = [];
    for (const shopRole of ['cashier', 'manager'] as const) {
      const username = `perm_${shopRole}_${Date.now().toString(36)}`;
      const { rows } = await server.db.query<{ id: string }>(
        `insert into users (username, email, password_hash, first_name, last_name, role, shop_id, shop_role)
         values ($1, $2, $3, 'Shop', 'Worker', 'cashier', $4::bigint, $5) returning id::text`,
        [username, `${username}@example.test`, await hashPassword(STRONG_PASSWORD, server.config.scryptLog2N), shopId, shopRole],
      );
      accounts.push({ id: (rows[0] as { id: string }).id, username, email: `${username}@example.test`, password: STRONG_PASSWORD });
    }
    const [cashier, manager] = accounts as [Account, Account];
    for (const route of guarded) {
      const a = route.access;
      const asCashier = await call(route, cashier);
      const cashierAllowed = a.kind === 'user' || (a.kind === 'cashier' && !a.managerOnly);
      if (cashierAllowed) assert.ok(!denied(asCashier), `cashier ${route.method} ${route.path} -> ${asCashier}`);
      else assert.equal(asCashier, 403, `cashier ${route.method} ${route.path} -> ${asCashier}`);
      if (a.kind === 'cashier') {
        const asManager = await call(route, manager);
        assert.ok(!denied(asManager), `manager ${route.method} ${route.path} -> ${asManager}`);
      }
    }
  });

  it('Super-Admin-only routes stay closed to an admin who has every permission', async () => {
    const everything = await staffWith(...PERMISSIONS);
    for (const route of guarded.filter((r) => r.access.kind === 'super')) {
      assert.equal(await call(route, everything), 403, `${route.method} ${route.path}`);
    }
  });

  it('a permission change takes effect on the next request (sessions are revoked)', async () => {
    const staff = await createStaff(server, { permissions: ['users.view'] });
    const browser = await signedIn(server, staff);
    assert.equal((await browser.get('/v1/admin/players')).status, 200);
    const boss = await signedIn(server, superAdmin);
    const changed = await boss.patch(`/v1/admin/staff/${staff.id}`, { permissions: ['audit.view'] });
    assert.equal(changed.status, 200);
    assert.equal((await browser.get('/v1/admin/players')).status, 401);
    const again = await signedIn(server, staff);
    assert.equal((await again.get('/v1/admin/players')).status, 403);
    assert.equal((await again.get('/v1/admin/audit')).status, 200);
  });
});
