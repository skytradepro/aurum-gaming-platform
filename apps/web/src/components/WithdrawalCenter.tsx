'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO, WithdrawalItem } from '@/lib/types';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export interface OnlineWithdrawalItem {
  id: string;
  method: 'bank' | 'crypto';
  status: 'pending' | 'paid' | 'cancelled' | 'rejected';
  amount: { amountMinor: string; currency: string };
  details: Record<string, string>;
  createdAt: string;
  paidAt: string | null;
  payoutReference: string | null;
  closeReason: string | null;
}
export interface PayoutNetwork {
  code: string;
  coin: string;
  chain: string;
}
type Method = 'shop' | 'bank' | 'crypto';

const CHAIN: Record<string, string> = { bitcoin: 'Bitcoin', ethereum: 'Ethereum (ERC-20)', bsc: 'BNB Chain (BEP-20)', tron: 'Tron (TRC-20)' };
const short = (s: string) => (s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s);

/** Player withdrawals: cash at a shop (pickup code), bank transfer or crypto. */
export function WithdrawalCenter(props: {
  shopItems: WithdrawalItem[];
  onlineItems: OnlineWithdrawalItem[];
  open: boolean;
  hasDeposit: boolean;
  networks: PayoutNetwork[];
  currencies: CurrencyDTO[];
  locale: string;
}) {
  const t = useTranslations('withdrawals');
  const tw = useTranslations('onlineWithdrawals');
  const tRoot = useTranslations();
  const router = useRouter();
  const [method, setMethod] = useState<Method>('bank');
  const [amount, setAmount] = useState('');
  const [accountName, setAccountName] = useState('');
  const [iban, setIban] = useState('');
  const [network, setNetwork] = useState(props.networks[0]?.code ?? '');
  const [address, setAddress] = useState('');
  const [shopItems, setShopItems] = useState(props.shopItems);
  const [onlineItems, setOnlineItems] = useState(props.onlineItems);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const fmt = (m: { amountMinor: string; currency: string }) => {
    const cur = findCurrency(props.currencies, m.currency);
    return cur ? formatAmountMinor(m.amountMinor, cur, props.locale, 'full') : `${m.amountMinor} ${m.currency}`;
  };
  const fail = (err: unknown) => setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      if (method === 'shop') {
        const res = await apiClient<{ withdrawal: WithdrawalItem }>('/account/withdrawals', { method: 'POST', json: { amount, idempotencyKey } });
        setShopItems((list) => [res.withdrawal, ...list]);
        setMsg(t('created'));
      } else {
        const json = method === 'bank' ? { method, amount, idempotencyKey, accountName, iban } : { method, amount, idempotencyKey, network, address };
        const res = await apiClient<{ withdrawal: OnlineWithdrawalItem }>('/account/online-withdrawals', { method: 'POST', json });
        setOnlineItems((list) => [res.withdrawal, ...list]);
        setMsg(tw('created'));
      }
      setAmount('');
      router.refresh();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function cancelShop(id: string) {
    try {
      await apiClient(`/account/withdrawals/${id}/cancel`, { method: 'POST' });
      setShopItems((list) => list.map((w) => (w.id === id ? { ...w, status: 'cancelled' as const } : w)));
      setMsg(t('cancelled'));
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }
  async function cancelOnline(id: string) {
    try {
      const res = await apiClient<{ withdrawal: OnlineWithdrawalItem }>(`/account/online-withdrawals/${id}/cancel`, { method: 'POST' });
      setOnlineItems((list) => list.map((w) => (w.id === id ? res.withdrawal : w)));
      setMsg(t('cancelled'));
      router.refresh();
    } catch (err) {
      fail(err);
    }
  }

  const canRequest = props.open && props.hasDeposit;
  const methods: Method[] = props.networks.length > 0 ? ['bank', 'crypto', 'shop'] : ['bank', 'shop'];

  return (
    <div className="wd-center">
      <h2>{tw('title')}</h2>
      {!props.open ? <p className="alert alert-error">{t('closed')}</p> : null}
      {props.open && !props.hasDeposit ? <p className="alert alert-info wd-needs">{tw('needsDeposit')}</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {msg ? <div className="alert alert-success">{msg}</div> : null}

      {canRequest ? (
        <form className="card wd-form" onSubmit={(e) => void submit(e)}>
          <div className="deposit-tab-bar" role="tablist">
            {methods.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={method === m} className={method === m ? 'deposit-tab on' : 'deposit-tab'} onClick={() => setMethod(m)}>
                <span aria-hidden="true">{m === 'bank' ? '🏦' : m === 'crypto' ? '₿' : '🏪'}</span>
                {tw(`method_${m}`)}
              </button>
            ))}
          </div>
          <p className="muted wd-hint">{tw(`hint_${method}`)}</p>
          <div className="field">
            <label htmlFor="wd-amount">{t('amount')}</label>
            <input id="wd-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          {method === 'bank' ? (
            <>
              <div className="field">
                <label htmlFor="wd-name">{tw('accountName')}</label>
                <input id="wd-name" value={accountName} onChange={(e) => setAccountName(e.target.value)} required minLength={3} maxLength={100} autoComplete="name" />
              </div>
              <div className="field">
                <label htmlFor="wd-iban">IBAN</label>
                <input id="wd-iban" dir="ltr" value={iban} onChange={(e) => setIban(e.target.value.toUpperCase())} required maxLength={50} placeholder="DE00 0000 0000 0000 0000 00" />
              </div>
            </>
          ) : null}
          {method === 'crypto' ? (
            <>
              <div className="field">
                <label htmlFor="wd-net">{tw('network')}</label>
                <select id="wd-net" value={network} onChange={(e) => setNetwork(e.target.value)}>
                  {props.networks.map((n) => (
                    <option key={n.code} value={n.code}>
                      {n.coin} — {CHAIN[n.chain] ?? n.chain}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="wd-addr">{tw('address')}</label>
                <input id="wd-addr" dir="ltr" value={address} onChange={(e) => setAddress(e.target.value.trim())} required maxLength={100} />
              </div>
              <p className="wd-warn">{tw('cryptoWarn')}</p>
            </>
          ) : null}
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {busy ? tw('sending') : method === 'shop' ? t('request') : tw('submit')}
          </button>
        </form>
      ) : null}

      <h3>{tw('historyTitle')}</h3>
      {onlineItems.length === 0 && shopItems.length === 0 ? <p className="muted">{t('empty')}</p> : null}
      <div className="wd-list">
        {onlineItems.map((w) => (
          <div key={`o${w.id}`} className={`card wd-item is-${w.status}`}>
            <div className="wd-item-top">
              <strong>{fmt(w.amount)}</strong>
              <span className={`wd-badge is-${w.status}`}>{tw(`status_${w.status}`)}</span>
            </div>
            <div className="muted">
              {w.method === 'bank' ? `🏦 ${tw('method_bank')} · ${w.details.iban ? short(w.details.iban) : ''}` : `₿ ${w.details.coin ?? ''} · ${w.details.address ? short(w.details.address) : ''}`}
            </div>
            {w.status === 'paid' && w.payoutReference ? (
              <div className="wd-ref">
                {tw('reference')}: <code dir="ltr">{w.payoutReference}</code>
              </div>
            ) : null}
            {w.status === 'rejected' && w.closeReason ? <div className="alert alert-error">{w.closeReason}</div> : null}
            {w.status === 'pending' ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancelOnline(w.id)}>
                {t('cancel')}
              </button>
            ) : null}
          </div>
        ))}
        {shopItems.map((w) => (
          <div key={`s${w.id}`} className={`card wd-item is-${w.status}`}>
            <div className="wd-item-top">
              <strong>{fmt(w.amount)}</strong>
              <span className={`wd-badge is-${w.status}`}>{t(`status.${w.status}` as never)}</span>
            </div>
            <div className="muted">
              🏪 {tw('method_shop')} · <code dir="ltr">{w.code}</code>
            </div>
            {w.status === 'pending' ? (
              <>
                <p className="muted">{t('how')}</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancelShop(w.id)}>
                  {t('cancel')}
                </button>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
