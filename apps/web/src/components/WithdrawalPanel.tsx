'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import type { WithdrawalItem } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useState } from 'react';

export function WithdrawalPanel({ initial, withdrawalsOpen }: { initial: WithdrawalItem[]; withdrawalsOpen: boolean }) {
  const t = useTranslations('withdrawals');
  const tRoot = useTranslations();
  const router = useRouter();
  const [amount, setAmount] = useState('');
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    try {
      const key = crypto.randomUUID();
      const res = await apiClient<{ withdrawal: WithdrawalItem }>('/account/withdrawals', {
        method: 'POST',
        json: { amount, idempotencyKey: key },
      });
      const created = res.withdrawal ?? (res as unknown as WithdrawalItem);
      setItems((list) => [created, ...list]);
      setMsg(t('created'));
      setAmount('');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic'));
    }
  }

  async function cancel(id: string) {
    try {
      await apiClient(`/account/withdrawals/${id}/cancel`, { method: 'POST' });
      setItems((list) => list.map((w) => (w.id === id ? { ...w, status: 'cancelled' as const } : w)));
      setMsg(t('cancelled'));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic'));
    }
  }

  return (
    <>
      <p>{t('subtitle')}</p>
      {!withdrawalsOpen ? <p className="alert alert-error">{t('closed')}</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {msg ? <div className="alert alert-success">{msg}</div> : null}
      {withdrawalsOpen ? (
        <form className="card" onSubmit={(e) => void request(e)}>
          <h2>{t('request')}</h2>
          <div className="field">
            <label>{t('amount')}</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-gold">
            {t('request')}
          </button>
        </form>
      ) : null}
      <h2>{t('title')}</h2>
      {items.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul>
          {items.map((w) => (
            <li key={w.id} className="card" style={{ marginBottom: 8 }}>
              <div>
                {t(`status.${w.status}` as never)} — <strong>{w.code}</strong>
              </div>
              <div>{w.amount.amountMinor} {w.amount.currency}</div>
              {w.status === 'pending' ? (
                <>
                  <p>{t('how')}</p>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancel(w.id)}>
                    {t('cancel')}
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
