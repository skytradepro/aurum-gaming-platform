'use client';

import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

function newKey(): string {
  return `ui-${crypto.randomUUID()}`;
}

type Mode = 'deposit' | 'withdrawal' | 'adjustment_credit' | 'adjustment_debit';

/** Decimal text -> minor units, or null when it is not a valid positive amount for this currency. */
function toMinor(text: string, decimals: number): bigint | null {
  const m = /^(\d{1,15})(?:[.,](\d+))?$/.exec(text.trim());
  if (!m) return null;
  const frac = m[2] ?? '';
  if (frac.length > decimals) return null;
  const v = BigInt(m[1] as string) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0') || '0');
  return v > 0n ? v : null;
}
function fromMinor(v: bigint, decimals: number): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const unit = 10n ** BigInt(decimals);
  const s = decimals > 0 ? `${a / unit}.${(a % unit).toString().padStart(decimals, '0')}` : `${a}`;
  return neg ? `-${s}` : s;
}

/**
 * Head office (Super Admin, or an admin with balances.manage): cash in and cash out for one player at the counter,
 * plus corrections. Every posting goes through the ledger (before/after balance, operator, reason). Players never see this.
 * The idempotency key is kept until the posting succeeds, so a retry after a network error can never post twice.
 */
export function BalanceForm({ userId, username, currency, balanceMinor, decimals }: { userId: string; username: string; currency: string; balanceMinor: string; decimals: number }) {
  const t = useTranslations('cashDesk');
  const tMine = useTranslations('staffCredit');
  const tRoot = useTranslations();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('deposit');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [key, setKey] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  // an admin (not the Super Admin) credits players only from the balance the Super Admin gave him
  const [mine, setMine] = useState<bigint | null>(null);

  const loadMine = useCallback(async () => {
    try {
      const res = await apiClient<{ limited: boolean; balances: { amountMinor: string; currency: string }[] }>('/admin/me/credit');
      setMine(res.limited ? BigInt(res.balances.find((b) => b.currency === currency)?.amountMinor ?? '0') : null);
    } catch {
      setMine(null);
    }
  }, [currency]);
  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  const balance = BigInt(balanceMinor);
  const minor = toMinor(amount, decimals);
  const credit = mode === 'deposit' || mode === 'adjustment_credit';
  const after = minor === null ? null : credit ? balance + minor : balance - minor;
  const mineAfter = minor === null || mine === null ? null : credit ? mine - minor : mine + minor;
  const tooMuch = (after !== null && after < 0n) || (mineAfter !== null && mineAfter < 0n);
  const needsReason = mode === 'adjustment_credit' || mode === 'adjustment_debit';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (minor === null || tooMuch) return;
    if (needsReason && note.trim().length < 3) {
      setError(t('reasonNeeded'));
      return;
    }
    const sign = credit ? '+' : '−';
    if (!window.confirm(t('confirm', { sign, amount: fromMinor(minor, decimals), currency, username, after: fromMinor(after ?? 0n, decimals) }))) return;
    setBusy(true);
    try {
      const reason = note.trim() || (mode === 'deposit' ? t('defaultDeposit') : t('defaultWithdrawal'));
      await apiClient<unknown>(`/admin/players/${userId}/balance`, {
        method: 'POST',
        json: { entryType: mode, amount: fromMinor(minor, decimals), reason, idempotencyKey: key },
      });
      setNotice(t('done', { sign, amount: fromMinor(minor, decimals), currency }));
      setAmount('');
      setNote('');
      setKey(newKey());
      void loadMine();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? tRoot(errorMessageKey(err.code) as never) : tRoot('errors.generic' as never));
    } finally {
      setBusy(false);
    }
  }

  const pick = (m: Mode) => {
    setMode(m);
    setError(null);
    setNotice(null);
  };

  return (
    <form className="card cd-card" onSubmit={(e) => void submit(e)}>
      <div className="cd-head">
        <h3>{t('title')}</h3>
        <div className="cd-balance">
          {t('balance')}: <b dir="ltr">{fromMinor(balance, decimals)} {currency}</b>
        </div>
      </div>
      {mine !== null ? (
        <div className={mine > 0n ? 'shop-balance' : 'shop-balance is-empty'}>
          <span>{tMine('mine')}</span>
          <b dir="ltr">
            {fromMinor(mine, decimals)} {currency}
          </b>
        </div>
      ) : null}
      {mine !== null && mine === 0n ? <p className="muted">{tMine('mineEmpty')}</p> : null}
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}

      <div className="cd-modes" role="tablist">
        <button type="button" role="tab" aria-selected={mode === 'deposit'} className={mode === 'deposit' ? 'cd-mode is-in on' : 'cd-mode is-in'} onClick={() => pick('deposit')}>
          <b>＋</b>
          <span>{t('deposit')}</span>
          <small>{t('depositHint')}</small>
        </button>
        <button type="button" role="tab" aria-selected={mode === 'withdrawal'} className={mode === 'withdrawal' ? 'cd-mode is-out on' : 'cd-mode is-out'} onClick={() => pick('withdrawal')}>
          <b>－</b>
          <span>{t('cashOut')}</span>
          <small>{t('cashOutHint')}</small>
        </button>
      </div>

      <div className="cd-row">
        <div className="field cd-amount">
          <label htmlFor="cd-amount">
            {t('amount')} ({currency})
          </label>
          <input id="cd-amount" inputMode="decimal" value={amount} required placeholder="0.00" onChange={(e) => setAmount(e.target.value)} dir="ltr" />
        </div>
        <div className="field cd-note">
          <label htmlFor="cd-note">{needsReason ? t('reason') : t('note')}</label>
          <input id="cd-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {after !== null ? (
        <div className={tooMuch ? 'cd-preview is-bad' : 'cd-preview'}>
          {after < 0n ? (
            t('notEnough')
          ) : mineAfter !== null && mineAfter < 0n ? (
            tMine('mineNotEnough')
          ) : (
            <>
              <div>
                {t('after')}: <b dir="ltr">{fromMinor(after, decimals)} {currency}</b>
              </div>
              {mineAfter !== null ? (
                <div>
                  {tMine('mineAfter')}: <b dir="ltr">{fromMinor(mineAfter, decimals)} {currency}</b>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <button type="submit" className={credit ? 'btn cd-go cd-go-in' : 'btn cd-go cd-go-out'} disabled={busy || minor === null || tooMuch}>
        {mode === 'deposit' ? t('doDeposit') : mode === 'withdrawal' ? t('doCashOut') : t('doCorrection')}
      </button>

      <button type="button" className="cd-more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
        {more ? '▾' : '▸'} {t('corrections')}
      </button>
      {more ? (
        <div className="cd-modes cd-modes-small">
          <button type="button" className={mode === 'adjustment_credit' ? 'cd-mode on' : 'cd-mode'} onClick={() => pick('adjustment_credit')}>
            <span>{t('fixUp')}</span>
          </button>
          <button type="button" className={mode === 'adjustment_debit' ? 'cd-mode on' : 'cd-mode'} onClick={() => pick('adjustment_debit')}>
            <span>{t('fixDown')}</span>
          </button>
        </div>
      ) : null}
    </form>
  );
}
