/**
 * Market prices for display only (the converter and the price ticker). They never touch balances.
 * Fiat: ExchangeRate-API open endpoint (updates once a day, attribution required on the page).
 * Crypto: CoinGecko keyless public API (about 10-30 calls/minute per IP), cached for 60 seconds.
 */
export const MARKET_FIAT = ['USD', 'EUR', 'GBP', 'TND', 'DZD', 'MAD', 'LYD', 'EGP', 'SAR', 'AED', 'QAR', 'KWD', 'TRY', 'CHF', 'CAD', 'JPY', 'CNY'] as const;
export const MARKET_CRYPTO: Readonly<Record<string, string>> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  TRX: 'tron',
};

export interface MarketReply {
  /** 1 USD = rate[code] */
  fiat: Record<string, number>;
  fiatAsOf: string | null;
  /** USD price and 24h change (%) of each coin */
  crypto: Record<string, { usd: number; change24h: number | null; image: string | null }>;
  cryptoAsOf: string | null;
}

let fiatCache: { at: number; rates: Record<string, number>; asOf: string | null } | null = null;
let cryptoCache: { at: number; prices: MarketReply['crypto'] } | null = null;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`market source status ${res.status}`);
  return res.json();
}

async function fiat(): Promise<{ rates: Record<string, number>; asOf: string | null }> {
  if (fiatCache && Date.now() - fiatCache.at < 60 * 60_000) return fiatCache;
  try {
    const body = (await getJson('https://open.er-api.com/v6/latest/USD')) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
    if (body.result !== 'success' || !body.rates) throw new Error('fiat rates unavailable');
    const rates: Record<string, number> = {};
    for (const code of MARKET_FIAT) if (typeof body.rates[code] === 'number') rates[code] = body.rates[code] as number;
    fiatCache = { at: Date.now(), rates, asOf: body.time_last_update_utc ? new Date(body.time_last_update_utc).toISOString() : null };
  } catch (error) {
    if (!fiatCache) throw error;
  }
  return fiatCache;
}

async function crypto(): Promise<MarketReply['crypto']> {
  if (cryptoCache && Date.now() - cryptoCache.at < 60_000) return cryptoCache.prices;
  try {
    const ids = Object.values(MARKET_CRYPTO).join(',');
    const rows = (await getJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`)) as { id: string; current_price?: number; price_change_percentage_24h?: number; image?: string }[];
    const prices: MarketReply['crypto'] = {};
    for (const [symbol, id] of Object.entries(MARKET_CRYPTO)) {
      const row = Array.isArray(rows) ? rows.find((r) => r.id === id) : undefined;
      if (row && typeof row.current_price === 'number') {
        prices[symbol] = {
          usd: row.current_price,
          change24h: typeof row.price_change_percentage_24h === 'number' ? Math.round(row.price_change_percentage_24h * 100) / 100 : null,
          image: typeof row.image === 'string' && row.image.startsWith('https://') ? row.image : null,
        };
      }
    }
    cryptoCache = { at: Date.now(), prices };
  } catch (error) {
    if (!cryptoCache) throw error;
  }
  return cryptoCache.prices;
}

export async function marketPrices(): Promise<MarketReply> {
  const [f, c] = await Promise.allSettled([fiat(), crypto()]);
  return {
    fiat: f.status === 'fulfilled' ? f.value.rates : {},
    fiatAsOf: f.status === 'fulfilled' ? f.value.asOf : null,
    crypto: c.status === 'fulfilled' ? c.value : {},
    cryptoAsOf: c.status === 'fulfilled' && cryptoCache ? new Date(cryptoCache.at).toISOString() : null,
  };
}
