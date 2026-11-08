import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTestDatabase, TEST_DATABASE_URL } from '@aurum/db/testing';
import type { TestDatabase } from '@aurum/db/testing';
import { convertMinor, parseDecimalToMinor } from '@aurum/money';
import { AppError } from '@aurum/shared';
import { getWallet, getWalletByUser, listEntries, postEntry, totalsByCurrency, trimRate, verifyLedger } from '../src/index.ts';
import { makeAdmin, makePlayer, rng } from './helpers.ts';

describe('trimRate', () => {
  it('removes insignificant zeros only', () => {
    assert.equal(trimRate('3.350000000000'), '3.35');
    assert.equal(trimRate('3.000000000000'), '3');
    assert.equal(trimRate('10'), '10');
    assert.equal(trimRate('0.050000000000'), '0.05');
  });
});

describe('ledger on PostgreSQL', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let t: TestDatabase;
  let admin: string;
  before(async () => {
    t = await createTestDatabase();
    admin = await makeAdmin(t.db);
  });
  after(async () => {
    await t?.drop();
  });

  const deposit = (walletId: string, amount: bigint, key: string, extra: Record<string, unknown> = {}) =>
    postEntry(t.db, { walletId, entryType: 'deposit', amountMinor: amount, scope: 'admin', idempotencyKey: key, operatorId: admin, ...extra });

  it('posts a deposit and a withdrawal and keeps the chain', async () => {
    const p = await makePlayer(t.db);
    const d = await deposit(p.walletId, 10_000n, 'basic-1');
    assert.equal(d.replayed, false);
    assert.equal(d.balanceBeforeMinor, 0n);
    assert.equal(d.balanceAfterMinor, 10_000n);
    assert.equal(d.currency, 'TND');
    const w = await postEntry(t.db, { walletId: p.walletId, entryType: 'withdrawal', amountMinor: 2_500n, scope: 'admin', idempotencyKey: 'basic-2', operatorId: admin });
    assert.equal(w.balanceAfterMinor, 7_500n);
    assert.equal(w.direction, -1);
    const wallet = await getWalletByUser(t.db, p.userId);
    assert.equal(wallet?.balanceMinor, 7_500n);
    assert.equal(wallet?.version, '2');
    assert.deepEqual(await verifyLedger(t.db, p.walletId), []);
  });

  it('replays identical requests and rejects a reused key with other parameters', async () => {
    const p = await makePlayer(t.db);
    const first = await deposit(p.walletId, 500n, 'idem-1', { reference: 'receipt 1' });
    const again = await deposit(p.walletId, 500n, 'idem-1', { reference: 'receipt 1' });
    assert.equal(again.replayed, true);
    assert.equal(again.id, first.id);
    assert.equal((await getWalletByUser(t.db, p.userId))?.balanceMinor, 500n);
    await assert.rejects(
      () => deposit(p.walletId, 501n, 'idem-1', { reference: 'receipt 1' }),
      (e: unknown) => e instanceof AppError && e.code === 'idempotency_key_reuse',
    );
  });

  it('refuses overdrafts with insufficient_funds and leaves no trace', async () => {
    const p = await makePlayer(t.db);
    await deposit(p.walletId, 1_000n, 'od-1');
    await assert.rejects(
      () => postEntry(t.db, { walletId: p.walletId, entryType: 'withdrawal', amountMinor: 1_001n, scope: 'admin', idempotencyKey: 'od-2', operatorId: admin }),
      (e: unknown) => e instanceof AppError && e.code === 'insufficient_funds' && e.status === 409,
    );
    assert.equal((await listEntries(t.db, { walletId: p.walletId })).entries.length, 1);
  });

  it('validates input before touching the database', async () => {
    const p = await makePlayer(t.db);
    await assert.rejects(() => deposit(p.walletId, 0n, 'v-1'), (e: unknown) => e instanceof AppError && e.code === 'invalid_amount');
    await assert.rejects(() => deposit(p.walletId, 10n ** 15n + 1n, 'v-2'), (e: unknown) => e instanceof AppError && e.code === 'invalid_amount');
    await assert.rejects(
      () => postEntry(t.db, { walletId: p.walletId, entryType: 'adjustment_credit', amountMinor: 5n, scope: 'admin', idempotencyKey: 'v-3', operatorId: admin }),
      (e: unknown) => e instanceof AppError && e.code === 'reason_required',
    );
    await assert.rejects(
      () => postEntry(t.db, { walletId: '999999999', entryType: 'deposit', amountMinor: 5n, scope: 'admin', idempotencyKey: 'v-4', operatorId: admin }),
      (e: unknown) => e instanceof AppError && e.code === 'wallet_not_found',
    );
  });

  it('serialises concurrent credits on one wallet: no lost update', async () => {
    const p = await makePlayer(t.db);
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => deposit(p.walletId, BigInt(i + 1), `cc-${i}`)));
    assert.equal(results.filter((r) => !r.replayed).length, 60);
    const expected = BigInt((60 * 61) / 2);
    assert.equal((await getWalletByUser(t.db, p.userId))?.balanceMinor, expected);
    assert.deepEqual(await verifyLedger(t.db, p.walletId), []);
    // balance_before/after form an unbroken chain
    const { entries } = await listEntries(t.db, { walletId: p.walletId, limit: 100 });
    const ordered = [...entries].reverse();
    ordered.forEach((e, i) => {
      assert.equal(e.balanceBeforeMinor, i === 0 ? 0n : (ordered[i - 1] as typeof e).balanceAfterMinor);
    });
  });

  it('never overdraws under concurrent debits: exactly the affordable ones succeed', async () => {
    const p = await makePlayer(t.db);
    await deposit(p.walletId, 100n, 'cd-seed');
    const outcomes = await Promise.allSettled(
      Array.from({ length: 40 }, (_, i) =>
        postEntry(t.db, { walletId: p.walletId, entryType: 'withdrawal', amountMinor: 10n, scope: 'admin', idempotencyKey: `cd-${i}`, operatorId: admin }),
      ),
    );
    const ok = outcomes.filter((o) => o.status === 'fulfilled').length;
    const refused = outcomes.filter(
      (o) => o.status === 'rejected' && o.reason instanceof AppError && (o.reason as AppError).code === 'insufficient_funds',
    ).length;
    assert.equal(ok, 10);
    assert.equal(refused, 30);
    assert.equal((await getWalletByUser(t.db, p.userId))?.balanceMinor, 0n);
    assert.deepEqual(await verifyLedger(t.db, p.walletId), []);
  });

  it('posts a repeated idempotency key only once, even when sent in parallel', async () => {
    const p = await makePlayer(t.db);
    const results = await Promise.all(Array.from({ length: 25 }, () => deposit(p.walletId, 777n, 'same-key', { reference: 'r' })));
    assert.equal(results.filter((r) => !r.replayed).length, 1);
    assert.equal(new Set(results.map((r) => r.id)).size, 1);
    assert.equal((await getWalletByUser(t.db, p.userId))?.balanceMinor, 777n);
  });

  it('matches a simple model over a long random sequence (property test)', async () => {
    const random = rng(20261023);
    const players = await Promise.all([makePlayer(t.db), makePlayer(t.db), makePlayer(t.db)]);
    const model = new Map(players.map((p) => [p.walletId, 0n]));
    let refused = 0;
    let n = 0;
    for (let i = 0; i < 300; i++) {
      const p = players[Math.floor(random() * players.length)] as (typeof players)[number];
      const amount = BigInt(1 + Math.floor(random() * 5000));
      const credit = random() < 0.55;
      const balance = model.get(p.walletId) as bigint;
      const type = credit ? 'deposit' : 'withdrawal';
      const call = postEntry(t.db, { walletId: p.walletId, entryType: type, amountMinor: amount, scope: 'prop', idempotencyKey: `prop-${n++}`, operatorId: admin });
      if (!credit && amount > balance) {
        await assert.rejects(call, (e: unknown) => e instanceof AppError && e.code === 'insufficient_funds');
        refused++;
      } else {
        const r = await call;
        const next = credit ? balance + amount : balance - amount;
        assert.equal(r.balanceAfterMinor, next);
        model.set(p.walletId, next);
      }
    }
    assert.ok(refused > 0, 'the sequence should include refused withdrawals');
    for (const p of players) {
      assert.equal((await getWallet(t.db, p.walletId))?.balanceMinor, model.get(p.walletId));
    }
    assert.deepEqual(await verifyLedger(t.db), []);
  });

  it('agrees with the JavaScript money library on currency conversion (randomised)', async () => {
    const random = rng(424242);
    const p = await makePlayer(t.db, 'TND');
    let checked = 0;
    for (let i = 0; i < 120; i++) {
      const fromMinor = BigInt(1 + Math.floor(random() * 2_000_000));
      const intPart = Math.floor(random() * 12);
      const fracDigits = Math.floor(random() * 7);
      let frac = '';
      for (let k = 0; k < fracDigits; k++) frac += String(Math.floor(random() * 10));
      const rate = `${intPart}${frac ? `.${frac}` : ''}`;
      if (!/[1-9]/.test(rate)) continue;
      // EUR (2 decimals) -> TND (3 decimals), half-up
      const converted = convertMinor({ amountMinor: fromMinor, fromDecimals: 2, toDecimals: 3, rate });
      if (converted < 1n) continue;
      const r = await postEntry(t.db, {
        walletId: p.walletId, entryType: 'deposit', amountMinor: converted, scope: 'conv', idempotencyKey: `conv-${i}`, operatorId: admin,
        original: { amountMinor: fromMinor, currency: 'EUR', rate },
      });
      assert.equal(r.amountMinor, converted, `rate ${rate}, ${fromMinor} EUR cents`);
      checked++;
    }
    assert.ok(checked > 80, `only ${checked} cases were checked`);
    const { entries } = await listEntries(t.db, { walletId: p.walletId, limit: 3 });
    const e = entries[0];
    assert.ok(e?.original && e.original.currency === 'EUR');
    assert.match(e.original.rate, /^\d+(\.\d+)?$/);
  });

  it('lists entries newest first with keyset pagination and filters', async () => {
    const p = await makePlayer(t.db);
    for (let i = 0; i < 12; i++) await deposit(p.walletId, BigInt(100 + i), `pg-${i}`);
    await postEntry(t.db, { walletId: p.walletId, entryType: 'withdrawal', amountMinor: 50n, scope: 'admin', idempotencyKey: 'pg-w', operatorId: admin });
    const first = await listEntries(t.db, { userId: p.userId, limit: 5 });
    assert.equal(first.entries.length, 5);
    assert.ok(first.nextCursor);
    assert.equal(first.entries[0]?.entryType, 'withdrawal');
    const second = await listEntries(t.db, { userId: p.userId, limit: 5, beforeId: first.nextCursor as string });
    assert.equal(second.entries.length, 5);
    assert.ok(BigInt((second.entries[0] as { id: string }).id) < BigInt((first.entries[4] as { id: string }).id));
    const third = await listEntries(t.db, { userId: p.userId, limit: 5, beforeId: second.nextCursor as string });
    assert.equal(third.entries.length, 3);
    assert.equal(third.nextCursor, null);
    const onlyWithdrawals = await listEntries(t.db, { userId: p.userId, entryTypes: ['withdrawal'] });
    assert.equal(onlyWithdrawals.entries.length, 1);
    assert.equal(onlyWithdrawals.entries[0]?.operatorUsername?.startsWith('admin_'), true);
    const future = await listEntries(t.db, { userId: p.userId, from: '2999-01-01T00:00:00Z' });
    assert.equal(future.entries.length, 0);
    const none = await listEntries(t.db, { userId: p.userId, currency: 'EUR' });
    assert.equal(none.entries.length, 0);
  });

  it('adds balances per currency and never across currencies', async () => {
    const tnd = await makePlayer(t.db, 'TND');
    const eur = await makePlayer(t.db, 'EUR');
    await deposit(tnd.walletId, parseDecimalToMinor('10.000', 3), 'tot-1');
    await deposit(eur.walletId, parseDecimalToMinor('10.00', 2), 'tot-2');
    const totals = await totalsByCurrency(t.db);
    const byCurrency = new Map(totals.map((x) => [x.currency, x]));
    assert.ok(byCurrency.has('TND') && byCurrency.has('EUR'));
    assert.equal(totals.length, byCurrency.size, 'one row per currency');
    assert.ok((byCurrency.get('EUR') as { totalMinor: bigint }).totalMinor >= 1_000n);
  });

  it('detects tampering with ledger_verify', async () => {
    const p = await makePlayer(t.db);
    await deposit(p.walletId, 1_000n, 'ver-1');
    await t.db.transaction(async (tx) => {
      await tx.query("select set_config('app.ledger_post', 'on', true)");
      await tx.query('update wallets set balance_minor = balance_minor + 1 where id = $1::bigint', [p.walletId]);
    });
    const problems = await verifyLedger(t.db, p.walletId);
    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.problem, 'balance_mismatch');
    assert.equal(problems[0]?.expectedMinor, 1_000n);
    assert.equal(problems[0]?.actualMinor, 1_001n);
  });
});
