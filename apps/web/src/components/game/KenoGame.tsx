'use client';

import { KENO_MAX_PICKS, KENO_NUMBERS, KENO_TABLE } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

export function KenoGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/keno/play', currency, locale, initialBalanceMinor });
  const [picks, setPicks] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);

  function toggle(n: number) {
    if (r.busy) return;
    setDrawn([]);
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length < KENO_MAX_PICKS ? [...p, n] : p));
  }

  async function play() {
    setDrawn([]);
    await r.play({ picks }, async (res) => {
      const all = res.detail.drawn as number[];
      for (let i = 1; i <= all.length; i += 1) {
        setDrawn(all.slice(0, i));
        await new Promise((ok) => setTimeout(ok, 150));
      }
    });
  }

  const table = KENO_TABLE[picks.length] ?? {};
  return (
    <div className="wheel-wrap">
      <div className="dice-stage card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '0.35rem' }}>
          {Array.from({ length: KENO_NUMBERS }, (_, n) => {
            const picked = picks.includes(n);
            const hit = picked && drawn.includes(n);
            return (
              <button
                key={n}
                type="button"
                className={hit ? 'btn btn-gold btn-sm' : picked ? 'btn btn-sm' : 'btn btn-ghost btn-sm'}
                style={!picked && drawn.includes(n) ? { outline: '2px solid #f5c518' } : picked && !hit ? { outline: '2px solid #888' } : undefined}
                onClick={() => toggle(n)}
              >
                {n + 1}
              </button>
            );
          })}
        </div>
        <p className="muted">{t('kenoPicks', { n: picks.length, max: KENO_MAX_PICKS })}</p>
        {picks.length > 0 ? (
          <p className="muted">
            {t('kenoPays')} {Object.entries(table).map(([h, m]) => `${h}: ${m / 10}×`).join(' · ')}
          </p>
        ) : null}
        {r.result ? <p>{t('kenoHits', { n: Number(r.result.detail.hits) })}</p> : null}
      </div>
      <StakeBox r={r} currency={currency} rtp={93.5}>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy || picks.length === 0} onClick={() => void play()}>
          {r.busy ? t('playing') : t('playNow')}
        </button>
      </StakeBox>
    </div>
  );
}
