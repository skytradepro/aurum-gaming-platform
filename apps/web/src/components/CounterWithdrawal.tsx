'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { findCurrency, formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface CounterPlayer {
  id: string;
  accountNo: string;
  username: string;
  firstName: string;
  lastName: string;
  balance: { amountMinor: string; currency: string };
  hasDeposit: boolean;
}
type Step = 'find' | 'amount' | 'code' | 'done';

/** Shop counter: withdraw for a player who is at the counter. The player approves with the one-time code shown in their account. */
export function CounterWithdrawal({ currencies, locale }: { currencies: CurrencyDTO[]; locale: string }) {
  const t = useTranslations('counterWithdrawal');
  const tRoot = useTranslations();
  const [step, setStep] = useState<Step>('find');
  const [account, setAccount] = useState('');
  const [player, setPlayer] = useState<CounterPlayer | null>(null);
  const [amount, setAmount] = useState('');
  const [approval, setApproval] = useState<{ id: string; amount: { amountMinor: string; currency: string }; expiresAt: string } | null>(null);
  const [emailed, setEmailed] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ amount: { amountMinor: string; currency: string }; balanceAfter: { amountMinor: string; currency: string } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fmt = (m: { amountMinor: string; currency: string }) => {
    const cur = findCurrency(currencies, m.currency);
    return cur ? formatAmountMinor(m.amountMinor, cur, locale, 'full') : `${m.amountMinor} ${m.currency}`;
  };
  const run = async (fn: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep('find');
    setPlayer(null);
    setAmount('');
    setApproval(null);
    setCode('');
    setResult(null);
    setError(null);
  };

  return (
    <section className="card cw-card">
      <h2>{t('title')}</h2>
      <ol className="cw-steps">
        {(['find', 'amount', 'code', 'done'] as Step[]).map((s, i) => (
          <li key={s} className={step === s ? 'on' : ''}>
            {i + 1}. {t(`step_${s}`)}
          </li>
        ))}
      </ol>
      {error ? <div className="alert alert-error">{error}</div> : null}

      {step === 'find' ? (
        <form
          className="cw-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const res = await apiClient<{ player: CounterPlayer }>('/shop/counter/player', { method: 'POST', json: { account } });
              setPlayer(res.player);
              setStep('amount');
            });
          }}
        >
          <input value={account} onChange={(e) => setAccount(e.target.value)} placeholder={t('accountPlaceholder')} required maxLength={254} />
          <button type="submit" className="btn btn-gold" disabled={busy}>
            {t('find')}
          </button>
        </form>
      ) : null}

      {player && step !== 'find' ? (
        <div className="cw-player">
          <div>
            <strong>{`${player.firstName} ${player.lastName}`.trim() || player.username}</strong>
            <span className="muted">
              {' '}
              · {player.username} · {t('account')} {player.accountNo}
            </span>
          </div>
          <div className="cw-balance">
            {t('balance')}: <b>{fmt(player.balance)}</b>
          </div>
          {!player.hasDeposit ? <div className="alert alert-error">{tRoot('errors.codes.withdrawal_needs_deposit' as never)}</div> : null}
        </div>
      ) : null}

      {step === 'amount' && player ? (
        <form
          className="cw-row"
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const res = await apiClient<{ approval: { id: string; amount: { amountMinor: string; currency: string }; expiresAt: string }; emailed?: boolean }>('/shop/counter/approvals', {
                method: 'POST',
                json: { account: player.accountNo, amount },
              });
              setApproval(res.approval);
              setEmailed(res.emailed === true);
              setStep('code');
            });
          }}
        >
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('amountPlaceholder')} required maxLength={40} />
          <button type="submit" className="btn btn-gold" disabled={busy || !player.hasDeposit}>
            {t('askCode')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={reset}>
            {t('cancel')}
          </button>
        </form>
      ) : null}

      {step === 'code' && approval ? (
        <>
          <p className="cw-info">{t('codeInfo', { amount: fmt(approval.amount) })}</p>
          {emailed ? <p className="muted">{t('emailed')}</p> : null}
          <form
            className="cw-row"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const res = await apiClient<{ amount: { amountMinor: string; currency: string }; balanceAfter: { amountMinor: string; currency: string } }>(
                  `/shop/counter/approvals/${approval.id}/confirm`,
                  { method: 'POST', json: { code } },
                );
                setResult(res);
                setStep('done');
              });
            }}
          >
            <input className="cw-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="______" required minLength={6} maxLength={6} dir="ltr" />
            <button type="submit" className="btn btn-gold" disabled={busy || code.length !== 6}>
              {t('confirm')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset}>
              {t('cancel')}
            </button>
          </form>
        </>
      ) : null}

      {step === 'done' && result ? (
        <div className="cw-done">
          <div className="alert alert-success">{t('paid', { amount: fmt(result.amount) })}</div>
          <p>
            {t('balanceAfter')}: <b>{fmt(result.balanceAfter)}</b>
          </p>
          <button type="button" className="btn btn-gold" onClick={reset}>
            {t('next')}
          </button>
        </div>
      ) : null}
    </section>
  );
}
