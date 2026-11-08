'use client';

import '@/styles/gift.css';
import { errorMessageKey } from '@aurum/i18n';
import { ApiError, apiClient } from '@/lib/api';
import { Link, useRouter } from '@/i18n/routing';
import { formatAmountMinor } from '@/lib/money-display';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export interface GiftStatusDTO {
  enabled: boolean;
  state: 'ready' | 'opened' | 'deposit' | 'soldOut' | 'off';
  nextAt: string;
  currency: string | null;
  amountMinor: string | null;
  min: string | null;
  max: string | null;
}

/** Places of the little stars around the box (percent of the stage). */
const SPARKS: [number, number][] = [
  [12, 22],
  [82, 18],
  [20, 70],
  [88, 62],
  [50, 8],
  [8, 46],
  [92, 40],
  [30, 88],
  [70, 86],
  [62, 14],
];

const two = (n: number) => String(n).padStart(2, '0');

/** Time left until the next gift, as 05:12:09. */
function useCountdown(to: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const left = Math.max(0, Math.floor((Date.parse(to) - now) / 1000));
  return `${two(Math.floor(left / 3600))}:${two(Math.floor((left % 3600) / 60))}:${two(left % 60)}`;
}

/** The daily gift: a gift box that shakes, opens with coins and confetti, and shows what the player received. */
export function GiftBox({ initial, currency, locale }: { initial: GiftStatusDTO | null; currency: CurrencyDTO | null; locale: string }) {
  const t = useTranslations('gift');
  const tRoot = useTranslations();
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [phase, setPhase] = useState<'idle' | 'shake' | 'open'>(initial?.state === 'opened' ? 'open' : 'idle');
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const countdown = useCountdown(status?.nextAt ?? new Date().toISOString());
  const fmt = (minor: string | null) => (minor && currency ? formatAmountMinor(minor, currency, locale, 'full') : '');

  async function open() {
    if (!status || status.state !== 'ready' || phase !== 'idle') return;
    setError(null);
    setPhase('shake');
    const started = Date.now();
    try {
      const res = await apiClient<{ amountMinor: string; currency: string; balanceMinor: string; nextAt: string }>('/gift/open', { method: 'POST', json: {} });
      // let the box shake a moment before it opens
      await new Promise((r) => setTimeout(r, Math.max(0, 900 - (Date.now() - started))));
      setStatus({ ...status, state: 'opened', amountMinor: res.amountMinor, nextAt: res.nextAt });
      setFresh(true);
      setPhase('open');
      router.refresh();
    } catch (err) {
      setPhase('idle');
      setError(tRoot((err instanceof ApiError ? errorMessageKey(err.code) : 'errors.generic') as never));
    }
  }

  const state = status?.state ?? 'guest';
  return (
    <section className={`gift-page is-${state}`}>
      <div className={`gift-stage is-${phase}${fresh ? ' is-fresh' : ''}`}>
        <span className="gift-rays" aria-hidden="true" />
        <span className="gift-glow" aria-hidden="true" />
        <span className="gift-sparkles" aria-hidden="true">
          {SPARKS.map(([x, y], i) => (
            <i key={i} style={{ ['--i' as string]: i, left: `${x}%`, top: `${y}%` }} />
          ))}
        </span>
        <button type="button" className="gift-box" onClick={() => void open()} disabled={state !== 'ready' || phase !== 'idle'} aria-label={t('open')}>
          <span className="gift-lid">
            <span className="gift-bow" aria-hidden="true">
              <i />
              <i />
            </span>
          </span>
          <span className="gift-body" aria-hidden="true" />
        </button>
        {phase === 'open' && fresh ? (
          <span className="gift-burst" aria-hidden="true">
            {Array.from({ length: 16 }, (_, i) => (
              <i key={i} style={{ ['--a' as string]: `${i * 22.5}deg`, ['--d' as string]: `${(i % 4) * 0.05}s` }} />
            ))}
          </span>
        ) : null}
        {phase === 'open' && status?.amountMinor ? (
          <div className="gift-reveal" role="status">
            <small>{t('youWon')}</small>
            <b>+{fmt(status.amountMinor)}</b>
          </div>
        ) : null}
      </div>

      <div className="gift-panel">
        <h1 className="gift-title">{t('title')}</h1>
        <p className="gift-sub">{t('sub')}</p>
        {error ? <div className="alert alert-error">{error}</div> : null}
        {state === 'guest' ? (
          <div className="gift-actions">
            <Link href="/login" className="btn btn-gold btn-lg">
              {t('login')}
            </Link>
            <Link href="/register" className="btn btn-dark btn-lg">
              {t('register')}
            </Link>
          </div>
        ) : null}
        {state === 'ready' ? (
          <>
            <button type="button" className="btn btn-gold btn-lg gift-cta" onClick={() => void open()} disabled={phase !== 'idle'}>
              {phase === 'idle' ? t('open') : t('opening')}
            </button>
            {status?.min && status.max ? <p className="muted gift-range">{t('range', { min: fmt(status.min), max: fmt(status.max) })}</p> : null}
          </>
        ) : null}
        {state === 'opened' ? (
          <div className="gift-next">
            <span>{t('nextIn')}</span>
            <b dir="ltr">{countdown}</b>
            <Link href="/casino" className="btn btn-gold">
              {t('play')}
            </Link>
          </div>
        ) : null}
        {state === 'soldOut' ? (
          <div className="gift-next">
            <span>{t('soldOut')}</span>
            <b dir="ltr">{countdown}</b>
          </div>
        ) : null}
        {state === 'deposit' ? (
          <div className="gift-note">
            <p>{t('deposit')}</p>
            <Link href="/account/deposits" className="btn btn-gold">
              {t('depositCta')}
            </Link>
          </div>
        ) : null}
        {state === 'off' ? <p className="gift-note">{t('off')}</p> : null}
        <ul className="gift-rules">
          <li>{t('rule1')}</li>
          <li>{t('rule2')}</li>
          <li>{t('rule3')}</li>
        </ul>
      </div>
    </section>
  );
}
