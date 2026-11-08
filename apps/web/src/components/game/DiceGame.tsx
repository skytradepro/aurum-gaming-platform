'use client';

import { DICE_RTP_PERCENT, DICE_TARGET_MAX, DICE_TARGET_MIN, diceChance, type DiceDirection } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

export function DiceGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/dice/play', currency, locale, initialBalanceMinor });
  const [direction, setDirection] = useState<DiceDirection>('under');
  const [target, setTarget] = useState(50);
  const [shown, setShown] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);

  const chance = diceChance(direction, target);
  const multiplier = (DICE_RTP_PERCENT / chance).toFixed(2);

  async function roll() {
    setWon(null);
    await r.play({ direction, target }, async (res) => {
      const final = Number(res.detail.roll);
      const timer = setInterval(() => setShown(Math.round(Math.random() * 9999) / 100), 70);
      await new Promise((ok) => setTimeout(ok, 1300));
      clearInterval(timer);
      setShown(final);
      setWon(res.win);
    });
  }

  const winFrom = direction === 'under' ? 0 : target;
  const winTo = direction === 'under' ? target : 100;

  return (
    <div className="wheel-wrap">
      <div className="dice-stage card">
        <div className={won === null ? 'dice-number' : won ? 'dice-number dice-win' : 'dice-number dice-lose'}>{shown === null ? '--.--' : shown.toFixed(2)}</div>
        <div className="dice-bar" aria-hidden="true">
          <div className="dice-bar-win" style={{ left: `${winFrom}%`, width: `${winTo - winFrom}%` }} />
          {shown !== null ? <div className="dice-marker" style={{ left: `${shown}%` }} /> : null}
        </div>
        <div className="dice-scale">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
      <StakeBox r={r} currency={currency} rtp={DICE_RTP_PERCENT}>
        <div className="admin-actions" style={{ marginTop: '0.8rem' }}>
          {(['under', 'over'] as const).map((d) => (
            <button key={d} type="button" disabled={r.busy} className={direction === d ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setDirection(d)}>
              {t(d)}
            </button>
          ))}
        </div>
        <div className="field">
          <label>
            {t('target')}: <strong>{target}</strong>
          </label>
          <input type="range" min={DICE_TARGET_MIN} max={DICE_TARGET_MAX} value={target} disabled={r.busy} onChange={(e) => setTarget(Number(e.target.value))} />
        </div>
        <p className="muted">
          {t('winChance')}: <strong>{chance}%</strong> · {t('multiplier')}: <strong>{multiplier}×</strong>
        </p>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void roll()}>
          {r.busy ? t('rolling') : t('roll')}
        </button>
      </StakeBox>
    </div>
  );
}
