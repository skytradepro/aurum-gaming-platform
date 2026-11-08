'use client';

import '@/styles/candy-burst.css';
import '@/styles/line-game.css';
import { JEWEL_BASE_STRAIGHT, JEWEL_MULTS, JEWEL_ROULETTE_RTP, rouletteColor, type JewelBet } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { EURO_ORDER, Roulette3D, pocketAngle, useRouletteSound } from './Roulette3D';
import { StakeBox } from './StakeBox';
import { useRound, type RoundResponse } from './useRound';

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const OUTSIDE: { bet: Exclude<JewelBet, 'straight'>; key: string; pays: number }[] = [
  { bet: 'dozen1', key: 'betDozen1', pays: 3 },
  { bet: 'dozen2', key: 'betDozen2', pays: 3 },
  { bet: 'dozen3', key: 'betDozen3', pays: 3 },
  { bet: 'low', key: 'betLow', pays: 2 },
  { bet: 'even', key: 'betEven', pays: 2 },
  { bet: 'red', key: 'betRed', pays: 2 },
  { bet: 'black', key: 'betBlack', pays: 2 },
  { bet: 'odd', key: 'betOdd', pays: 2 },
  { bet: 'high', key: 'betHigh', pays: 2 },
];
/** Table layout: three rows (3, 6 … 36 on top), twelve columns. */
const ROWS = [3, 2, 1].map((top) => Array.from({ length: 12 }, (_, c) => c * 3 + top));
type Jewel = { number: number; mult: number };

/** A roulette room: the same table and multiplier numbers, with its own game id, texts (same keys) and look. */
export interface RouletteRoom {
  game: 'jewelroulette' | 'thunderroulette';
  ns: 'jewelRoulette' | 'thunderRoulette';
  label: string;
  className: string;
  icon: string;
}
const JEWEL_ROOM: RouletteRoom = { game: 'jewelroulette', ns: 'jewelRoulette', label: 'HANNIBAL Jewel Roulette', className: '', icon: '◆' };
/** Hannibal Thunder Roulette: lightning numbers instead of jewels. */
export const THUNDER_ROOM: RouletteRoom = { game: 'thunderroulette', ns: 'thunderRoulette', label: 'HANNIBAL Thunder Roulette', className: 'jr-thunder', icon: '⚡' };

/** Jewel Roulette: European wheel; every spin lights 1-5 jewel numbers that pay 50× to 500× on a single-number bet. */
export function JewelRouletteGame({ currency, locale, initialBalanceMinor, room = JEWEL_ROOM }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string; room?: RouletteRoom }) {
  // both rooms have the same text keys
  const t = useTranslations(room.ns as 'jewelRoulette');
  const tg = useTranslations('games');
  const tl = useTranslations('lineSlot');
  const r = useRound({ endpoint: `/games/${room.game}/play`, currency, locale, initialBalanceMinor });
  const rRef = useRef(r);
  rRef.current = r;
  const [bet, setBet] = useState<JewelBet>('straight');
  const [number, setNumber] = useState(17);
  const [jewels, setJewels] = useState<Jewel[]>([]);
  const [flash, setFlash] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [wheelDeg, setWheelDeg] = useState(0);
  const [ballDeg, setBallDeg] = useState(0);
  const [ballIn, setBallIn] = useState(false);
  const [recent, setRecent] = useState<number[]>([]);
  const [won, setWon] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [sound, setSound] = useState(true);
  useEffect(() => {
    try {
      setSound(localStorage.getItem('roulette-sound') !== 'off');
    } catch {
      /* storage blocked: keep sound on */
    }
  }, []);
  const sfx = useRouletteSound(sound);
  const wheel = useRef({ wheel: 0, ball: 0 });

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try {
      localStorage.setItem('roulette-sound', next ? 'on' : 'off');
    } catch {
      /* ignore */
    }
  }

  async function present(res: RoundResponse) {
    const d = res.detail as { pocket: number; jewels: Jewel[] };
    // 1. The jewel numbers light up, 2. the wheel spins, 3. the ball drops.
    setJewels(d.jewels);
    setFlash(true);
    sfx.win();
    await wait(1300);
    setFlash(false);
    const nextWheel = wheel.current.wheel + 360 * 4 + Math.floor(Math.random() * 360);
    const target = (((nextWheel + pocketAngle(d.pocket, EURO_ORDER)) % 360) + 360) % 360;
    const base = wheel.current.ball - 360 * 6;
    const nextBall = base - (((((base % 360) - target) % 360) + 360) % 360);
    wheel.current = { wheel: nextWheel, ball: nextBall };
    setBallIn(false);
    setSpinning(true);
    setWheelDeg(nextWheel);
    setBallDeg(nextBall);
    sfx.spin(5);
    await wait(3900);
    setBallIn(true);
    await wait(1400);
    setSpinning(false);
    setShown(d.pocket);
    setRecent((list) => [d.pocket, ...list].slice(0, 14));
    const win = BigInt(res.payout.amountMinor) > 0n;
    setWon(win ? res.payout.amountMinor : null);
    if (win) sfx.win();
    else sfx.lose();
  }

  async function spin() {
    if (rRef.current.busy || spinning) return;
    setShown(null);
    setWon(null);
    setJewels([]);
    await rRef.current.play(bet === 'straight' ? { bet, number } : { bet }, present);
  }

  const gem = new Map(jewels.map((j) => [j.number, j.mult]));
  const cell = (n: number) => {
    const g = gem.get(n);
    const cls = ['jr-n', `is-${rouletteColor(n)}`, bet === 'straight' && number === n ? 'is-on' : '', g ? 'is-gem' : '', shown === n ? 'is-hit' : ''].filter(Boolean).join(' ');
    return (
      <button key={n} type="button" className={cls} disabled={r.busy} onClick={() => { setBet('straight'); setNumber(n); }} aria-pressed={bet === 'straight' && number === n}>
        {n}
        {g ? <i>{g}×</i> : null}
      </button>
    );
  };

  return (
    <div className={`cb-wrap lg-wrap jr-wrap ${room.className}`.trim()}>
      <section className="cb-stage jr-stage" aria-label={room.label}>
        <div className="cb-top">
          <div className="cb-mult">
            <small>{t('topPay')}</small>
            <strong>500×</strong>
          </div>
          <div className="cb-tools">
            <button type="button" className="cb-tool" onClick={toggleSound} aria-label={tg('sound')} title={tg('sound')}>
              {sound ? '🔊' : '🔇'}
            </button>
            <button type="button" className="cb-tool" onClick={() => setShowInfo(true)} aria-label={t('info')} title={t('info')}>
              i
            </button>
          </div>
        </div>
        <div className="jr-wheel">
          <Roulette3D
            wheelDeg={wheelDeg}
            ballDeg={ballDeg}
            ballIn={ballIn}
            spinning={spinning}
            landed={shown}
            order={EURO_ORDER}
            jewels={gem}
          />
          <div className={flash ? 'jr-gems is-flash' : 'jr-gems'} aria-live="polite">
            {jewels.length > 0 ? (
              <>
                <small>{t('jewels')}</small>
                {jewels.map((j) => (
                  <span key={j.number} className={`is-${rouletteColor(j.number)}`}>
                    {j.number} <b>{j.mult}×</b>
                  </span>
                ))}
              </>
            ) : (
              <small>{r.busy ? t('lighting') : t('jewelsHint')}</small>
            )}
          </div>
        </div>
        <div className="jr-board" dir="ltr">
          <div className="jr-zero">{cell(0)}</div>
          <div className="jr-grid">{ROWS.map((row) => row.map(cell))}</div>
          <div className="jr-outside">
            {OUTSIDE.map((o) => (
              <button key={o.bet} type="button" disabled={r.busy} className={bet === o.bet ? 'jr-o is-on' : 'jr-o'} onClick={() => setBet(o.bet)} aria-pressed={bet === o.bet}>
                {tg(o.key as never)}
                <small>{o.pays}×</small>
              </button>
            ))}
          </div>
        </div>
        <div className="cb-bar">
          <div className="cb-win">
            <small>{tl('win')}</small>
            <strong>{won ? r.fmt(won) : r.fmt(0n)}</strong>
          </div>
          <div className="jr-history">
            {recent.map((p, i) => (
              <span key={i} className={`is-${rouletteColor(p)}`}>
                {p}
              </span>
            ))}
          </div>
        </div>
        {showInfo ? (
          <div className="cb-info" role="dialog" aria-modal="true" aria-label={t('rulesTitle')}>
            <div className="cb-info-card">
              <h3>{t('rulesTitle')}</h3>
              <ul className="cb-rules">
                <li>{t('rule1')}</li>
                <li>{t('rule2', { base: JEWEL_BASE_STRAIGHT, min: Math.min(...JEWEL_MULTS), max: Math.max(...JEWEL_MULTS) })}</li>
                <li>{t('rule3')}</li>
                <li>{t('rule4')}</li>
                <li>{t('ruleRtp', { rtp: JEWEL_ROULETTE_RTP })}</li>
                <li>{t('ruleServer')}</li>
              </ul>
              <button type="button" className="btn btn-gold" onClick={() => setShowInfo(false)}>
                {t('close')}
              </button>
            </div>
          </div>
        ) : null}
      </section>
      <div className="cb-side">
        <StakeBox r={r} currency={currency} rtp={JEWEL_ROULETTE_RTP}>
          <p className="muted" style={{ margin: '0.4rem 0' }}>
            {bet === 'straight' ? t('yourNumber', { number }) : t('yourBet', { bet: tg(OUTSIDE.find((o) => o.bet === bet)?.key as never) })}
          </p>
          <div className="cb-controls">
            <button type="button" className="cb-spin" disabled={r.busy || spinning} onClick={() => void spin()}>
              <span className="cb-spin-icon" aria-hidden="true">
                {room.icon}
              </span>
              <span>{r.busy || spinning ? tg('spinningRoulette') : tg('spinRoulette')}</span>
            </button>
          </div>
        </StakeBox>
      </div>
    </div>
  );
}
