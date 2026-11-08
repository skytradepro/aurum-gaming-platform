'use client';

import { GameAiButton } from './GameInfo';
import { useTranslations } from 'next-intl';
import { StakeField, useShownCurrency } from './DisplayContext';
import { WinBurst } from './Fx';
import type { CurrencyDTO } from '@/lib/types';
import type { HistoryRow, RoundResponse } from './useRound';

interface Round {
  stake: string;
  setStake: (v: string) => void;
  balance: string;
  busy: boolean;
  error: string | null;
  result: RoundResponse | null;
  history: HistoryRow[];
  fmt: (m: bigint | string) => string;
  quick: (k: 'half' | 'double' | 'min' | 'max') => void;
  min: bigint;
  max: bigint;
}

/** Balance, stake, quick buttons, result and history: the same for every in-house game. */
export function StakeBox({ r, currency, rtp, children }: { r: Round; currency: CurrencyDTO; rtp: number; children: React.ReactNode }) {
  const t = useTranslations('wheel');
  const shown = useShownCurrency(currency);
  const res = r.result;
  const payout = res ? BigInt(res.payout.amountMinor) : 0n;
  const stake = res ? BigInt(res.stake.amountMinor) : 0n;
  return (
    <>
      <div className="wheel-panel card">
        <GameAiButton active={r.busy} />
        <p className="muted">
          {t('balance')}: <strong>{r.fmt(r.balance)}</strong>
        </p>
        <div className="field">
          <StakeField stake={r.stake} setStake={r.setStake} currency={currency} disabled={r.busy} label={t('stake')} />
          <small className="muted">{t('limits', { min: r.fmt(r.min), max: r.fmt(r.max) })}</small>
        </div>
        <div className="admin-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={r.busy} onClick={() => r.quick('min')}>
            {t('min')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={r.busy} onClick={() => r.quick('half')}>
            ½
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={r.busy} onClick={() => r.quick('double')}>
            2×
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={r.busy} onClick={() => r.quick('max')}>
            {t('max')}
          </button>
        </div>
        {children}
        {r.error ? <div className="alert alert-error">{r.error}</div> : null}
        {res?.win ? <WinBurst seed={res.roundId} /> : null}
        {res ? (
          <div className={res.win ? 'alert alert-success wheel-result' : 'alert wheel-result'}>
            <strong>{res.multiplier}</strong>{' '}
            {res.win ? t('resultWin', { amount: r.fmt(res.payout.amountMinor) }) : payout === stake ? t('resultRefund') : payout > 0n ? t('resultPartial', { amount: r.fmt(res.payout.amountMinor) }) : t('resultLose', { amount: r.fmt(res.stake.amountMinor) })}
          </div>
        ) : null}
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          {t('rtp', { rtp: rtp.toFixed(2) })}
          {shown ? ` · ${t('convertedNote', { shown, wallet: currency.code })}` : null}
        </p>
      </div>
      {r.history.length > 0 ? (
        <div className="card wheel-history">
          <h3>{t('recent')}</h3>
          <ul>
            {r.history.map((h) => (
              <li key={h.id}>
                {(() => {
                  const st = BigInt(h.stake);
                  const po = BigInt(h.payout);
                  const kind = po > st ? 'win' : po === 0n ? 'lose' : po === st ? 'refund' : 'partial';
                  const net = po - st;
                  return (
                    <>
                      <span className={`round-tag round-${kind}`}>{t(`hist_${kind}`)}</span> <strong>{h.multiplier}</strong> — {r.fmt(h.stake)} → {r.fmt(h.payout)}{' '}
                      <span className={net > 0n ? 'amount-in' : net < 0n ? 'amount-out' : ''}>
                        {net > 0n ? '+' : net < 0n ? '−' : ''}
                        {r.fmt(net < 0n ? -net : net)}
                      </span>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
