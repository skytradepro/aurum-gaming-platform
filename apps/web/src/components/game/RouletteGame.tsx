'use client';

import { ROULETTE_BETS, rouletteColor, roulettePocketLabel, type RouletteBet } from '@aurum/shared';
import { Roulette3D, pocketAngle, useRouletteSound } from './Roulette3D';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

const BET_LABEL: Record<RouletteBet, string> = {
  straight: 'betStraight',
  red: 'betRed',
  black: 'betBlack',
  even: 'betEven',
  odd: 'betOdd',
  low: 'betLow',
  high: 'betHigh',
  dozen1: 'betDozen1',
  dozen2: 'betDozen2',
  dozen3: 'betDozen3',
};
const COLOR: Record<'green' | 'red' | 'black', string> = { green: '#1e8c4e', red: '#c0392b', black: '#1a1a1a' };

export function RouletteGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/roulette/play', currency, locale, initialBalanceMinor });
  const [bet, setBet] = useState<RouletteBet>('red');
  const [numberText, setNumberText] = useState('7');
  const [shown, setShown] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [wheelDeg, setWheelDeg] = useState(0);
  const [ballDeg, setBallDeg] = useState(0);
  const [ballIn, setBallIn] = useState(false);
  const [recent, setRecent] = useState<number[]>([]);
  const [sound, setSound] = useState(true);
  useEffect(() => {
    try {
      setSound(localStorage.getItem('roulette-sound') !== 'off');
    } catch {
      /* storage blocked: keep sound on */
    }
  }, []);
  const sfx = useRouletteSound(sound);

  const number = Number(numberText);
  const numberOk = bet !== 'straight' || (Number.isInteger(number) && number >= 0 && number <= 37);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem('roulette-sound', next ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }

  async function spin() {
    if (!numberOk) return;
    await r.play(bet === 'straight' ? { bet, number } : { bet }, async (res) => {
      const pocket = Number(res.detail.pocket);
      // The wheel turns clockwise 4-5 times; the ball runs the other way and must stop over the pocket.
      const nextWheel = wheelDeg + 360 * 4 + Math.floor(Math.random() * 360);
      const target = (((nextWheel + pocketAngle(pocket)) % 360) + 360) % 360;
      const base = ballDeg - 360 * 6;
      const nextBall = base - ((((base % 360) - target) % 360) + 360) % 360;
      setShown(null);
      setBallIn(false);
      setSpinning(true);
      setWheelDeg(nextWheel);
      setBallDeg(nextBall);
      sfx.spin(5);
      await new Promise((ok) => setTimeout(ok, 3900));
      setBallIn(true);
      await new Promise((ok) => setTimeout(ok, 1400));
      setSpinning(false);
      setShown(pocket);
      setRecent((list) => [pocket, ...list].slice(0, 12));
      if (BigInt(res.payout.amountMinor) > BigInt(res.stake.amountMinor)) sfx.win();
      else sfx.lose();
    });
  }

  return (
    <div className="wheel-wrap">
      <div className="card" style={{ textAlign: 'center', position: 'relative' }}>
        <button type="button" className="btn btn-ghost btn-sm" style={{ position: 'absolute', top: '0.6rem', insetInlineEnd: '0.6rem', zIndex: 3 }} onClick={toggleSound} aria-label={t('sound')}>
          {sound ? '🔊' : '🔇'}
        </button>
        <Roulette3D wheelDeg={wheelDeg} ballDeg={ballDeg} ballIn={ballIn} spinning={spinning} landed={shown} />
        <div className="r3d-history">
          {recent.map((p, i) => (
            <span key={i} style={{ background: COLOR[rouletteColor(p)] }}>
              {roulettePocketLabel(p)}
            </span>
          ))}
        </div>
      </div>
      <StakeBox r={r} currency={currency} rtp={94.74}>
        <div className="admin-actions" style={{ marginTop: '0.8rem', flexWrap: 'wrap' }}>
          {ROULETTE_BETS.map((b) => (
            <button key={b} type="button" disabled={r.busy} className={bet === b ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setBet(b)}>
              {t(BET_LABEL[b] as never)}
            </button>
          ))}
        </div>
        {bet === 'straight' ? (
          <div className="field">
            <label>{t('pickNumber')}</label>
            <input inputMode="numeric" value={numberText} disabled={r.busy} onChange={(e) => setNumberText(e.target.value)} />
          </div>
        ) : null}
        <p className="muted">{t('roulettePays')}</p>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy || !numberOk} onClick={() => void spin()}>
          {r.busy ? t('spinningRoulette') : t('spinRoulette')}
        </button>
      </StakeBox>
    </div>
  );
}
