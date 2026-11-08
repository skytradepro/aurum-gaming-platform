import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { TEST_DATABASE_URL } from '@aurum/db/testing';
import { APILX_SIGN, apilxSign } from '../src/services/apilx-sign.ts';
import { sign as aggregatorSign } from '../src/services/aggregator.ts';
import { createSuperAdminAccount, registerPlayer, signedIn, startServer, unique } from './helpers.ts';
import type { TestServer } from './helpers.ts';

const APILX_SECRET = '1234567890123456';
const APILX_AGENT = 'TestAgentLX';
const GAME_EXT_ID = '90001234';
const AGG_SECRET = 'abcdefghijklmnop';
const AGG_NAME = 'test-agg';
/** Default welcome_gift_cents (50) on TND (3 decimals) => 0.500 in API balance responses. */
const WELCOME_TND = 0.5;

const apilxEnv = {
  APILX_AGENT_ID: APILX_AGENT,
  APILX_PRAGMATIC_API_URL: 'https://apilx-pragmatic.example.test',
  APILX_PRAGMATIC_TOKEN: 'apitoken01234567',
  APILX_PRAGMATIC_SECRET: APILX_SECRET,
  AGGREGATOR_NAME: AGG_NAME,
  AGGREGATOR_API_URL: 'https://aggregator.example.test',
  AGGREGATOR_OPERATOR_ID: 'operator-test-1',
  AGGREGATOR_SECRET: AGG_SECRET,
};

type ApilxOp = keyof typeof APILX_SIGN;

function signedApilx<T extends Record<string, unknown>>(body: T, op: ApilxOp): T & { sign: string } {
  return { ...body, sign: apilxSign(APILX_SECRET, APILX_SIGN[op](body)) };
}

async function apilxPost(server: TestServer, path: string, body: Record<string, unknown>) {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

async function aggPost(server: TestServer, path: string, body: Record<string, unknown>) {
  const raw = JSON.stringify(body);
  const response = await fetch(`${server.baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-signature': aggregatorSign(AGG_SECRET, raw) },
    body: raw,
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
}

async function accountNo(server: TestServer, userId: string): Promise<string> {
  const { rows } = await server.db.query<{ account_no: string }>('select account_no::text as account_no from users where id = $1::uuid', [userId]);
  const row = rows[0];
  if (!row) throw new Error('user missing');
  return row.account_no;
}

async function fundPlayer(server: TestServer, playerId: string, amount: string): Promise<void> {
  const staff = await createSuperAdminAccount(server);
  const browser = await signedIn(server, staff);
  const r = await browser.post(`/v1/admin/players/${playerId}/balance`, {
    idempotencyKey: `fund-${unique()}`,
    entryType: 'deposit',
    amount,
  });
  if (r.status !== 201) throw new Error(`fund failed: ${r.status} ${JSON.stringify(r.body)}`);
}

async function walletMinor(server: TestServer, walletId: string): Promise<bigint> {
  const { rows } = await server.db.query<{ balance_minor: string }>('select balance_minor::text from wallets where id = $1::bigint', [walletId]);
  return BigInt(rows[0]?.balance_minor ?? '0');
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('API LX wallet HTTP', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let server: TestServer;

  before(async () => {
    server = await startServer({ env: apilxEnv });
    await server.db.query(`update games set external_id = $1 where slug = 'gates-of-olympus'`, [GAME_EXT_ID]);
  });

  after(async () => {
    await server?.stop();
  });

  it('rejects invalid signature', async () => {
    const p = await registerPlayer(server);
    const userID = await accountNo(server, p.id);
    const body = { agentID: APILX_AGENT, userID, gameID: GAME_EXT_ID, sign: '0'.repeat(64) };
    const r = await apilxPost(server, '/v1/apilx/wallet/GetBalance', body);
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 3);
  });

  it('GetBalance returns funded balance', async () => {
    const p = await registerPlayer(server);
    await fundPlayer(server, p.id, '100');
    const userID = await accountNo(server, p.id);
    const body = signedApilx({ agentID: APILX_AGENT, userID, gameID: GAME_EXT_ID }, 'getBalance');
    const r = await apilxPost(server, '/v1/apilx/wallet/GetBalance', body);
    assert.equal(r.status, 200);
    assert.equal(r.body.code, 0);
    assert.equal(r.body.balance, 100 + WELCOME_TND);
  });

  it('Withdraw, Deposit, duplicate idempotency, insufficient funds, rollback', async () => {
    const p = await registerPlayer(server);
    await fundPlayer(server, p.id, '50');
    const userID = await accountNo(server, p.id);
    const roundID = `round-${unique()}`;
    const withdrawId = `w-${unique()}`;

    const withdraw = signedApilx(
      { agentID: APILX_AGENT, userID, amount: 10, transactionID: withdrawId, roundID, gameID: GAME_EXT_ID },
      'withdraw',
    );
    const w1 = await apilxPost(server, '/v1/apilx/wallet/Withdraw', withdraw);
    assert.equal(w1.body.code, 0);
    assert.equal(w1.body.balance, 40 + WELCOME_TND);

    const wDup = await apilxPost(server, '/v1/apilx/wallet/Withdraw', withdraw);
    assert.equal(wDup.body.code, 0);
    assert.equal(wDup.body.balance, 40 + WELCOME_TND);
    const { rows: wCount } = await server.db.query<{ n: string }>(
      `select count(*)::text as n from provider_transactions where aggregator = 'apilx' and tx_id = $1`,
      [withdrawId],
    );
    assert.equal(wCount[0]?.n, '1');

    const depositId = `d-${unique()}`;
    const deposit = signedApilx(
      {
        agentID: APILX_AGENT,
        userID,
        amount: 5,
        refTransactionID: withdrawId,
        transactionID: depositId,
        roundID,
        gameID: GAME_EXT_ID,
      },
      'deposit',
    );
    const d1 = await apilxPost(server, '/v1/apilx/wallet/Deposit', deposit);
    assert.equal(d1.body.code, 0);
    assert.equal(d1.body.balance, 45 + WELCOME_TND);

    const tooMuch = signedApilx(
      { agentID: APILX_AGENT, userID, amount: 200, transactionID: `w2-${unique()}`, roundID, gameID: GAME_EXT_ID },
      'withdraw',
    );
    const poor = await apilxPost(server, '/v1/apilx/wallet/Withdraw', tooMuch);
    assert.equal(poor.body.code, 6);
    assert.equal(await walletMinor(server, p.walletId), 45500n);

    const rollback = signedApilx({ agentID: APILX_AGENT, userID, refTransactionID: withdrawId, gameID: GAME_EXT_ID }, 'rollback');
    const rb = await apilxPost(server, '/v1/apilx/wallet/RollbackTransaction', rollback);
    assert.equal(rb.body.code, 0);
    assert.equal(await walletMinor(server, p.walletId), 55500n);
  });

  it('BetWin applies stake and win atomically; failed stake leaves no provider row', async () => {
    const p = await registerPlayer(server);
    await fundPlayer(server, p.id, '30');
    const userID = await accountNo(server, p.id);
    const roundID = `round-${unique()}`;
    const betWinId = `bw-${unique()}`;

    const ok = signedApilx(
      {
        agentID: APILX_AGENT,
        userID,
        betAmount: 5,
        winAmount: 12,
        transactionID: betWinId,
        roundID,
        gameID: GAME_EXT_ID,
      },
      'betWin',
    );
    const bw = await apilxPost(server, '/v1/apilx/wallet/BetWin', ok);
    assert.equal(bw.body.code, 0);
    assert.equal(bw.body.balance, 37 + WELCOME_TND);
    const { rows: one } = await server.db.query<{ kind: string }>(
      `select kind from provider_transactions where aggregator = 'apilx' and tx_id = $1`,
      [betWinId],
    );
    assert.equal(one[0]?.kind, 'betwin');

    const failId = `bw-fail-${unique()}`;
    const fail = signedApilx(
      {
        agentID: APILX_AGENT,
        userID,
        betAmount: 100,
        winAmount: 1,
        transactionID: failId,
        roundID,
        gameID: GAME_EXT_ID,
      },
      'betWin',
    );
    const bad = await apilxPost(server, '/v1/apilx/wallet/BetWin', fail);
    assert.equal(bad.body.code, 6);
    const { rows: none } = await server.db.query<{ n: string }>(
      `select count(*)::text as n from provider_transactions where aggregator = 'apilx' and tx_id = $1`,
      [failId],
    );
    assert.equal(none[0]?.n, '0');
    assert.equal(await walletMinor(server, p.walletId), 37500n);
  });
});

describe('legacy aggregator wallet HTTP', { skip: TEST_DATABASE_URL ? false : 'TEST_DATABASE_URL is not set' }, () => {
  let server: TestServer;
  let sessionToken: string;

  before(async () => {
    server = await startServer({ env: apilxEnv });
    const p = await registerPlayer(server);
    await fundPlayer(server, p.id, '25');
    const { rows: games } = await server.db.query<{ id: string }>(`select id::text from games where slug = 'gates-of-olympus' limit 1`);
    const gameId = games[0]?.id;
    if (!gameId) throw new Error('seed game missing');
    sessionToken = `sess-${unique()}-${unique()}`;
    await server.db.query(
      `insert into provider_sessions (token_hash, user_id, wallet_id, game_id, aggregator, currency, expires_at)
       values ($1, $2::uuid, $3::bigint, $4::bigint, $5, 'TND', now() + interval '2 hours')`,
      [tokenHash(sessionToken), p.id, p.walletId, gameId, AGG_NAME],
    );
  });

  after(async () => {
    await server?.stop();
  });

  it('balance, debit, credit, and rollback still work with header HMAC', async () => {
    const bal = await aggPost(server, '/v1/aggregator/wallet/balance', { token: sessionToken });
    assert.equal(bal.status, 200);
    assert.equal(bal.body.status, 'ok');
    assert.equal(bal.body.balance, '25.500');

    const roundId = `legacy-${unique()}`;
    const debitId = `deb-${unique()}`;
    const debit = await aggPost(server, '/v1/aggregator/wallet/debit', {
      token: sessionToken,
      transactionId: debitId,
      roundId,
      amount: '5',
    });
    assert.equal(debit.status, 200);
    assert.equal(debit.body.status, 'ok');
    assert.equal(debit.body.balance, '20.500');

    const creditId = `cred-${unique()}`;
    const credit = await aggPost(server, '/v1/aggregator/wallet/credit', {
      token: sessionToken,
      transactionId: creditId,
      roundId,
      amount: '3',
    });
    assert.equal(credit.status, 200);
    assert.equal(credit.body.balance, '23.500');

    const rollbackId = `rb-${unique()}`;
    const rollback = await aggPost(server, '/v1/aggregator/wallet/rollback', {
      token: sessionToken,
      transactionId: rollbackId,
      roundId,
      refTransactionId: debitId,
    });
    assert.equal(rollback.status, 200);
    assert.equal(rollback.body.balance, '28.500');
  });
});
