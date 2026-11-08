'use client';

import { MINES_COUNTS, MINES_TILES, minesPayout } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

export function MinesGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/mines/play', currency, locale, initialBalanceMinor });
  const [mines, setMines] = useState<number>(3);
  const [tiles, setTiles] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<number[] | null>(null);

  const pay = tiles.length > 0 ? minesPayout(mines, tiles.length) : null;
  const mult = pay ? Math.floor((pay.num * 100) / pay.den) / 100 : null;

  function toggle(n: number) {
    if (r.busy) return;
    setRevealed(null);
    setTiles((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  }

  async function play() {
    setRevealed(null);
    await r.play({ mines, tiles }, async (res) => {
      await new Promise((ok) => setTimeout(ok, 500));
      setRevealed(res.detail.mines as number[]);
    });
  }

  return (
    <div className="wheel-wrap">
      <div className="dice-stage card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem', maxWidth: '24rem', margin: '0 auto' }}>
          {Array.from({ length: MINES_TILES }, (_, n) => {
            const isMine = revealed?.includes(n) ?? false;
            const chosen = tiles.includes(n);
            return (
              <button
                key={n}
                type="button"
                className={chosen && !isMine ? 'btn btn-gold' : 'btn btn-ghost'}
                style={{ height: '3.2rem', background: isMine ? '#c0392b' : undefined, color: isMine ? '#fff' : undefined }}
                onClick={() => toggle(n)}
              >
                {isMine ? '💣' : revealed && chosen ? '💎' : ''}
              </button>
            );
          })}
        </div>
        <p className="muted">{mult !== null ? t('minesMultiplier', { x: mult }) : tiles.length > 0 ? t('minesNotAllowed') : t('minesChoose')}</p>
      </div>
      <StakeBox r={r} currency={currency} rtp={94}>
        <div className="admin-actions" style={{ marginTop: '0.8rem' }}>
          {MINES_COUNTS.map((m) => (
            <button key={m} type="button" disabled={r.busy} className={mines === m ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setMines(m)}>
              {t('minesCount', { n: m })}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy || !pay} onClick={() => void play()}>
          {r.busy ? t('playing') : t('playNow')}
        </button>
      </StakeBox>
    </div>
  );
}
