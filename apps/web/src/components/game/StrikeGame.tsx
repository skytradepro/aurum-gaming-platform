'use client';

import { STRIKE_LEVELS } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export function StrikeGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/strike/play', currency, locale, initialBalanceMinor });
  const [lit, setLit] = useState(0);
  const [swing, setSwing] = useState(false);
  const [ring, setRing] = useState(false);

  async function strike() {
    setLit(0);
    setRing(false);
    await r.play({}, async (res) => {
      setSwing(true);
      await wait(520);
      const level = Number(res.detail.level);
      for (let i = 1; i <= level; i += 1) {
        setLit(i);
        await wait(230);
      }
      if (level === STRIKE_LEVELS.length) setRing(true);
      await wait(250);
      setSwing(false);
    });
  }

  const levels = [...STRIKE_LEVELS].reverse();
  return (
    <div className="wheel-wrap">
      <div className="tower">
        <div className="tower-levels">
          {levels.map((l) => (
            <div key={l.level} className={`tower-level${lit >= l.level ? ' lit' : ''}${l.level === STRIKE_LEVELS.length ? ' top' : ''}`}>
              <span>
                {l.level === STRIKE_LEVELS.length ? <span className={`tower-bell${ring ? ' ring' : ''}`}>🔔</span> : null} {t('strikeLevel', { n: l.level })}
              </span>
              <span>{l.tenths / 10}×</span>
            </div>
          ))}
        </div>
        <div className={`tower-hammer${swing ? ' swing' : ''}`} aria-hidden="true">
          🔨
        </div>
      </div>
      <StakeBox r={r} currency={currency} rtp={94}>
        <p className="muted">{t('strikeRule')}</p>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void strike()}>
          {r.busy ? t('striking') : t('strike')}
        </button>
      </StakeBox>
    </div>
  );
}
