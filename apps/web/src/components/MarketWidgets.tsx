'use client';

import { apiClient } from '@/lib/api';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface Market {
  fiat: Record<string, number>;
  fiatAsOf: string | null;
  crypto: Record<string, { usd: number; change24h: number | null; image?: string | null }>;
  cryptoAsOf: string | null;
}

function useMarket(): Market | null {
  const [m, setM] = useState<Market | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await apiClient<Market>('/public/market');
        if (alive) setM(next);
      } catch {
        /* keep the last prices */
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  return m;
}

/** USD value of 1 unit of a code (fiat or coin), or null when unknown. */
function usdOf(m: Market, code: string): number | null {
  const coin = m.crypto[code];
  if (coin) return coin.usd;
  const rate = m.fiat[code];
  return rate ? 1 / rate : null;
}

function fmt(n: number, locale: string): string {
  const digits = n >= 1000 ? 2 : n >= 1 ? 4 : 6;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n);
}

const PAIRS: [string, string][] = [
  ['EUR', 'USD'],
  ['GBP', 'USD'],
  ['USD', 'TND'],
  ['EUR', 'TND'],
  ['GBP', 'TND'],
  ['USD', 'DZD'],
  ['USD', 'MAD'],
  ['USD', 'EGP'],
  ['USD', 'SAR'],
  ['USD', 'AED'],
  ['USD', 'TRY'],
];

/** Live price strip: fiat pairs and the main coins with their 24h change. Display only. */
export function MarketTicker({ locale }: { locale: string }) {
  const m = useMarket();
  if (!m) return null;
  const items: { label: string; value: string; change: number | null; image?: string | null }[] = [];
  for (const [symbol, c] of Object.entries(m.crypto)) items.push({ label: `${symbol}/USD`, value: fmt(c.usd, locale), change: c.change24h, image: c.image ?? null });
  for (const [a, b] of PAIRS) {
    const ua = usdOf(m, a);
    const ub = usdOf(m, b);
    if (ua && ub) items.push({ label: `${a}/${b}`, value: fmt(ua / ub, locale), change: null });
  }
  if (items.length === 0) return null;
  const loop = [...items, ...items];
  return (
    <div className="ticker market-ticker" aria-label="Market prices">
      <div className="ticker-track" style={{ animationDuration: `${items.length * 6}s` }}>
        {loop.map((it, i) => (
          <span key={i} className="mt-item" aria-hidden={i >= items.length}>
            {it.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={it.image} alt="" width={18} height={18} className="mt-logo" />
            ) : null}
            <b>{it.label}</b> {it.value}
            {it.change !== null ? <em className={it.change >= 0 ? 'up' : 'down'}>{it.change >= 0 ? '▲' : '▼'} {Math.abs(it.change).toFixed(2)}%</em> : null}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Converter between fiat currencies and coins at the latest market prices. Display only. */
export function CurrencyConverter({ locale }: { locale: string }) {
  const t = useTranslations('market');
  const m = useMarket();
  const [amount, setAmount] = useState('100');
  const [from, setFrom] = useState('EUR');
  const [to, setTo] = useState('TND');
  const codes = useMemo(() => (m ? [...Object.keys(m.fiat), ...Object.keys(m.crypto)] : []), [m]);
  if (!m || codes.length === 0) return null;
  const n = Number(amount.replace(',', '.'));
  const uf = usdOf(m, from);
  const ut = usdOf(m, to);
  const result = Number.isFinite(n) && uf && ut ? (n * uf) / ut : null;
  return (
    <div className="converter">
      <div className="converter-row">
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label={t('amount')} />
        <select className="input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('from')}>
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="btn btn-ghost btn-sm converter-swap" onClick={() => { setFrom(to); setTo(from); }} aria-label={t('swap')}>
        ⇅
      </button>
      <div className="converter-row">
        <output className="input converter-out">{result === null ? '–' : fmt(result, locale)}</output>
        <select className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('to')}>
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <small className="muted converter-src">
        <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer">
          Rates By Exchange Rate API
        </a>{' '}
        ·{' '}
        <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">
          {t('cryptoBy')}
        </a>
      </small>
    </div>
  );
}
