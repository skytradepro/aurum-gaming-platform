/**
 * Crypto deposits checked on the blockchain. Read-only: the platform only reads public chain data
 * (no private keys, no signing). A deposit request fixes an exact amount with a small unique tag,
 * so a transaction can only match the request of the player who made it.
 */
import { getWalletByUser, postEntry } from '@aurum/ledger';
import { AppError } from '@aurum/shared';
import type { Db, Queryable } from '@aurum/db';
import type { Ctx } from '../http/types.ts';
import { bscRpc } from './bsc.ts';
import { marketPrices } from './market.ts';

export interface NetworkRow {
  code: string;
  coin: string;
  chain: 'bitcoin' | 'ethereum' | 'bsc' | 'tron';
  token_contract: string | null;
  decimals: number;
  deposit_address: string;
  min_confirmations: number;
  max_credit_usd: string;
  is_enabled: boolean;
}

const REQUEST_HOURS = 3;
const MAX_OPEN_PER_USER = 3;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

export async function listNetworks(q: Queryable, enabledOnly = true): Promise<NetworkRow[]> {
  const { rows } = await q.query<NetworkRow>(
    `select code, coin, chain, token_contract, decimals::int, deposit_address, min_confirmations::int, max_credit_usd::text, is_enabled
       from crypto_networks ${enabledOnly ? 'where is_enabled' : ''} order by sort_order, code`,
  );
  return rows;
}

// --- amounts ------------------------------------------------------------------------------------------
export function toUnits(text: string, decimals: number): bigint | null {
  const m = /^(\d{1,15})(?:[.,](\d{1,18}))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  return BigInt(m[1] as string) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
}

export function fromUnits(units: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const frac = (units % unit).toString().padStart(decimals, '0').replace(/0+$/, '');
  return frac ? `${units / unit}.${frac}` : `${units / unit}`;
}

/** Smallest step of the unique tag added to a requested amount. */
function tagStep(n: NetworkRow): bigint {
  if (n.coin === 'BTC') return 1n; // 1-999 satoshi
  if (n.decimals <= 6) return 1n; // 0.000001-0.000999 USDT
  return 10n ** BigInt(Math.max(0, n.decimals - 9)); // 0.000000001-0.000000999 ETH / BNB / SUSDT
}

// --- prices (USD per 1 coin) --------------------------------------------------------------------------
let susdtCache: { at: number; usd: number } | null = null;

async function susdtUsd(bnbUsd: number): Promise<number> {
  if (susdtCache && Date.now() - susdtCache.at < 60_000) return susdtCache.usd;
  const FACTORY = '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73';
  const SUSDT = '1f891d25a386e6f67ead37d9bfaf5c444213a134';
  const WBNB = 'bb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c';
  const pair = `0x${(await bscRpc<string>('eth_call', [{ to: FACTORY, data: `0xe6a43905${SUSDT.padStart(64, '0')}${WBNB.padStart(64, '0')}` }, 'latest'])).slice(-40)}`;
  if (/^0x0+$/.test(pair)) throw new AppError('crypto_unavailable', { message: 'no SUSDT market' });
  const [reserves, token0] = await Promise.all([bscRpc<string>('eth_call', [{ to: pair, data: '0x0902f1ac' }, 'latest']), bscRpc<string>('eth_call', [{ to: pair, data: '0x0dfe1681' }, 'latest'])]);
  const r0 = Number(BigInt(`0x${reserves.slice(2, 66)}`)) / 1e18;
  const r1 = Number(BigInt(`0x${reserves.slice(66, 130)}`)) / 1e18;
  const susdtIs0 = token0.toLowerCase().endsWith(SUSDT);
  const priceBnb = susdtIs0 ? r1 / r0 : r0 / r1;
  const usd = priceBnb * bnbUsd;
  susdtCache = { at: Date.now(), usd };
  return usd;
}

export async function coinUsd(coin: string): Promise<number> {
  const m = await marketPrices();
  if (coin === 'SUSDT') {
    const bnb = m.crypto.BNB?.usd;
    if (!bnb) throw new AppError('crypto_unavailable', { message: 'BNB price unavailable' });
    return susdtUsd(bnb);
  }
  const p = m.crypto[coin]?.usd;
  if (!p) throw new AppError('crypto_unavailable', { message: `${coin} price unavailable` });
  return p;
}

// --- chain readers ------------------------------------------------------------------------------------
interface Seen {
  ok: boolean;
  /** Total received by our address in this transaction, in the coin's smallest unit. */
  received: bigint;
  confirmations: number;
  blockTimeMs: number | null;
}

const ETH_RPC = (): string => process.env.ETH_RPC_URL?.trim() || 'https://ethereum-rpc.publicnode.com';

async function ethRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(ETH_RPC(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`eth rpc status ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`eth rpc error: ${body.error.message ?? ''}`);
  return body.result as T;
}

async function readEvm(n: NetworkRow, hash: string): Promise<Seen | null> {
  const rpc = n.chain === 'bsc' ? bscRpc : ethRpc;
  const [tx, receipt, head] = await Promise.all([
    rpc<{ to: string | null; value: string; blockNumber: string | null } | null>('eth_getTransactionByHash', [hash]),
    rpc<{ status: string; blockNumber: string; logs: { address: string; topics: string[]; data: string }[] } | null>('eth_getTransactionReceipt', [hash]),
    rpc<string>('eth_blockNumber', []),
  ]);
  if (!tx) return null;
  if (!receipt || !tx.blockNumber) return { ok: true, received: 0n, confirmations: 0, blockTimeMs: null };
  const block = await rpc<{ timestamp: string }>('eth_getBlockByNumber', [receipt.blockNumber, false]);
  const confirmations = Number(BigInt(head) - BigInt(receipt.blockNumber)) + 1;
  const ours = n.deposit_address.toLowerCase();
  let received = 0n;
  if (!n.token_contract) {
    if ((tx.to ?? '').toLowerCase() === ours) received = BigInt(tx.value);
  } else {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== n.token_contract.toLowerCase()) continue;
      if ((log.topics[0] ?? '').toLowerCase() !== TRANSFER_TOPIC) continue;
      if (`0x${(log.topics[2] ?? '').slice(-40)}`.toLowerCase() !== ours) continue;
      received += BigInt(log.data);
    }
  }
  return { ok: receipt.status === '0x1', received, confirmations, blockTimeMs: Number(BigInt(block.timestamp)) * 1000 };
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** Tron base58 address -> 20-byte hex (without the 0x41 prefix). */
export function tronHex(address: string): string {
  let n = 0n;
  for (const c of address) {
    const i = B58.indexOf(c);
    if (i < 0) throw new Error('bad tron address');
    n = n * 58n + BigInt(i);
  }
  const hex = n.toString(16).padStart(50, '0');
  return hex.slice(2, 42);
}

const TRON_API = (): string => process.env.TRON_API_URL?.trim() || 'https://api.trongrid.io';

async function tronPost<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  if (process.env.TRONGRID_API_KEY) headers['TRON-PRO-API-KEY'] = process.env.TRONGRID_API_KEY;
  const res = await fetch(`${TRON_API()}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`tron api status ${res.status}`);
  return (await res.json()) as T;
}

async function readTron(n: NetworkRow, hash: string): Promise<Seen | null> {
  const [info, now] = await Promise.all([
    tronPost<{ id?: string; blockNumber?: number; blockTimeStamp?: number; receipt?: { result?: string }; log?: { address: string; topics: string[]; data: string }[] }>('/wallet/gettransactioninfobyid', { value: hash }),
    tronPost<{ block_header?: { raw_data?: { number?: number } } }>('/wallet/getnowblock', {}),
  ]);
  if (!info.id) return null;
  if (!info.blockNumber) return { ok: true, received: 0n, confirmations: 0, blockTimeMs: null };
  const contract = tronHex(n.token_contract ?? '').toLowerCase();
  const ours = tronHex(n.deposit_address).toLowerCase();
  let received = 0n;
  for (const log of info.log ?? []) {
    if (log.address.toLowerCase().slice(-40) !== contract) continue;
    if ((log.topics[0] ?? '').toLowerCase() !== TRANSFER_TOPIC.slice(2)) continue;
    if ((log.topics[2] ?? '').toLowerCase().slice(-40) !== ours) continue;
    received += BigInt(`0x${log.data}`);
  }
  const head = now.block_header?.raw_data?.number ?? info.blockNumber;
  return { ok: info.receipt?.result === 'SUCCESS', received, confirmations: head - info.blockNumber + 1, blockTimeMs: info.blockTimeStamp ?? null };
}

const BTC_API = (): string => process.env.BTC_API_URL?.trim() || 'https://mempool.space/api';

async function readBitcoin(n: NetworkRow, hash: string): Promise<Seen | null> {
  const res = await fetch(`${BTC_API()}/tx/${hash}`, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`btc api status ${res.status}`);
  const tx = (await res.json()) as { status: { confirmed: boolean; block_height?: number; block_time?: number }; vout: { scriptpubkey_address?: string; value: number }[] };
  const received = tx.vout.filter((o) => o.scriptpubkey_address === n.deposit_address).reduce((a, o) => a + BigInt(o.value), 0n);
  if (!tx.status.confirmed || !tx.status.block_height) return { ok: true, received, confirmations: 0, blockTimeMs: null };
  const tipRes = await fetch(`${BTC_API()}/blocks/tip/height`, { signal: AbortSignal.timeout(10_000) });
  const tip = Number(await tipRes.text());
  return { ok: true, received, confirmations: tip - tx.status.block_height + 1, blockTimeMs: (tx.status.block_time ?? 0) * 1000 };
}

function hashOk(n: NetworkRow, hash: string): boolean {
  if (n.chain === 'bitcoin' || n.chain === 'tron') return /^[0-9a-fA-F]{64}$/.test(hash);
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}

// --- requests and confirmation ------------------------------------------------------------------------
export interface DepositDTO {
  id: string;
  network: string;
  coin: string;
  chain: string;
  address: string;
  amount: string;
  status: string;
  expiresAt: string;
  txHash: string | null;
  credited: { amountMinor: string; currency: string } | null;
  createdAt: string;
}

interface DepositRow {
  id: string;
  network: string;
  coin: string;
  chain: string;
  decimals: number;
  deposit_address: string;
  amount_units: string;
  status: string;
  expires_at: Date;
  tx_hash: string | null;
  credited_minor: string | null;
  currency: string | null;
  created_at: Date;
}

const DEPOSIT_COLUMNS = `d.id::text, d.network, n.coin, n.chain, n.decimals::int, d.deposit_address, d.amount_units::text, d.status, d.expires_at, d.tx_hash, d.credited_minor::text, d.currency, d.created_at`;

function toDTO(r: DepositRow): DepositDTO {
  return {
    id: r.id,
    network: r.network,
    coin: r.coin,
    chain: r.chain,
    address: r.deposit_address,
    amount: fromUnits(BigInt(r.amount_units), r.decimals),
    status: r.status === 'open' && r.expires_at.getTime() < Date.now() ? 'expired' : r.status,
    expiresAt: r.expires_at.toISOString(),
    txHash: r.tx_hash,
    credited: r.credited_minor && r.currency ? { amountMinor: r.credited_minor, currency: r.currency } : null,
    createdAt: r.created_at.toISOString(),
  };
}

export async function myDeposits(q: Queryable, userId: string): Promise<DepositDTO[]> {
  const { rows } = await q.query<DepositRow>(`select ${DEPOSIT_COLUMNS} from crypto_deposits d join crypto_networks n on n.code = d.network where d.user_id = $1::uuid order by d.id desc limit 30`, [userId]);
  return rows.map(toDTO);
}

export async function adminDeposits(q: Queryable, limit: number): Promise<(DepositDTO & { username: string; usdValue: string | null })[]> {
  const { rows } = await q.query<DepositRow & { username: string; usd_value: string | null }>(
    `select ${DEPOSIT_COLUMNS}, u.username, d.usd_value::text from crypto_deposits d join crypto_networks n on n.code = d.network join users u on u.id = d.user_id order by d.id desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({ ...toDTO(r), username: r.username, usdValue: r.usd_value }));
}

export async function createDeposit(ctx: Ctx, input: { network: string; amount: string }): Promise<DepositDTO> {
  const user = ctx.principal();
  const limit = ctx.services.limiter.hit(`crypto-req:${user.id}`, 10, 60 * 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });
  const net = (await listNetworks(ctx.db)).find((x) => x.code === input.network);
  if (!net) throw new AppError('crypto_unavailable');
  const base = toUnits(input.amount, Math.min(net.decimals, 8));
  if (base === null || base <= 0n) throw new AppError('invalid_amount', { fields: { amount: 'invalidAmount' } });
  const units = base * 10n ** BigInt(net.decimals - Math.min(net.decimals, 8));
  // The request must stay under the per-deposit limit at today's price.
  const usd = (Number(units) / 10 ** net.decimals) * (await coinUsd(net.coin));
  if (usd > Number(net.max_credit_usd)) throw new AppError('crypto_over_limit', { details: { maxUsd: net.max_credit_usd } });
  if (usd < 1) throw new AppError('crypto_under_minimum');

  await ctx.db.query("update crypto_deposits set status = 'expired' where status = 'open' and expires_at < now() - interval '24 hours'");
  const open = await ctx.db.query('select 1 from crypto_deposits where user_id = $1::uuid and status = $2 and expires_at > now()', [user.id, 'open']);
  if ((open.rowCount ?? 0) >= MAX_OPEN_PER_USER) throw new AppError('crypto_too_many_open');

  const step = tagStep(net);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const tag = BigInt(1 + Math.floor(Math.random() * 999)) * step;
    const exact = units + tag;
    try {
      const { rows } = await ctx.db.query<{ id: string }>(
        `insert into crypto_deposits (user_id, network, deposit_address, amount_units, expires_at)
         values ($1::uuid, $2, $3, $4::numeric, now() + make_interval(hours => $5)) returning id::text`,
        [user.id, net.code, net.deposit_address, exact.toString(), REQUEST_HOURS],
      );
      const created = await ctx.db.query<DepositRow>(`select ${DEPOSIT_COLUMNS} from crypto_deposits d join crypto_networks n on n.code = d.network where d.id = $1::bigint`, [rows[0]?.id]);
      return toDTO(created.rows[0] as DepositRow);
    } catch (error) {
      if ((error as { code?: string }).code === '23505') continue; // the same exact amount is already open: draw another tag
      throw error;
    }
  }
  throw new AppError('conflict');
}

export async function confirmDeposit(ctx: Ctx, id: string, txHash: string): Promise<DepositDTO> {
  const user = ctx.principal();
  const limit = ctx.services.limiter.hit(`crypto-confirm:${user.id}`, 30, 60 * 60_000);
  if (!limit.allowed) throw new AppError('rate_limited', { details: { retryAfterSeconds: limit.retryAfterSeconds } });
  const { rows } = await ctx.db.query<DepositRow & { min_confirmations: number; token_contract: string | null; max_credit_usd: string; created_at: Date }>(
    `select ${DEPOSIT_COLUMNS}, n.min_confirmations::int, n.token_contract, n.max_credit_usd::text from crypto_deposits d join crypto_networks n on n.code = d.network where d.id = $1::bigint and d.user_id = $2::uuid`,
    [id, user.id],
  );
  const d = rows[0];
  if (!d) throw new AppError('not_found');
  if (d.status === 'credited') return toDTO(d);
  const net: NetworkRow = { code: d.network, coin: d.coin, chain: d.chain as NetworkRow['chain'], token_contract: d.token_contract, decimals: d.decimals, deposit_address: d.deposit_address, min_confirmations: d.min_confirmations, max_credit_usd: d.max_credit_usd, is_enabled: true };
  const hash = txHash.trim();
  if (!hashOk(net, hash)) throw new AppError('validation', { fields: { txHash: 'invalid' } });

  const used = await ctx.db.query('select 1 from crypto_deposits where network = $1 and lower(tx_hash) = lower($2)', [net.code, hash]);
  if ((used.rowCount ?? 0) > 0) throw new AppError('crypto_tx_used');

  const seen = net.chain === 'bitcoin' ? await readBitcoin(net, hash) : net.chain === 'tron' ? await readTron(net, hash) : await readEvm(net, hash);
  if (!seen) throw new AppError('crypto_tx_not_found');
  if (!seen.ok) throw new AppError('crypto_tx_invalid', { message: 'transaction failed on chain' });
  if (seen.received !== BigInt(d.amount_units)) throw new AppError('crypto_tx_invalid', { fields: { expected: fromUnits(BigInt(d.amount_units), d.decimals), received: fromUnits(seen.received, d.decimals) } });
  if (seen.confirmations < net.min_confirmations) throw new AppError('crypto_tx_pending', { fields: { confirmations: String(seen.confirmations), needed: String(net.min_confirmations) } });
  if (seen.blockTimeMs !== null && (seen.blockTimeMs < d.created_at.getTime() - 60_000 || seen.blockTimeMs > d.expires_at.getTime())) {
    throw new AppError('crypto_tx_invalid', { message: 'transaction outside the request window' });
  }

  const wallet = await getWalletByUser(ctx.db, user.id);
  if (!wallet) throw new AppError('wallet_not_found');
  const amount = Number(seen.received) / 10 ** d.decimals;
  const usd = Math.min(amount * (await coinUsd(net.coin)), Number(net.max_credit_usd));
  const market = await marketPrices();
  const perUsd = wallet.currency === 'USD' ? 1 : market.fiat[wallet.currency];
  if (!perUsd) throw new AppError('crypto_unavailable', { message: `no rate for ${wallet.currency}` });
  const cur = await ctx.db.query<{ decimals: number }>('select decimals::int from currencies where code = $1', [wallet.currency]);
  const dec = cur.rows[0]?.decimals ?? 2;
  const creditMinor = BigInt(Math.floor(usd * perUsd * 10 ** dec));
  if (creditMinor < 1n) throw new AppError('crypto_under_minimum');

  return ctx.db.transaction(async (tx) => {
    const lock = await tx.query<{ status: string }>('select status from crypto_deposits where id = $1::bigint for update', [d.id]);
    if (lock.rows[0]?.status === 'credited') throw new AppError('crypto_tx_used');
    await postEntry(tx, {
      walletId: wallet.id,
      entryType: 'deposit_crypto',
      amountMinor: creditMinor,
      scope: `crypto:${user.id}`,
      idempotencyKey: `crypto:${d.id}`,
      reference: `crypto:${net.code}:${hash}`.slice(0, 200),
      reason: `${net.coin} deposit`,
      metadata: { network: net.code, coin: net.coin, txHash: hash, amount: fromUnits(seen.received, d.decimals), usd: usd.toFixed(2) },
    });
    await tx.query(
      `update crypto_deposits set status = 'credited', tx_hash = $2, usd_value = $3::numeric, currency = $4, credited_minor = $5::bigint, credited_at = now() where id = $1::bigint`,
      [d.id, hash, usd.toFixed(8), wallet.currency, creditMinor.toString()],
    );
    const fresh = await tx.query<DepositRow>(`select ${DEPOSIT_COLUMNS} from crypto_deposits d join crypto_networks n on n.code = d.network where d.id = $1::bigint`, [d.id]);
    return toDTO(fresh.rows[0] as DepositRow);
  });
}

/** For the deposit page: networks with today's USD price. */
export async function publicNetworks(db: Db): Promise<{ code: string; coin: string; chain: string; address: string; decimals: number; minConfirmations: number; maxUsd: string; usd: number | null; logo: string | null; chainLogo: string | null }[]> {
  const nets = await listNetworks(db);
  const market = await marketPrices().catch(() => null);
  return Promise.all(
    nets.map(async (n) => ({
      code: n.code,
      coin: n.coin,
      chain: n.chain,
      address: n.deposit_address,
      decimals: n.decimals,
      minConfirmations: n.min_confirmations,
      maxUsd: n.max_credit_usd,
      usd: await coinUsd(n.coin).catch(() => null),
      logo: n.coin === 'SUSDT' ? '/media/susdt.png' : (market?.crypto[n.coin]?.image ?? null),
      chainLogo: market?.crypto[({ bitcoin: 'BTC', ethereum: 'ETH', bsc: 'BNB', tron: 'TRX' } as const)[n.chain]]?.image ?? null,
    })),
  );
}


/** The player cancels an open request they no longer need (nothing was credited). */
export async function cancelDeposit(ctx: Ctx, id: string): Promise<DepositDTO> {
  const user = ctx.principal();
  const res = await ctx.db.query("update crypto_deposits set status = 'expired' where id = $1::bigint and user_id = $2::uuid and status = 'open' returning id", [id, user.id]);
  if ((res.rowCount ?? 0) === 0) throw new AppError('not_found');
  const { rows } = await ctx.db.query<DepositRow>(`select ${DEPOSIT_COLUMNS} from crypto_deposits d join crypto_networks n on n.code = d.network where d.id = $1::bigint`, [id]);
  return toDTO(rows[0] as DepositRow);
}
