'use client';

import { GameAiButton } from './game/GameInfo';
import { errorMessageKey } from '@aurum/i18n';
import { WHEEL_RTP_PERCENT, WHEEL_SEGMENTS } from '@aurum/shared';
import { ApiError, apiClient } from '@/lib/api';
import { StakeField, useGameLimits, useMoneyFmt } from '@/components/game/DisplayContext';
import type { CurrencyDTO } from '@/lib/types';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

const N = WHEEL_SEGMENTS.length;
const STEP = 360 / N;
const C = 160;
const R = 150;

const point = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)];
};

function color(num: number, den: number): string {
  const m = num / den;
  if (m === 0) return '#1d1730';
  if (m < 1) return '#4b2a86';
  if (m === 1) return '#1f4fa8';
  if (m <= 2) return '#16875a';
  return '#d9a400';
}

interface SpinResponse {
  roundId: string;
  segment: number;
  multiplier: string;
  stake: { amountMinor: string; currency: string };
  payout: { amountMinor: string; currency: string };
  balance: { amountMinor: string; currency: string };
}

interface Round {
  id: string;
  multiplier: string;
  stake: string;
  payout: string;
  won: boolean;
}

export function WheelGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('wheel');
  const tRoot = useTranslations();
  const router = useRouter();
  const { min, max } = useGameLimits(currency);
  const fmt = useMoneyFmt(currency, locale);

  const [stake, setStake] = useState(fmtPlain(min * 10n > max ? min : min * 10n, currency.decimals));
  const [balance, setBalance] = useState(initialBalanceMinor);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Round | null>(null);
  const [history, setHistory] = useState<Round[]>([]);
  const rotRef = useRef(0);

  function fmtPlain(minor: bigint, decimals: number): string {
    const unit = 10n ** BigInt(decimals);
    const whole = minor / unit;
    const frac = (minor % unit).toString().padStart(decimals, '0');
    return decimals > 0 ? `${whole}.${frac}` : `${whole}`;
  }

  function setQuick(kind: 'half' | 'double' | 'min' | 'max') {
    try {
      const unit = 10n ** BigInt(currency.decimals);
      const [w = '0', f = ''] = stake.trim().split('.');
      const cur = BigInt(w || '0') * unit + BigInt(f.padEnd(currency.decimals, '0').slice(0, currency.decimals) || '0');
      let next = cur;
      if (kind === 'half') next = cur / 2n;
      if (kind === 'double') next = cur * 2n;
      if (kind === 'min') next = min;
      if (kind === 'max') next = max < BigInt(balance) ? max : BigInt(balance);
      if (next < min) next = min;
      if (next > max) next = max;
      setStake(fmtPlain(next, currency.decimals));
    } catch {
      setStake(fmtPlain(min, currency.decimals));
    }
  }

  async function spin() {
    if (spinning) return;
    setError(null);
    setResult(null);
    setSpinning(true);
    try {
      const res = await apiClient<SpinResponse>('/games/wheel/spin', {
        method: 'POST',
        json: { stake: stake.trim(), idempotencyKey: `wheel-${crypto.randomUUID()}` },
      });
      const centre = res.segment * STEP + STEP / 2;
      const current = rotRef.current % 360;
      const next = rotRef.current + 360 * 6 + ((360 - centre - current) % 360 + 360) % 360;
      rotRef.current = next;
      setRotation(next);
      await new Promise((r) => setTimeout(r, 4300));
      const payout = BigInt(res.payout.amountMinor);
      const staked = BigInt(res.stake.amountMinor);
      const round: Round = { id: res.roundId, multiplier: res.multiplier, stake: res.stake.amountMinor, payout: res.payout.amountMinor, won: payout > staked };
      setResult(round);
      setHistory((h) => [round, ...h].slice(0, 10));
      setBalance(res.balance.amountMinor);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = err.fields ? ` (${Object.keys(err.fields).join(', ')})` : '';
        setError(`${tRoot(errorMessageKey(err.code) as never)}${fields}`);
      } else {
        setError(tRoot('errors.generic' as never));
      }
    } finally {
      setSpinning(false);
    }
  }

  return (
    <div className="wheel-wrap">
      <div className="wheel-stage">
        <div className="wheel-pointer" aria-hidden="true" />
        <svg viewBox="0 0 320 320" className="wheel-svg" role="img" aria-label={t('title')}>
          <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: '160px 160px', transition: spinning && rotation !== 0 ? 'transform 4.2s cubic-bezier(0.12, 0.7, 0.1, 1)' : 'none' }}>
            {WHEEL_SEGMENTS.map((s, i) => {
              const a0 = i * STEP;
              const a1 = (i + 1) * STEP;
              const [x0, y0] = point(a0, R);
              const [x1, y1] = point(a1, R);
              const [tx, ty] = point(a0 + STEP / 2, R * 0.78);
              return (
                <g key={i}>
                  <path d={`M${C},${C} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`} fill={color(s.num, s.den)} stroke="#f5c518" strokeWidth="1" />
                  <text x={tx} y={ty} fill="#fff" fontSize="11" fontWeight="800" textAnchor="middle" dominantBaseline="middle" transform={`rotate(${a0 + STEP / 2} ${tx.toFixed(2)} ${ty.toFixed(2)})`}>
                    {s.label}
                  </text>
                </g>
              );
            })}
            <circle cx={C} cy={C} r="26" fill="#0b0912" stroke="#f5c518" strokeWidth="4" />
            <text x={C} y={C} fill="#f5c518" fontSize="14" fontWeight="900" textAnchor="middle" dominantBaseline="middle">
              A
            </text>
          </g>
        </svg>
      </div>

      <div className="wheel-panel card">
        <GameAiButton active={spinning} />
        <p className="muted">
          {t('balance')}: <strong>{fmt(balance)}</strong>
        </p>
        <div className="field">
          <StakeField stake={stake} setStake={setStake} currency={currency} disabled={spinning} label={t('stake')} />
          <small className="muted">{t('limits', { min: fmt(min), max: fmt(max) })}</small>
        </div>
        <div className="admin-actions">
          <button type="button" className="btn btn-ghost btn-sm" disabled={spinning} onClick={() => setQuick('min')}>
            {t('min')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={spinning} onClick={() => setQuick('half')}>
            ½
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={spinning} onClick={() => setQuick('double')}>
            2×
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={spinning} onClick={() => setQuick('max')}>
            {t('max')}
          </button>
        </div>
        <button type="button" className="btn btn-gold wheel-spin" disabled={spinning} onClick={() => void spin()}>
          {spinning ? t('spinning') : t('spin')}
        </button>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {result ? (
          <div className={result.won ? 'alert alert-success wheel-result' : 'alert wheel-result'}>
            <strong>{result.multiplier}</strong>{' '}
            {result.won ? t('resultWin', { amount: fmt(result.payout) }) : BigInt(result.payout) === BigInt(result.stake) ? t('resultRefund') : BigInt(result.payout) > 0n ? t('resultPartial', { amount: fmt(result.payout) }) : t('resultLose', { amount: fmt(result.stake) })}
          </div>
        ) : null}
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          {t('rtp', { rtp: WHEEL_RTP_PERCENT.toFixed(2) })}
        </p>
      </div>

      {history.length > 0 ? (
        <div className="card wheel-history">
          <h3>{t('recent')}</h3>
          <ul>
            {history.map((h) => (
              <li key={h.id}>
                {(() => {
                  const st = BigInt(h.stake);
                  const po = BigInt(h.payout);
                  const kind = po > st ? 'win' : po === 0n ? 'lose' : po === st ? 'refund' : 'partial';
                  const net = po - st;
                  return (
                    <>
                      <span className={`round-tag round-${kind}`}>{t(`hist_${kind}`)}</span> <strong>{h.multiplier}</strong> — {fmt(h.stake)} → {fmt(h.payout)}{' '}
                      <span className={net > 0n ? 'amount-in' : net < 0n ? 'amount-out' : ''}>
                        {net > 0n ? '+' : net < 0n ? '−' : ''}
                        {fmt(net < 0n ? -net : net)}
                      </span>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
