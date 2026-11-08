import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { TEST_DATABASE_URL } from '@aurum/db/testing';
import { createStaff, createSuperAdminAccount, registerPlayer, signedIn, startServer, unique } from './helpers.ts';
import type { Account, Browser, TestServer } from './helpers.ts';

describe('balance management', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let server: TestServer;
  let operator: Browser;
  let operatorAccount: Account;
  let viewer: Browser;
  let boss: Browser;

  before(async () => {
    server = await startServer();
    operatorAccount = await createStaff(server, { permissions: ['balances.manage', 'balances.view', 'users.view', 'reports.view', 'audit.view'] });
    operator = await signedIn(server, operatorAccount);
    viewer = await signedIn(server, await createStaff(server, { permissions: ['balances.view'] }));
    boss = await signedIn(server, await createSuperAdminAccount(server));
  });
  after(async () => {
    await server?.stop();
  });

  const key = () => `key-${unique()}`;
  const post = (browser: Browser, playerId: string, body: Record<string, unknown>) =>
    browser.post(`/v1/admin/players/${playerId}/balance`, { idempotencyKey: key(), ...body });
  const balanceOf = async (player: Browser) => (await player.get('/v1/auth/me')).body.data.user.wallet.balance.amountMinor as string;

  describe('deposits and withdrawals', () => {
    it('records a deposit as a ledger entry with before/after balances and the operator', async () => {
      const p = await registerPlayer(server);
      const r = await post(operator, p.id, { entryType: 'deposit', amount: '100.500', reference: 'cash receipt 17' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const { entry, replayed, balance } = r.body.data;
      assert.equal(replayed, false);
      assert.deepEqual(entry.amount, { amountMinor: '100500', currency: 'TND' });
      assert.deepEqual(entry.balanceBefore, { amountMinor: '0', currency: 'TND' });
      assert.deepEqual(entry.balanceAfter, { amountMinor: '100500', currency: 'TND' });
      assert.deepEqual(balance, { amountMinor: '100500', currency: 'TND' });
      assert.equal(entry.entryType, 'deposit');
      assert.equal(entry.direction, 1);
      assert.equal(entry.reference, 'cash receipt 17');
      assert.equal(entry.operator.id, operatorAccount.id);
      assert.equal(await balanceOf(p.browser), '100500');
    });

    it('withdraws, and refuses to go below zero without recording anything', async () => {
      const p = await registerPlayer(server);
      await post(operator, p.id, { entryType: 'deposit', amount: '50' });
      const ok = await post(operator, p.id, { entryType: 'withdrawal', amount: '20.250' });
      assert.equal(ok.status, 201);
      assert.equal(ok.body.data.entry.balanceAfter.amountMinor, '29750');
      const tooMuch = await post(operator, p.id, { entryType: 'withdrawal', amount: '29.751' });
      assert.equal(tooMuch.status, 409);
      assert.equal(tooMuch.body.error.code, 'insufficient_funds');
      assert.equal(await balanceOf(p.browser), '29750');
      const all = await operator.get(`/v1/admin/players/${p.id}/ledger`);
      assert.equal(all.body.data.items.length, 2);
      const exact = await post(operator, p.id, { entryType: 'withdrawal', amount: '29.750' });
      assert.equal(exact.status, 201);
      assert.equal(await balanceOf(p.browser), '0');
    });

    it('replays a retried request instead of posting it twice, and rejects a reused key with other data', async () => {
      const p = await registerPlayer(server);
      const idempotencyKey = key();
      const first = await post(operator, p.id, { idempotencyKey, entryType: 'deposit', amount: '10' });
      const again = await post(operator, p.id, { idempotencyKey, entryType: 'deposit', amount: '10' });
      assert.equal(first.status, 201);
      assert.equal(again.status, 200);
      assert.equal(again.body.data.replayed, true);
      assert.equal(again.body.data.entry.id, first.body.data.entry.id);
      assert.equal(await balanceOf(p.browser), '10000');
      const other = await post(operator, p.id, { idempotencyKey, entryType: 'deposit', amount: '11' });
      assert.equal(other.status, 409);
      assert.equal(other.body.error.code, 'idempotency_key_reuse');
      const otherType = await post(operator, p.id, { idempotencyKey, entryType: 'withdrawal', amount: '10' });
      assert.equal(otherType.body.error.code, 'idempotency_key_reuse');
      assert.equal(await balanceOf(p.browser), '10000');
    });

    it('keys are private to each operator', async () => {
      const p = await registerPlayer(server);
      const second = await signedIn(server, await createStaff(server, { permissions: ['balances.manage'] }));
      const idempotencyKey = key();
      const a = await post(operator, p.id, { idempotencyKey, entryType: 'deposit', amount: '1' });
      const b = await post(second, p.id, { idempotencyKey, entryType: 'deposit', amount: '1' });
      assert.equal(a.status, 201);
      assert.equal(b.status, 201);
      assert.equal(await balanceOf(p.browser), '2000');
    });

    it('parallel identical requests post exactly once', async () => {
      const p = await registerPlayer(server);
      const idempotencyKey = key();
      const results = await Promise.all(Array.from({ length: 10 }, () => post(operator, p.id, { idempotencyKey, entryType: 'deposit', amount: '5' })));
      assert.equal(results.filter((r) => r.status === 201).length, 1, JSON.stringify(results.map((r) => r.status)));
      assert.equal(results.filter((r) => r.status === 200).length, 9);
      assert.equal(await balanceOf(p.browser), '5000');
    });

    it('parallel withdrawals never overdraw the wallet', async () => {
      const p = await registerPlayer(server);
      await post(operator, p.id, { entryType: 'deposit', amount: '100' });
      const results = await Promise.all(Array.from({ length: 20 }, () => post(operator, p.id, { entryType: 'withdrawal', amount: '10' })));
      assert.equal(results.filter((r) => r.status === 201).length, 10);
      assert.equal(results.filter((r) => r.status === 409 && r.body.error.code === 'insufficient_funds').length, 10);
      assert.equal(await balanceOf(p.browser), '0');
      const health = await operator.get('/v1/admin/reports/ledger-health');
      assert.equal(health.body.data.ok, true);
    });
  });

  describe('amounts', () => {
    const bad: [string, unknown, number, string][] = [
      ['thousands separator', '1,000.50', 422, 'ambiguous_separator'],
      ['two decimal separators', '1.000.5', 422, 'ambiguous_separator'],
      ['too many decimals for TND (3)', '10.1234', 422, 'too_many_decimals'],
      ['negative', '-5', 422, 'negative_not_allowed'],
      ['zero', '0', 422, 'invalid_amount'],
      ['text', 'abc', 422, 'invalid_amount'],
      ['exponent', '1e3', 422, 'invalid_amount'],
      ['a JSON number instead of a string', 12.5, 422, 'validation'],
      ['one minor unit above the supported maximum', '1000000000000.001', 422, 'out_of_range'],
    ];
    for (const [label, amount, status, code] of bad) {
      it(`rejects ${label}`, async () => {
        const p = await registerPlayer(server);
        const r = await post(operator, p.id, { entryType: 'deposit', amount });
        assert.equal(r.status, status, JSON.stringify(r.body));
        assert.equal(r.body.error.code, code);
        assert.equal(await balanceOf(p.browser), '0');
      });
    }

    it('accepts exactly the supported maximum (10^15 minor units)', async () => {
      const p = await registerPlayer(server);
      const r = await post(operator, p.id, { entryType: 'deposit', amount: '1000000000000.000' });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal(await balanceOf(p.browser), '1000000000000000');
    });

    it('accepts a decimal comma and Arabic-Indic digits', async () => {
      const p = await registerPlayer(server);
      assert.equal((await post(operator, p.id, { entryType: 'deposit', amount: '12,5' })).body.data.entry.amount.amountMinor, '12500');
      assert.equal((await post(operator, p.id, { entryType: 'deposit', amount: '١٢٫٥' })).body.data.entry.amount.amountMinor, '12500');
      assert.equal(await balanceOf(p.browser), '25000');
    });

    it('uses the decimals of the wallet currency (EUR has 2)', async () => {
      const p = await registerPlayer(server, { currency: 'EUR' });
      const ok = await post(operator, p.id, { entryType: 'deposit', amount: '10.50' });
      assert.equal(ok.body.data.entry.amount.amountMinor, '1050');
      assert.equal(ok.body.data.entry.amount.currency, 'EUR');
      const bad = await post(operator, p.id, { entryType: 'deposit', amount: '10.505' });
      assert.equal(bad.body.error.code, 'too_many_decimals');
    });
  });

  describe('adjustments', () => {
    it('need a reason of at least 3 characters', async () => {
      const p = await registerPlayer(server);
      let r = await post(operator, p.id, { entryType: 'adjustment_credit', amount: '5' });
      assert.equal(r.body.error.code, 'reason_required');
      r = await post(operator, p.id, { entryType: 'adjustment_credit', amount: '5', reason: 'ab' });
      assert.equal(r.body.error.code, 'reason_required');
      r = await post(operator, p.id, { entryType: 'adjustment_credit', amount: '5', reason: 'Manual correction #88' });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.entry.reason, 'Manual correction #88');
      r = await post(operator, p.id, { entryType: 'adjustment_debit', amount: '2', reason: 'Duplicate credit' });
      assert.equal(r.status, 201);
      assert.equal(await balanceOf(p.browser), '3000');
    });

    it('cannot post system entry types (bets) from the dashboard', async () => {
      const p = await registerPlayer(server);
      for (const entryType of ['bet_stake', 'bet_win', 'bet_refund', 'bonus_credit', 'made_up']) {
        const r = await post(operator, p.id, { entryType, amount: '1' });
        assert.equal(r.status, 422, entryType);
      }
    });
  });

  describe('conversion', () => {
    it('credits the wallet currency using the rate typed by the operator and keeps the original amount', async () => {
      const p = await registerPlayer(server);
      const r = await post(operator, p.id, { entryType: 'deposit', original: { amount: '10.00', currency: 'EUR', rate: '3.4' } });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      const entry = r.body.data.entry;
      assert.deepEqual(entry.amount, { amountMinor: '34000', currency: 'TND' });
      assert.deepEqual(entry.original, { amount: { amountMinor: '1000', currency: 'EUR' }, rate: '3.4' });
      assert.equal(await balanceOf(p.browser), '34000');
    });

    it('rounds half up, once, and stores the exact figures', async () => {
      const p = await registerPlayer(server);
      const r = await post(operator, p.id, { entryType: 'deposit', original: { amount: '0.01', currency: 'EUR', rate: '3.3333' } });
      assert.equal(r.status, 201);
      assert.equal(r.body.data.entry.amount.amountMinor, '33'); // 0.033333 TND -> 0.033
      const half = await post(operator, p.id, { entryType: 'deposit', original: { amount: '0.01', currency: 'EUR', rate: '3.35' } });
      assert.equal(half.body.data.entry.amount.amountMinor, '34'); // 0.0335 TND -> 0.034 (half up)
    });

    it('refuses nonsense combinations', async () => {
      const p = await registerPlayer(server);
      const both = await post(operator, p.id, { entryType: 'deposit', amount: '1', original: { amount: '1', currency: 'EUR', rate: '3' } });
      assert.equal(both.status, 422);
      const neither = await post(operator, p.id, { entryType: 'deposit' });
      assert.equal(neither.status, 422);
      const same = await post(operator, p.id, { entryType: 'deposit', original: { amount: '1', currency: 'TND', rate: '1' } });
      assert.equal(same.status, 422);
      const unknown = await post(operator, p.id, { entryType: 'deposit', original: { amount: '1', currency: 'XYZ', rate: '2' } });
      assert.equal(unknown.body.error.code, 'currency_unavailable');
      const badRate = await post(operator, p.id, { entryType: 'deposit', original: { amount: '1', currency: 'EUR', rate: '0' } });
      assert.equal(badRate.body.error.code, 'invalid_rate');
      const longRate = await post(operator, p.id, { entryType: 'deposit', original: { amount: '1', currency: 'EUR', rate: '1.1234567890123' } });
      assert.equal(longRate.body.error.code, 'invalid_rate');
      assert.equal(await balanceOf(p.browser), '0');
    });
  });

  describe('who can be credited', () => {
    it('only players: not staff, not unknown ids', async () => {
      const r1 = await post(operator, operatorAccount.id, { entryType: 'deposit', amount: '1' });
      assert.equal(r1.status, 404);
      assert.equal(r1.body.error.code, 'user_not_found');
      const r2 = await post(operator, '00000000-0000-4000-8000-0000000000aa', { entryType: 'deposit', amount: '1' });
      assert.equal(r2.status, 404);
      const r3 = await post(operator, 'not-a-uuid', { entryType: 'deposit', amount: '1' });
      assert.equal(r3.status, 404);
    });

    it('closed accounts receive nothing; suspended accounts can still be credited by staff', async () => {
      const p = await registerPlayer(server);
      await server.db.query("update users set status = 'suspended' where id = $1::uuid", [p.id]);
      assert.equal((await post(operator, p.id, { entryType: 'deposit', amount: '1' })).status, 201);
      await server.db.query('update wallets set balance_minor = balance_minor where user_id = $1::uuid', [p.id]);
      await server.db.query("update users set status = 'closed' where id = $1::uuid", [p.id]);
      const r = await post(operator, p.id, { entryType: 'deposit', amount: '1' });
      assert.equal(r.status, 409);
      assert.equal(r.body.error.code, 'account_not_postable');
    });
  });

  describe('statements', () => {
    it('lists entries newest first with a stable cursor and the balance chain', async () => {
      const p = await registerPlayer(server);
      for (let i = 1; i <= 7; i++) await post(operator, p.id, { entryType: 'deposit', amount: String(i) });
      const first = await operator.get(`/v1/admin/players/${p.id}/ledger?limit=3`);
      assert.equal(first.body.data.items.length, 3);
      assert.ok(first.body.data.nextCursor);
      const second = await operator.get(`/v1/admin/players/${p.id}/ledger?limit=3&before=${first.body.data.nextCursor}`);
      const third = await operator.get(`/v1/admin/players/${p.id}/ledger?limit=3&before=${second.body.data.nextCursor}`);
      const all = [...first.body.data.items, ...second.body.data.items, ...third.body.data.items];
      assert.equal(all.length, 7);
      assert.equal(third.body.data.nextCursor, null);
      assert.equal(new Set(all.map((e: { id: string }) => e.id)).size, 7);
      for (let i = 0; i < all.length - 1; i++) {
        assert.ok(BigInt(all[i].id) > BigInt(all[i + 1].id));
        assert.equal(all[i + 1].balanceAfter.amountMinor, all[i].balanceBefore.amountMinor);
      }
    });

    it('filters by type, currency and user', async () => {
      const tnd = await registerPlayer(server);
      const eur = await registerPlayer(server, { currency: 'EUR' });
      await post(operator, tnd.id, { entryType: 'deposit', amount: '10' });
      await post(operator, tnd.id, { entryType: 'withdrawal', amount: '1' });
      await post(operator, eur.id, { entryType: 'deposit', amount: '10' });
      const byType = await operator.get(`/v1/admin/ledger?userId=${tnd.id}&type=withdrawal`);
      assert.equal(byType.body.data.items.length, 1);
      const byCurrency = await operator.get('/v1/admin/ledger?currency=EUR&limit=200');
      assert.ok(byCurrency.body.data.items.length >= 1);
      assert.ok(byCurrency.body.data.items.every((e: { amount: { currency: string } }) => e.amount.currency === 'EUR'));
      const none = await operator.get(`/v1/admin/ledger?userId=${eur.id}&type=withdrawal`);
      assert.equal(none.body.data.items.length, 0);
      const badFilter = await operator.get('/v1/admin/ledger?type=nonsense');
      assert.equal(badFilter.status, 422);
    });

    it('lets a staff member with only balances.view read but not post', async () => {
      const p = await registerPlayer(server);
      await post(operator, p.id, { entryType: 'deposit', amount: '3' });
      assert.equal((await viewer.get(`/v1/admin/players/${p.id}/ledger`)).status, 200);
      assert.equal((await post(viewer, p.id, { entryType: 'deposit', amount: '3' })).status, 403);
      assert.equal(await balanceOf(p.browser), '3000');
    });

    it('shows a player only their own movements, without staff names or internal reasons', async () => {
      const a = await registerPlayer(server);
      const b = await registerPlayer(server);
      await post(operator, a.id, { entryType: 'deposit', amount: '8', reference: 'receipt A' });
      await post(operator, a.id, { entryType: 'adjustment_credit', amount: '1', reason: 'internal note' });
      await post(operator, b.id, { entryType: 'deposit', amount: '9' });
      const r = await a.browser.get('/v1/account/transactions');
      assert.equal(r.status, 200);
      assert.equal(r.body.data.items.length, 2);
      const text = JSON.stringify(r.body);
      assert.ok(!text.includes('internal note'));
      assert.ok(!text.includes(operatorAccount.username));
      assert.ok(!text.includes('operator'));
      assert.deepEqual(Object.keys(r.body.data.items[0]).sort(), ['amount', 'balanceAfter', 'createdAt', 'direction', 'entryType', 'id', 'reference']);
      assert.equal(r.body.data.items[1].reference, 'receipt A');
      const wallet = await a.browser.get('/v1/account/wallet');
      assert.deepEqual(wallet.body.data.wallet.balance, { amountMinor: '9000', currency: 'TND' });
    });
  });

  describe('indicative display currency', () => {
    it('shows an approximate amount only from a rate the Super Admin entered, rounded down, and never changes the balance', async () => {
      const p = await registerPlayer(server);
      await post(operator, p.id, { entryType: 'deposit', amount: '100.999' });
      assert.equal((await p.browser.patch('/v1/account/preferences', { displayCurrency: 'EUR' })).status, 200);
      let wallet = await p.browser.get('/v1/account/wallet');
      assert.equal(wallet.body.data.indicative, null, 'no rate has been entered yet');
      const rate = await boss.post('/v1/admin/exchange-rates', { base: 'TND', quote: 'EUR', rate: '0.3', source: 'Central bank, manual entry' });
      assert.equal(rate.status, 201, JSON.stringify(rate.body));
      wallet = await p.browser.get('/v1/account/wallet');
      assert.equal(wallet.body.data.indicative.currency, 'EUR');
      assert.equal(wallet.body.data.indicative.amountMinor, '3029'); // 100.999 * 0.3 = 30.2997 -> 30.29 (down)
      assert.equal(wallet.body.data.indicative.rate, '0.3');
      assert.equal(wallet.body.data.indicative.source, 'Central bank, manual entry');
      assert.deepEqual(wallet.body.data.wallet.balance, { amountMinor: '100999', currency: 'TND' });
      assert.equal((await boss.post('/v1/admin/exchange-rates', { base: 'EUR', quote: 'EUR', rate: '1', source: 'x' })).status, 422);
    });
  });

  describe('reports and audit trail', () => {
    it('totals per currency without ever adding currencies together', async () => {
      const db = server.db;
      const before = await db.query<{ currency: string; total: string }>("select currency, coalesce(sum(balance_minor),0)::text as total from wallets group by currency");
      const p1 = await registerPlayer(server);
      const p2 = await registerPlayer(server, { currency: 'EUR' });
      await post(operator, p1.id, { entryType: 'deposit', amount: '1.000' });
      await post(operator, p2.id, { entryType: 'deposit', amount: '1.00' });
      const r = await operator.get('/v1/admin/dashboard');
      assert.equal(r.status, 200);
      const totals = new Map<string, string>(r.body.data.balances.map((b: { currency: string; total: { amountMinor: string } }) => [b.currency, b.total.amountMinor]));
      const sums = new Map(before.rows.map((row) => [row.currency, BigInt(row.total)]));
      assert.equal(totals.get('TND'), String((sums.get('TND') ?? 0n) + 1000n));
      assert.equal(totals.get('EUR'), String((sums.get('EUR') ?? 0n) + 100n));
      assert.ok(r.body.data.balances.every((b: { total: { currency: string }; currency: string }) => b.total.currency === b.currency));
      assert.equal(r.body.data.players.total, r.body.data.players.byStatus.active + r.body.data.players.byStatus.suspended + r.body.data.players.byStatus.closed);
    });

    it('verifies the books and writes an audit entry for each posting (not for replays)', async () => {
      const p = await registerPlayer(server);
      const idempotencyKey = key();
      await post(operator, p.id, { idempotencyKey, entryType: 'deposit', amount: '4', reference: 'audit check' });
      await post(operator, p.id, { idempotencyKey, entryType: 'deposit', amount: '4', reference: 'audit check' });
      const audit = await operator.get(`/v1/admin/audit?action=balance.post&targetId=${p.id}`);
      assert.equal(audit.status, 200);
      assert.equal(audit.body.data.items.length, 1);
      const item = audit.body.data.items[0];
      assert.equal(item.actor.id, operatorAccount.id);
      assert.equal(item.targetId, p.id);
      assert.equal(item.details.amountMinor, '4000');
      assert.equal(item.details.balanceAfterMinor, '4000');
      assert.ok(item.ip);
      const health = await operator.get('/v1/admin/reports/ledger-health');
      assert.equal(health.body.data.ok, true);
      assert.deepEqual(health.body.data.problems, []);
    });
  });
});
