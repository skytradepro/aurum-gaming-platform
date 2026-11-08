import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { TEST_DATABASE_URL } from '@aurum/db/testing';
import { expireDueWithdrawals } from '../src/services/withdrawals.ts';
import { STRONG_PASSWORD, createStaff, createSuperAdminAccount, registerPlayer, signedIn, startServer, unique } from './helpers.ts';
import type { Browser, TestServer } from './helpers.ts';

const key = () => `key-${unique()}`;

describe('shops, cashiers, cash deposits and shop withdrawals', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let server: TestServer;
  let manager: Browser; // head office: shops.manage + shops.cash + withdrawals.manage
  let viewer: Browser; // head office: shops.view only
  let boss: Browser;

  before(async () => {
    server = await startServer();
    manager = await signedIn(server, await createStaff(server, { permissions: ['shops.manage', 'shops.cash', 'withdrawals.manage', 'users.manage', 'balances.manage'] }));
    viewer = await signedIn(server, await createStaff(server, { permissions: ['shops.view'] }));
    boss = await signedIn(server, await createSuperAdminAccount(server));
  });
  after(async () => {
    await server?.stop();
  });

  async function createShop(overrides: Record<string, unknown> = {}): Promise<{ id: string; code: string }> {
    const code = `SH-${unique().slice(-8).toUpperCase()}`;
    const r = await manager.post('/v1/admin/shops', { code, name: `Shop ${code}`, city: 'Tunis', address: '1 Avenue Habib Bourguiba', currency: 'TND', ...overrides });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    return { id: r.body.data.shop.id, code: r.body.data.shop.code };
  }

  /** Creates a worker through the API, signs in, changes the temporary password. */
  async function createCashier(shopId: string, shopRole: 'manager' | 'cashier' = 'cashier'): Promise<{ browser: Browser; id: string; username: string }> {
    const username = `cashier_${unique()}`;
    const created = await manager.post('/v1/admin/workers', { shopId, username, email: `${username}@example.test`, firstName: 'Sami', lastName: 'Trabelsi', shopRole });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const browser = server.browser();
    const login = await browser.post('/v1/auth/login', { identifier: username, password: created.body.data.temporaryPassword });
    assert.equal(login.status, 200);
    const change = await browser.post('/v1/auth/change-password', { currentPassword: created.body.data.temporaryPassword, newPassword: STRONG_PASSWORD });
    assert.equal(change.status, 204, JSON.stringify(change.body));
    return { browser, id: created.body.data.worker.id, username };
  }

  async function shopCash(shopId: string): Promise<string> {
    return (await manager.get(`/v1/admin/shops/${shopId}`)).body.data.shop.cashBalance.amountMinor;
  }

  const balanceOf = async (player: Browser) => (await player.get('/v1/auth/me')).body.data.user.wallet.balance.amountMinor as string;

  describe('shops (head office)', () => {
    it('creates and updates a shop; codes are unique; permissions are enforced', async () => {
      const shop = await createShop({ code: 'tun-centre-1', maxDeposit: '5000', maxPayout: '2000.5' });
      assert.equal(shop.code, 'TUN-CENTRE-1');
      const detail = await viewer.get(`/v1/admin/shops/${shop.id}`);
      assert.equal(detail.status, 200);
      assert.deepEqual(detail.body.data.shop.maxDeposit, { amountMinor: '5000000', currency: 'TND' });
      assert.deepEqual(detail.body.data.shop.maxPayout, { amountMinor: '2000500', currency: 'TND' });
      assert.deepEqual(detail.body.data.shop.cashBalance, { amountMinor: '0', currency: 'TND' });

      const duplicate = await manager.post('/v1/admin/shops', { code: 'TUN-CENTRE-1', name: 'Other', currency: 'TND' });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.error.fields.code, 'alreadyExists');

      assert.equal((await viewer.post('/v1/admin/shops', { code: 'NOPE-1', name: 'x', currency: 'TND' })).status, 403);
      const player = await registerPlayer(server);
      assert.equal((await player.browser.get('/v1/admin/shops')).status, 403);

      const updated = await manager.put(`/v1/admin/shops/${shop.id}`, { code: 'TUN-CENTRE-1', name: 'Tunis Centre', city: 'Tunis', currency: 'TND', openingHours: '09:00-22:00', callingCode: '216', mobile: '71 123 456' });
      assert.equal(updated.status, 200, JSON.stringify(updated.body));
      assert.equal(updated.body.data.shop.name, 'Tunis Centre');
      assert.equal(updated.body.data.shop.phone, '+21671123456');
      assert.equal(updated.body.data.shop.maxDeposit, null);

      const listed = await server.browser().get('/v1/public/shops');
      const pub = listed.body.data.items.find((s: { code: string }) => s.code === 'TUN-CENTRE-1');
      assert.ok(pub, 'listed shop is public');
      assert.equal(pub.cashBalance, undefined, 'the public list never shows cash');
    });

    it('refuses a currency that is not enabled and an invalid limit', async () => {
      const bad = await manager.post('/v1/admin/shops', { code: 'BAD-CUR', name: 'x', currency: 'XYZ' });
      assert.equal(bad.status, 422);
      assert.equal(bad.body.error.code, 'currency_unavailable');
      const badLimit = await manager.post('/v1/admin/shops', { code: 'BAD-LIM', name: 'x', currency: 'TND', maxDeposit: '1.2345' });
      assert.equal(badLimit.status, 422);
      assert.equal(badLimit.body.error.code, 'too_many_decimals');
    });
  });

  describe('workers', () => {
    it('creates a cashier who must change the temporary password, and who is not dashboard staff', async () => {
      const shop = await createShop();
      const username = `worker_${unique()}`;
      const created = await manager.post('/v1/admin/workers', { shopId: shop.id, username, email: `${username}@example.test`, firstName: 'Leila', lastName: 'Mansour', shopRole: 'cashier' });
      assert.equal(created.status, 201);
      assert.match(created.body.data.temporaryPassword, /^[A-Za-z0-9]{16}$/);
      assert.equal(created.body.data.worker.shop.code, shop.code);
      const browser = server.browser();
      await browser.post('/v1/auth/login', { identifier: username, password: created.body.data.temporaryPassword });
      const blocked = await browser.get('/v1/shop/summary');
      assert.equal(blocked.status, 403);
      assert.equal(blocked.body.error.code, 'password_change_required');
      await browser.post('/v1/auth/change-password', { currentPassword: created.body.data.temporaryPassword, newPassword: STRONG_PASSWORD });
      const summary = await browser.get('/v1/shop/summary');
      assert.equal(summary.status, 200, JSON.stringify(summary.body));
      assert.equal(summary.body.data.shop.code, shop.code);
      assert.equal(summary.body.data.shopToday, null, 'a plain cashier does not see shop totals');
      const me = await browser.get('/v1/auth/me');
      assert.equal(me.body.data.user.role, 'cashier');
      assert.equal(me.body.data.user.shop.code, shop.code);
      // a cashier is not dashboard staff
      assert.equal((await browser.get('/v1/admin/players')).status, 403);
      assert.equal((await browser.get('/v1/admin/shops')).status, 403);
      // and a dashboard admin is not a cashier
      assert.equal((await manager.get('/v1/shop/summary')).status, 403);
      // the Super Admin staff list does not mix in shop workers
      const staff = await boss.get('/v1/admin/staff');
      assert.ok(!staff.body.data.items.some((s: { username: string }) => s.username === username));
    });

    it('signs a worker out when suspended or moved to another shop', async () => {
      const shop = await createShop();
      const other = await createShop();
      const worker = await createCashier(shop.id);
      const moved = await manager.patch(`/v1/admin/workers/${worker.id}`, { shopId: other.id });
      assert.equal(moved.status, 200);
      assert.equal(moved.body.data.worker.shop.id, other.id);
      assert.equal((await worker.browser.get('/v1/shop/summary')).status, 401);
    });
  });

  describe('cash deposits at the counter', () => {
    it('credits the wallet and the shop cash together, replays a retry, and refuses a reused key', async () => {
      const shop = await createShop();
      const cashier = await createCashier(shop.id);
      const player = await registerPlayer(server);
      const found = await cashier.browser.get(`/v1/shop/players?q=${encodeURIComponent(player.account.username)}`);
      assert.equal(found.status, 200);
      assert.equal(found.body.data.items.length, 1);
      assert.equal(found.body.data.items[0].id, player.id);
      // a partial name finds nobody: the counter cannot browse players
      const partial = await cashier.browser.get(`/v1/shop/players?q=${encodeURIComponent(player.account.username.slice(0, 8))}`);
      assert.equal(partial.body.data.items.length, 0);

      const idempotencyKey = key();
      const first = await cashier.browser.post('/v1/shop/deposits', { playerId: player.id, amount: '50.500', idempotencyKey });
      assert.equal(first.status, 201, JSON.stringify(first.body));
      assert.deepEqual(first.body.data.walletBalanceAfter, { amountMinor: '50500', currency: 'TND' });
      assert.equal(first.body.data.cashEntry.entryType, 'player_deposit');
      assert.equal(first.body.data.cashEntry.player.id, player.id);
      assert.equal(first.body.data.cashEntry.operator.username, cashier.username);
      const again = await cashier.browser.post('/v1/shop/deposits', { playerId: player.id, amount: '50.500', idempotencyKey });
      assert.equal(again.status, 200);
      assert.equal(again.body.data.replayed, true);
      assert.equal(again.body.data.cashEntry.id, first.body.data.cashEntry.id);
      const reused = await cashier.browser.post('/v1/shop/deposits', { playerId: player.id, amount: '60', idempotencyKey });
      assert.equal(reused.status, 409);
      assert.equal(reused.body.error.code, 'idempotency_key_reuse');
      assert.equal(await balanceOf(player.browser), '50500');
      assert.equal(await shopCash(shop.id), '50500');

      // the player's statement shows the deposit with the shop code, not the cashier
      const statement = await player.browser.get('/v1/account/transactions');
      assert.equal(statement.body.data.items[0].entryType, 'deposit');
      assert.equal(statement.body.data.items[0].reference, shop.code);
      assert.equal(statement.body.data.items[0].operator, undefined);

      const receipt = await cashier.browser.get(`/v1/shop/receipts/${first.body.data.cashEntry.id}`);
      assert.equal(receipt.status, 200);
      assert.equal(receipt.body.data.shop.code, shop.code);
    });

    it('never converts: a player in another currency is refused, and limits apply', async () => {
      const shop = await createShop({ maxDeposit: '100' });
      const cashier = await createCashier(shop.id);
      const euro = await registerPlayer(server, { currency: 'EUR' });
      const r = await cashier.browser.post('/v1/shop/deposits', { playerId: euro.id, amount: '10', idempotencyKey: key() });
      assert.equal(r.status, 422);
      assert.equal(r.body.error.code, 'shop_currency_mismatch');
      const tnd = await registerPlayer(server);
      const tooMuch = await cashier.browser.post('/v1/shop/deposits', { playerId: tnd.id, amount: '100.001', idempotencyKey: key() });
      assert.equal(tooMuch.status, 422);
      assert.equal(tooMuch.body.error.code, 'shop_limit_exceeded');
      assert.equal(await balanceOf(euro.browser), '0');
      assert.equal(await shopCash(shop.id), '0');
    });

    it('stops all counter operations in a suspended shop', async () => {
      const shop = await createShop();
      const cashier = await createCashier(shop.id);
      const player = await registerPlayer(server);
      const suspend = await manager.put(`/v1/admin/shops/${shop.id}`, { code: shop.code, name: 'Suspended', currency: 'TND', status: 'suspended' });
      assert.equal(suspend.status, 200);
      // suspension signs the workers out; signing in again works but operations are refused
      assert.equal((await cashier.browser.get('/v1/shop/summary')).status, 401);
      const again = await signedIn(server, { username: cashier.username, password: STRONG_PASSWORD });
      const r = await again.post('/v1/shop/deposits', { playerId: player.id, amount: '10', idempotencyKey: key() });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'shop_not_active');
    });

    it('keeps exact totals under concurrent deposits', async () => {
      const shop = await createShop();
      const cashier = await createCashier(shop.id);
      const player = await registerPlayer(server);
      const results = await Promise.all(
        Array.from({ length: 12 }, () => cashier.browser.post('/v1/shop/deposits', { playerId: player.id, amount: '1.111', idempotencyKey: key() })),
      );
      assert.ok(results.every((r) => r.status === 201), JSON.stringify(results.map((r) => r.status)));
      assert.equal(await balanceOf(player.browser), '13332');
      assert.equal(await shopCash(shop.id), '13332');
    });

    it('opens a player account at the counter in the shop currency, with a temporary password', async () => {
      const shop = await createShop();
      const cashier = await createCashier(shop.id);
      const username = `walkin_${unique()}`;
      const r = await cashier.browser.post('/v1/shop/players', {
        username, email: `${username}@example.test`, callingCode: '216', mobile: String(20_000_000 + Math.floor(Math.random() * 70_000_000)),
        firstName: 'Hedi', lastName: 'Gharbi', dateOfBirth: '1988-02-11', country: 'TN', termsAcceptedInPerson: true,
      });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(r.body.data.player.currency, 'TND');
      const browser = server.browser();
      await browser.post('/v1/auth/login', { identifier: username, password: r.body.data.temporaryPassword });
      assert.equal((await browser.get('/v1/account/wallet')).body.error.code, 'password_change_required');
      const minor = await cashier.browser.post('/v1/shop/players', {
        username: `kid_${unique()}`, email: `kid_${unique()}@example.test`, callingCode: '216', mobile: '22123456',
        firstName: 'Too', lastName: 'Young', dateOfBirth: `${new Date().getUTCFullYear() - 17}-01-01`, country: 'TN', termsAcceptedInPerson: true,
      });
      assert.equal(minor.status, 422);
      assert.equal(minor.body.error.code, 'under_age');
    });
  });

  describe('withdrawals collected at a shop', () => {
    async function fundedPlayer(shopId: string, cashier: Browser, amount = '100') {
      const player = await registerPlayer(server);
      const d = await cashier.post('/v1/shop/deposits', { playerId: player.id, amount, idempotencyKey: key() });
      assert.equal(d.status, 201);
      void shopId;
      return player;
    }

    it('reserves the amount, pays it once against code + account, and moves the shop cash', async () => {
      const shop = await createShop();
      const cashier = await createCashier(shop.id);
      const otherCashier = await createCashier(shop.id);
      const player = await fundedPlayer(shop.id, cashier.browser, '100');
      const me = (await player.browser.get('/v1/auth/me')).body.data.user;

      const req = await player.browser.post('/v1/account/withdrawals', { amount: '30.250', preferredShopId: shop.id, idempotencyKey: key() });
      assert.equal(req.status, 201, JSON.stringify(req.body));
      const w = req.body.data.withdrawal;
      assert.match(w.code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
      assert.equal(w.status, 'pending');
      assert.equal(await balanceOf(player.browser), '69750', 'the amount is reserved at once');

      const wrongAccount = await cashier.browser.post('/v1/shop/payouts/lookup', { code: w.code, account: '999999999' });
      assert.equal(wrongAccount.status, 404);
      assert.equal(wrongAccount.body.error.code, 'withdrawal_not_found');
      const lookup = await cashier.browser.post('/v1/shop/payouts/lookup', { code: w.code.toLowerCase().replace('-', ' '), account: me.accountNo });
      assert.equal(lookup.status, 200, JSON.stringify(lookup.body));
      assert.equal(lookup.body.data.payable, true);
      assert.equal(lookup.body.data.player.dateOfBirth, '1990-05-17');

      const noIdCheck = await cashier.browser.post(`/v1/shop/payouts/${w.id}`, { idChecked: false });
      assert.equal(noIdCheck.status, 422);
      const paid = await cashier.browser.post(`/v1/shop/payouts/${w.id}`, { idChecked: true, note: 'national ID checked' });
      assert.equal(paid.status, 201, JSON.stringify(paid.body));
      assert.equal(paid.body.data.withdrawal.status, 'paid');
      assert.equal(paid.body.data.cashEntry.entryType, 'withdrawal_payout');
      assert.equal(await shopCash(shop.id), '69750', '100.000 in - 30.250 out');
      const twice = await cashier.browser.post(`/v1/shop/payouts/${w.id}`, { idChecked: true });
      assert.equal(twice.status, 200);
      assert.equal(twice.body.data.replayed, true);
      const byOther = await otherCashier.browser.post(`/v1/shop/payouts/${w.id}`, { idChecked: true });
      assert.equal(byOther.status, 409);
      assert.equal(byOther.body.error.code, 'withdrawal_not_pending');
      assert.equal(await shopCash(shop.id), '69750');
      const cancel = await player.browser.post(`/v1/account/withdrawals/${w.id}/cancel`);
      assert.equal(cancel.status, 409);
      assert.equal(await balanceOf(player.browser), '69750');

      const list = await player.browser.get('/v1/account/withdrawals');
      assert.equal(list.body.data.items[0].status, 'paid');
      assert.equal(list.body.data.items[0].paidShop.code, shop.code);
      const staffView = await manager.get(`/v1/admin/withdrawals/${w.id}`);
      assert.equal(staffView.body.data.withdrawal.paidBy.username, cashier.username);
      assert.equal(staffView.body.data.withdrawal.idCheckNote, 'national ID checked');
    });

    it('lets only one of two cashiers pay the same request at the same time', async () => {
      const shop = await createShop();
      const a = await createCashier(shop.id);
      const b = await createCashier(shop.id);
      const player = await fundedPlayer(shop.id, a.browser, '50');
      const w = (await player.browser.post('/v1/account/withdrawals', { amount: '40', idempotencyKey: key() })).body.data.withdrawal;
      const [ra, rb] = await Promise.all([a.browser.post(`/v1/shop/payouts/${w.id}`, { idChecked: true }), b.browser.post(`/v1/shop/payouts/${w.id}`, { idChecked: true })]);
      const statuses = [ra.status, rb.status].sort();
      assert.deepEqual(statuses, [201, 409]);
      assert.equal(await shopCash(shop.id), '10000');
    });

    it('refuses a payout the shop cannot cover, and keeps the request pending', async () => {
      const shopA = await createShop();
      const shopB = await createShop();
      const cashierA = await createCashier(shopA.id);
      const cashierB = await createCashier(shopB.id);
      const player = await fundedPlayer(shopA.id, cashierA.browser, '80');
      const w = (await player.browser.post('/v1/account/withdrawals', { amount: '80', idempotencyKey: key() })).body.data.withdrawal;
      const r = await cashierB.browser.post(`/v1/shop/payouts/${w.id}`, { idChecked: true });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'shop_cash_insufficient');
      // head office brings cash to shop B, then it can pay
      const float = await manager.post(`/v1/admin/shops/${shopB.id}/cash`, { entryType: 'float_in', amount: '500', reference: 'bag 12', idempotencyKey: key() });
      assert.equal(float.status, 201, JSON.stringify(float.body));
      const ok = await cashierB.browser.post(`/v1/shop/payouts/${w.id}`, { idChecked: true });
      assert.equal(ok.status, 201);
      assert.equal(await shopCash(shopB.id), '420000');
    });

    it('returns the money when the player cancels or head office rejects', async () => {
      const shop = await createShop();
      const cashier = await createCashier(shop.id);
      const player = await fundedPlayer(shop.id, cashier.browser, '100');
      const w1 = (await player.browser.post('/v1/account/withdrawals', { amount: '10', idempotencyKey: key() })).body.data.withdrawal;
      const w2 = (await player.browser.post('/v1/account/withdrawals', { amount: '20', idempotencyKey: key() })).body.data.withdrawal;
      assert.equal(await balanceOf(player.browser), '70000');
      const cancelled = await player.browser.post(`/v1/account/withdrawals/${w1.id}/cancel`);
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.body.data.withdrawal.status, 'cancelled');
      assert.equal(await balanceOf(player.browser), '80000');
      const noReason = await manager.post(`/v1/admin/withdrawals/${w2.id}/reject`, { reason: '' });
      assert.equal(noReason.status, 422);
      const rejected = await manager.post(`/v1/admin/withdrawals/${w2.id}/reject`, { reason: 'Identity could not be confirmed' });
      assert.equal(rejected.status, 200, JSON.stringify(rejected.body));
      assert.equal(await balanceOf(player.browser), '100000');
      const mine = await player.browser.get('/v1/account/withdrawals');
      const rejectedItem = mine.body.data.items.find((i: { id: string }) => i.id === w2.id);
      assert.equal(rejectedItem.closeReason, 'Identity could not be confirmed');
      const statement = (await player.browser.get('/v1/account/transactions')).body.data.items.map((i: { entryType: string }) => i.entryType);
      assert.deepEqual(statement.slice(0, 4), ['withdrawal_release', 'withdrawal_release', 'withdrawal_request', 'withdrawal_request']);
      // another player cannot cancel someone else's request
      const stranger = await registerPlayer(server);
      const w3 = (await player.browser.post('/v1/account/withdrawals', { amount: '1', idempotencyKey: key() })).body.data.withdrawal;
      assert.equal((await stranger.browser.post(`/v1/account/withdrawals/${w3.id}/cancel`)).status, 404);
    });

    it('expires an uncollected request and returns the money', async () => {
      const shop = await createShop();
      const cashier = await createCashier(shop.id);
      const player = await fundedPlayer(shop.id, cashier.browser, '40');
      const walletRow = await server.db.query<{ id: string }>("select id::text from wallets where user_id = $1::uuid and kind = 'main'", [player.id]);
      void walletRow;
      const created = await server.db.query<{ o_id: string }>(
        "select o_id::text from withdrawal_create($1::uuid, 25000, 'ABCDE23456', now() + interval '600 milliseconds', null, $2)",
        [player.id, key()],
      );
      const id = (created.rows[0] as { o_id: string }).o_id;
      assert.equal(await balanceOf(player.browser), '15000');
      await new Promise((resolve) => setTimeout(resolve, 900));
      const lookup = await cashier.browser.post('/v1/shop/payouts/lookup', { code: 'ABCDE-23456', account: player.account.username });
      assert.equal(lookup.body.data.payable, false);
      assert.equal(lookup.body.data.blockedBy, 'withdrawal_expired');
      const pay = await cashier.browser.post(`/v1/shop/payouts/${id}`, { idChecked: true });
      assert.equal(pay.body.error.code, 'withdrawal_expired');
      const released = await expireDueWithdrawals(server.db);
      assert.ok(released >= 1);
      assert.equal(await balanceOf(player.browser), '40000');
      const list = await player.browser.get('/v1/account/withdrawals');
      assert.equal(list.body.data.items.find((i: { id: string }) => i.id === id).status, 'expired');
    });

    it('can be switched off by the Super Admin, and blocks closing an account with a pending request', async () => {
      const shop = await createShop();
      const cashier = await createCashier(shop.id);
      const player = await fundedPlayer(shop.id, cashier.browser, '10');
      await player.browser.post('/v1/account/withdrawals', { amount: '10', idempotencyKey: key() });
      const close = await manager.patch(`/v1/admin/players/${player.id}`, { status: 'closed', reason: 'player asked to close' });
      assert.equal(close.status, 409);
      assert.equal(close.body.error.fields.status, 'pendingWithdrawals');

      const off = await boss.put('/v1/admin/settings/withdrawals_open', { value: false });
      assert.equal(off.status, 200);
      assert.equal(off.body.data.settings.withdrawals_open, false);
      const other = await fundedPlayer(shop.id, cashier.browser, '10');
      const refused = await other.browser.post('/v1/account/withdrawals', { amount: '5', idempotencyKey: key() });
      assert.equal(refused.status, 403);
      assert.equal(refused.body.error.code, 'withdrawals_closed');
      await boss.put('/v1/admin/settings/withdrawals_open', { value: true });
      const badHours = await boss.put('/v1/admin/settings/withdrawal_expiry_hours', { value: 0 });
      assert.equal(badHours.status, 422);
      const hours = await boss.put('/v1/admin/settings/withdrawal_expiry_hours', { value: 48 });
      assert.equal(hours.body.data.settings.withdrawal_expiry_hours, 48);
      const config = await server.browser().get('/v1/public/config');
      assert.equal(config.body.data.withdrawalExpiryHours, 48);
    });
  });

  describe('shop cash (head office) and reports', () => {
    it('records float, collection and corrections; never below zero; corrections need a reason', async () => {
      const shop = await createShop();
      const post = (body: Record<string, unknown>) => manager.post(`/v1/admin/shops/${shop.id}/cash`, { idempotencyKey: key(), ...body });
      assert.equal((await post({ entryType: 'float_in', amount: '300' })).status, 201);
      const tooMuch = await post({ entryType: 'cash_collection', amount: '300.001' });
      assert.equal(tooMuch.status, 409);
      assert.equal(tooMuch.body.error.code, 'shop_cash_insufficient');
      assert.equal((await post({ entryType: 'cash_collection', amount: '250' })).status, 201);
      const noReason = await post({ entryType: 'adjustment_debit', amount: '1' });
      assert.equal(noReason.status, 422);
      assert.equal(noReason.body.error.code, 'reason_required');
      assert.equal((await post({ entryType: 'adjustment_debit', amount: '1', reason: 'counted 1 TND short' })).status, 201);
      assert.equal(await shopCash(shop.id), '49000');
      assert.equal((await viewer.post(`/v1/admin/shops/${shop.id}/cash`, { entryType: 'float_in', amount: '1', idempotencyKey: key() })).status, 403);
      const cash = await viewer.get(`/v1/admin/shops/${shop.id}/cash`);
      assert.deepEqual(cash.body.data.items.map((i: { entryType: string }) => i.entryType), ['adjustment_debit', 'cash_collection', 'float_in']);
    });

    it('records cash counts with the difference (shop manager) and reports per shop and worker', async () => {
      const shop = await createShop();
      const boss1 = await createCashier(shop.id, 'manager');
      const clerk = await createCashier(shop.id, 'cashier');
      const player = await registerPlayer(server);
      await clerk.browser.post('/v1/shop/deposits', { playerId: player.id, amount: '20', idempotencyKey: key() });
      await boss1.browser.post('/v1/shop/deposits', { playerId: player.id, amount: '5', idempotencyKey: key() });
      assert.equal((await clerk.browser.post('/v1/shop/cash-counts', { counted: '25' })).status, 403);
      const count = await boss1.browser.post('/v1/shop/cash-counts', { counted: '24.500', note: 'end of day' });
      assert.equal(count.status, 201, JSON.stringify(count.body));
      assert.deepEqual(count.body.data.count.difference, { amountMinor: '-500', currency: 'TND' });
      const summary = await boss1.browser.get('/v1/shop/summary');
      assert.equal(summary.body.data.shopToday.deposits.count, 2);
      assert.equal(summary.body.data.mine.deposits.count, 1);
      const mine = await clerk.browser.get('/v1/shop/transactions');
      assert.equal(mine.body.data.items.length, 1);
      assert.equal((await clerk.browser.get('/v1/shop/transactions?scope=shop')).status, 403);
      const all = await boss1.browser.get('/v1/shop/transactions?scope=shop');
      assert.equal(all.body.data.items.length, 2);

      const from = new Date(Date.now() - 3_600_000).toISOString();
      const to = new Date(Date.now() + 3_600_000).toISOString();
      const report = await viewer.get(`/v1/admin/reports/shops?from=${from}&to=${to}&shopId=${shop.id}`);
      assert.equal(report.status, 200, JSON.stringify(report.body));
      const row = report.body.data.shops[0];
      assert.equal(row.deposits.count, 2);
      assert.deepEqual(row.deposits.total, { amountMinor: '25000', currency: 'TND' });
      assert.equal(report.body.data.workers.length, 2);
    });

    it('closes a shop only when its cash is zero, and its workers can no longer sign in', async () => {
      const shop = await createShop();
      const clerk = await createCashier(shop.id);
      const player = await registerPlayer(server);
      await clerk.browser.post('/v1/shop/deposits', { playerId: player.id, amount: '7', idempotencyKey: key() });
      const refuse = await manager.put(`/v1/admin/shops/${shop.id}`, { code: shop.code, name: 'x', currency: 'TND', status: 'closed' });
      assert.equal(refuse.status, 409);
      assert.equal(refuse.body.error.fields.status, 'cashNotZero');
      await manager.post(`/v1/admin/shops/${shop.id}/cash`, { entryType: 'cash_collection', amount: '7', idempotencyKey: key() });
      const closed = await manager.put(`/v1/admin/shops/${shop.id}`, { code: shop.code, name: 'x', currency: 'TND', status: 'closed' });
      assert.equal(closed.status, 200);
      const login = await server.browser().post('/v1/auth/login', { identifier: clerk.username, password: STRONG_PASSWORD });
      assert.equal(login.status, 403);
      const reopen = await manager.put(`/v1/admin/shops/${shop.id}`, { code: shop.code, name: 'x', currency: 'TND', status: 'active' });
      assert.equal(reopen.status, 409);
    });

    it('keeps every wallet and every shop consistent with its ledger', async () => {
      const ledger = await manager.get('/v1/admin/reports/shop-cash-health');
      assert.equal(ledger.status, 200);
      assert.equal(ledger.body.data.ok, true, JSON.stringify(ledger.body.data.problems));
      const wallets = await server.db.query('select * from ledger_verify(null)');
      assert.equal(wallets.rowCount, 0);
      const dash = await boss.get('/v1/admin/dashboard');
      assert.ok(Array.isArray(dash.body.data.shopCash));
      assert.ok(Array.isArray(dash.body.data.pendingWithdrawals));
    });
  });

  describe('database guarantees', () => {
    it('refuses direct changes to shop cash, withdrawals and the cash ledger', async () => {
      const shop = await createShop();
      await assert.rejects(server.db.query('update shops set cash_balance_minor = 1000 where id = $1::bigint', [shop.id]), /shop_cash_post/);
      await assert.rejects(server.db.query('delete from shops where id = $1::bigint', [shop.id]), /never deleted/);
      await assert.rejects(server.db.query('update shop_cash_entries set amount_minor = 1'), /append-only/);
      const player = await registerPlayer(server);
      await assert.rejects(
        server.db.query(
          `insert into withdrawal_requests (code, user_id, wallet_id, currency, amount_minor, hold_entry_id, expires_at)
           select 'ZZZZZ22222', u.id, w.id, 'TND', 1, 1, now() + interval '1 day' from users u join wallets w on w.user_id = u.id where u.id = $1::uuid`,
          [player.id],
        ),
        /withdrawal_\* functions/,
      );
    });
  });
});
