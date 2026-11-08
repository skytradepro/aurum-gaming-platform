/** Read-only access to BNB Smart Chain through a public JSON-RPC node (no keys, no signing). */
const DEFAULT_RPC = 'https://bsc-dataseed.binance.org/';

export function bscRpcUrl(): string {
  return process.env.BSC_RPC_URL?.trim() || DEFAULT_RPC;
}

export async function bscRpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(bscRpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`bsc rpc status ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { message?: string } };
  if (body.error) throw new Error(`bsc rpc error: ${body.error.message ?? 'unknown'}`);
  return body.result as T;
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const isAddress = (a: string): boolean => ADDRESS.test(a);

function decodeString(hex: string | null | undefined): string | null {
  if (!hex || hex === '0x' || hex.length < 130) return null;
  const body = hex.slice(2);
  const len = parseInt(body.slice(64, 128), 16);
  const data = body.slice(128, 128 + len * 2);
  return Buffer.from(data, 'hex').toString('utf8');
}

export interface TokenInfo {
  address: string;
  name: string | null;
  symbol: string | null;
  decimals: number;
  totalSupply: string;
  isContract: boolean;
}

/** ERC-20 / BEP-20 metadata read straight from the contract. */
export async function tokenInfo(address: string): Promise<TokenInfo> {
  if (!isAddress(address)) throw new Error('invalid address');
  const call = (data: string) => bscRpc<string>('eth_call', [{ to: address, data }, 'latest']);
  const [code, name, symbol, decimalsHex, supplyHex] = await Promise.all([
    bscRpc<string>('eth_getCode', [address, 'latest']),
    call('0x06fdde03').catch(() => null),
    call('0x95d89b41').catch(() => null),
    call('0x313ce567'),
    call('0x18160ddd'),
  ]);
  const decimals = parseInt(decimalsHex, 16);
  const supply = BigInt(supplyHex);
  const unit = 10n ** BigInt(decimals);
  return { address, name: decodeString(name), symbol: decodeString(symbol), decimals, totalSupply: `${supply / unit}`, isContract: !!code && code.length > 2 };
}
