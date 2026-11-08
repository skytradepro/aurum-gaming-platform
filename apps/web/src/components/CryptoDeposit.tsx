'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { formatAmountMinor, findCurrency } from '@/lib/money-display';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export interface NetworkView {
  code: string;
  coin: string;
  chain: string;
  address: string;
  decimals: number;
  minConfirmations: number;
  maxUsd: string;
  usd: number | null;
  logo: string | null;
  chainLogo: string | null;
}
export interface DepositView {
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

const CHAIN_LABEL: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum (ERC-20)', bsc: 'BNB Chain (BEP-20)', tron: 'Tron (TRC-20)' };
const COIN_ICON: Record<string, string> = { BTC: '₿', ETH: 'Ξ', BNB: '◆', USDT: '₮', SUSDT: 'S' };

function Copy({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? '✓' : label}
    </button>
  );
}

/** A 3D coin: the real logo on a metal disc with a rim, light reflection and a slow spin. */
function CoinBadge({ coin, logo, small = false }: { coin: string; logo: string | null; small?: boolean }) {
  return (
    <span className={`coin-disc${small ? ' small' : ''}${coin === 'SUSDT' ? ' susdt' : ''}`} aria-hidden="true">
      <span className="coin-face">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={64} height={64} />
        ) : (
          <b>{COIN_ICON[coin] ?? coin.slice(0, 1)}</b>
        )}
      </span>
      <span className="coin-shine" />
    </span>
  );
}

/** Crypto deposit: choose a network, get the exact amount and address, send, paste the transaction hash. */
export function CryptoDeposit({ networks, initial, currencies, locale }: { networks: NetworkView[]; initial: DepositView[]; currencies: CurrencyDTO[]; locale: string }) {
  const t = useTranslations('crypto');
  const tRoot = useTranslations();
  const [net, setNet] = useState(networks[0]?.code ?? '');
  const [amount, setAmount] = useState('');
  const [list, setList] = useState<DepositView[]>(initial);
  const [hash, setHash] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const n = networks.find((x) => x.code === net);
  // Finished requests the player cleared from the page (kept in the database for the records).
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      setHidden(JSON.parse(localStorage.getItem('crypto-hidden') ?? '[]') as string[]);
    } catch {
      setHidden([]);
    }
  }, []);
  function hide(ids: string[]) {
    const next = [...new Set([...hidden, ...ids])];
    setHidden(next);
    try {
      localStorage.setItem('crypto-hidden', JSON.stringify(next.slice(-300)));
    } catch {
      /* storage blocked: hidden only for this visit */
    }
  }
  const visible = list.filter((d) => !hidden.includes(d.id));
  const finished = visible.filter((d) => d.status !== 'open');

  function fail(err: unknown) {
    if (err instanceof ApiError) {
      const f = err.fields ?? {};
      const extra = f.expected ? ` (${t('expected')}: ${f.expected}, ${t('received')}: ${f.received ?? '0'})` : f.confirmations ? ` (${f.confirmations}/${f.needed})` : '';
      setError(`${tRoot(errorMessageKey(err.code) as never)}${extra}`);
    } else setError(tRoot('errors.generic' as never));
  }

  async function request() {
    setError(null);
    setNotice(null);
    setBusy('new');
    try {
      const res = await apiClient<{ deposit: DepositView }>('/crypto/deposits', { method: 'POST', json: { network: net, amount: amount.trim() } });
      setList((l) => [res.deposit, ...l]);
      setAmount('');
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function cancel(d: DepositView) {
    setError(null);
    setBusy(d.id);
    try {
      const res = await apiClient<{ deposit: DepositView }>(`/crypto/deposits/${d.id}/cancel`, { method: 'POST', json: {} });
      setList((l) => l.map((x) => (x.id === d.id ? res.deposit : x)));
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  async function confirm(d: DepositView) {
    setError(null);
    setNotice(null);
    setBusy(d.id);
    try {
      const res = await apiClient<{ deposit: DepositView }>(`/crypto/deposits/${d.id}/confirm`, { method: 'POST', json: { txHash: (hash[d.id] ?? '').trim() } });
      setList((l) => l.map((x) => (x.id === d.id ? res.deposit : x)));
      if (res.deposit.credited) {
        const cur = findCurrency(currencies, res.deposit.credited.currency);
        setNotice(t('credited', { amount: cur ? formatAmountMinor(res.deposit.credited.amountMinor, cur, locale, 'full') : res.deposit.credited.amountMinor }));
      }
    } catch (err) {
      fail(err);
    } finally {
      setBusy(null);
    }
  }

  const usdPreview = n?.usd && Number(amount) > 0 ? Number(amount) * n.usd : null;

  return (
    <div className="crypto-wrap">
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('newTitle')}</h3>
        <div className="crypto-coins" role="tablist">
          {networks.map((x) => (
            <button key={x.code} type="button" role="tab" aria-selected={net === x.code} className={net === x.code ? 'coin3d on' : 'coin3d'} onClick={() => setNet(x.code)}>
              <span className="coin3d-glow" aria-hidden="true" />
              <CoinBadge coin={x.coin} logo={x.logo} />
              <strong>{x.coin}</strong>
              <span className={`chain-chip ${x.chain}`}>
                {x.chainLogo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={x.chainLogo} alt="" width={14} height={14} />
                ) : null}
                {CHAIN_LABEL[x.chain] ?? x.chain}
              </span>
              {x.usd !== null ? <small className="coin3d-price">${x.usd >= 1 ? x.usd.toLocaleString(locale, { maximumFractionDigits: 2 }) : x.usd.toLocaleString('en-US', { maximumSignificantDigits: 3, maximumFractionDigits: 20 })}</small> : null}
            </button>
          ))}
        </div>
        {n ? (
          <>
            <div className="field">
              <label>
                {t('amount')} ({n.coin})
              </label>
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              <small className="muted">
                {usdPreview !== null ? `≈ ${usdPreview.toLocaleString(locale, { maximumFractionDigits: 2 })} USD · ` : ''}
                {t('maxUsd', { max: n.maxUsd })}
              </small>
            </div>
            <button type="button" className="btn btn-gold" disabled={busy !== null || !amount.trim()} onClick={() => void request()}>
              {busy === 'new' ? t('working') : t('getAddress')}
            </button>
          </>
        ) : null}
        {error ? <div className="alert alert-error" style={{ marginTop: '0.8rem' }}>{error}</div> : null}
        {notice ? <div className="alert alert-success" style={{ marginTop: '0.8rem' }}>{notice}</div> : null}
      </div>

      {finished.length > 0 ? (
        <div className="crypto-clear">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => hide(finished.map((d) => d.id))}>
            🧹 {t('clearFinished', { count: finished.length })}
          </button>
        </div>
      ) : null}
      {visible.map((d) => {
        const cur = d.credited ? findCurrency(currencies, d.credited.currency) : undefined;
        return (
          <div key={d.id} className={`card crypto-req ${d.status}`}>
            <div className="crypto-req-head">
              <strong className="crypto-req-title">
                <CoinBadge coin={d.coin} logo={networks.find((x) => x.coin === d.coin)?.logo ?? null} small />
                {d.coin} · {CHAIN_LABEL[d.chain] ?? d.chain}
              </strong>
              <span className="crypto-head-right">
                <span className={`crypto-status ${d.status}`}>{t(`status_${d.status}` as never)}</span>
                {d.status !== 'open' ? (
                  <button type="button" className="crypto-x" aria-label={t('remove')} onClick={() => hide([d.id])}>
                    ✕
                  </button>
                ) : null}
              </span>
            </div>
            {d.status === 'credited' ? (
              <p>
                {t('creditedLine', { amount: d.amount, coin: d.coin, credit: cur && d.credited ? formatAmountMinor(d.credited.amountMinor, cur, locale, 'full') : '' })}
              </p>
            ) : d.status === 'expired' ? (
              <p className="muted">{t('expiredLine')}</p>
            ) : (
              <>
                <p className="crypto-step">{t('step1')}</p>
                <div className="crypto-exact">
                  <span>
                    {d.amount} {d.coin}
                  </span>
                  <Copy text={d.amount} label={t('copy')} />
                </div>
                <p className="crypto-step">{t('step2', { network: CHAIN_LABEL[d.chain] ?? d.chain })}</p>
                <div className="crypto-exact address">
                  <code>{d.address}</code>
                  <Copy text={d.address} label={t('copy')} />
                </div>
                <p className="crypto-warn">{t('warn', { network: CHAIN_LABEL[d.chain] ?? d.chain })}</p>
                <p className="crypto-step">{t('step3')}</p>
                <div className="crypto-confirm">
                  <input className="input" value={hash[d.id] ?? ''} onChange={(e) => setHash((h) => ({ ...h, [d.id]: e.target.value }))} placeholder={t('hashPlaceholder')} />
                  <button type="button" className="btn btn-gold" disabled={busy !== null || !(hash[d.id] ?? '').trim()} onClick={() => void confirm(d)}>
                    {busy === d.id ? t('checking') : t('confirm')}
                  </button>
                  <button type="button" className="btn btn-cancel" disabled={busy !== null} onClick={() => void cancel(d)}>
                    ✕ {t('cancel')}
                  </button>
                </div>
                <small className="muted">{t('expires', { time: new Date(d.expiresAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}</small>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
