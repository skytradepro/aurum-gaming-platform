'use client';

import { COIN_PAYOUT, type CoinSide } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

export function CoinGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/coin/play', currency, locale, initialBalanceMinor });
  const [side, setSide] = useState<CoinSide>('heads');
  const [turns, setTurns] = useState(0);
  const [flipping, setFlipping] = useState(false);

  async function flip() {
    await r.play({ side }, async (res) => {
      const landed = res.detail.result === 'tails' ? 180 : 0;
      setFlipping(true);
      setTurns((cur) => cur + 360 * 6 + ((landed - (cur % 360)) + 360) % 360);
      await new Promise((ok) => setTimeout(ok, 2100));
      setFlipping(false);
    });
  }

  return (
    <div className="wheel-wrap">
      <div className="coin-stage">
        <div className="coin" style={{ transform: `rotateY(${turns}deg)`, transition: flipping ? 'transform 2s cubic-bezier(0.2, 0.6, 0.2, 1)' : 'none' }}>
          <div className="coin-face coin-heads">{t('headsShort')}</div>
          <div className="coin-face coin-tails">{t('tailsShort')}</div>
        </div>
      </div>
      <StakeBox r={r} currency={currency} rtp={(COIN_PAYOUT.num / COIN_PAYOUT.den) * 50}>
        <div className="admin-actions" style={{ marginTop: '0.8rem' }}>
          {(['heads', 'tails'] as const).map((s) => (
            <button key={s} type="button" disabled={r.busy} className={side === s ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setSide(s)}>
              {t(s)}
            </button>
          ))}
        </div>
        <p className="muted">{t('coinPays')}</p>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void flip()}>
          {r.busy ? t('flipping') : t('flip')}
        </button>
      </StakeBox>
    </div>
  );
}
