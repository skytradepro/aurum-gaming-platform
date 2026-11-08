'use client';

import '@/styles/crazy-time.css';
import { CT_CAP_X, CT_PACHINKO_ROWS, CT_RTP, CT_SPOTS, CT_WHEEL, ctIsBonus, type CtBonusDetail, type CtSpot } from '@aurum/shared';
import { Link } from '@/i18n/routing';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GameAiButton } from './GameInfo';
import { plain, useRound, type RoundResponse } from './useRound';

/** Pictures of the studio (public/media/games/crazytime). */
const ART = '/media/games/crazytime';
const COLOR: Record<CtSpot, string> = {
  '1': '#1d8fe0',
  '2': '#f2b800',
  '5': '#e8338a',
  '10': '#7b3fe4',
  coinflip: '#1f5fd6',
  pachinko: '#a93ee0',
  cashhunt: '#16a34a',
  crazytime: '#e3262f',
};
/** Short words written on the wheel. */
const WHEEL_WORD: Record<CtSpot, string> = { '1': '1', '2': '2', '5': '5', '10': '10', coinflip: 'COIN', pachinko: 'PACH', cashhunt: 'CASH', crazytime: 'CRAZY' };
const SPIN_MS = 4200;

// ---------------------------------------------------------------------------------------------
// Sound: small synthesized effects (Web Audio), same on/off switch as the other games ("cb-sound").
// ---------------------------------------------------------------------------------------------
class WheelSound {
  private ctx: AudioContext | null = null;
  on = true;
  private get ac(): AudioContext | null {
    if (!this.on || typeof window === 'undefined') return null;
    try {
      this.ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }
  tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.06, when = 0, slide = 0) {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  /** Clicks of the wheel pins, slowing down like the wheel. */
  ticks(ms: number) {
    const n = 34;
    for (let i = 0; i < n; i += 1) {
      const p = i / n;
      this.tone(1500, 0.025, 'square', 0.02, (ms / 1000) * (1 - (1 - p) ** 0.5));
    }
  }
  fanfare() {
    [0, 4, 7, 12, 16].forEach((s, i) => this.tone(523 * 2 ** (s / 12), 0.22, 'triangle', 0.07, i * 0.09));
  }
  win() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(659 * 2 ** (s / 12), 0.16, 'triangle', 0.06, i * 0.07));
  }
  lose() {
    this.tone(260, 0.16, 'sine', 0.035, 0, -80);
  }
  pop() {
    this.tone(900, 0.07, 'square', 0.03, 0, -400);
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

function betLadder(min: bigint, max: bigint, decimals: number): bigint[] {
  const unit = 10n ** BigInt(decimals);
  const out = new Set<bigint>([min, max]);
  for (let e = -decimals; e <= 7; e += 1) {
    for (const m of [1n, 2n, 5n]) {
      const v = e >= 0 ? m * 10n ** BigInt(e) * unit : (m * unit) / 10n ** BigInt(-e);
      if (v > 0n && v >= min && v <= max) out.add(v);
    }
  }
  return [...out].filter((v) => v > 0n).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function toMinor(stake: string, decimals: number): bigint {
  try {
    const [w = '0', f = ''] = stake.trim().split('.');
    return BigInt(w || '0') * 10n ** BigInt(decimals) + BigInt(f.padEnd(decimals, '0').slice(0, decimals) || '0');
  } catch {
    return 0n;
  }
}

const pt = (r: number, deg: number): string => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${(200 + r * Math.cos(a)).toFixed(2)} ${(200 + r * Math.sin(a)).toFixed(2)}`;
};

/** A money wheel (main wheel or the Crazy Time bonus wheel): coloured segments with their words. */
function WheelFace({ labels, colors, small }: { labels: readonly string[]; colors: readonly string[]; small?: boolean }) {
  const n = labels.length;
  const slice = 360 / n;
  return (
    <svg viewBox="0 0 400 400" className="ct-face" aria-hidden="true">
      <circle cx="200" cy="200" r="198" fill="#2b0a3d" stroke="#ffd54a" strokeWidth="4" />
      {labels.map((label, i) => {
        const a0 = i * slice;
        const a1 = a0 + slice;
        const mid = a0 + slice / 2;
        const word = label.length > 2;
        return (
          <g key={i}>
            <path d={`M200 200 L${pt(188, a0)} A188 188 0 0 1 ${pt(188, a1)} Z`} fill={colors[i]} stroke="#fff3c4" strokeWidth="1.2" />
            <text
              x="200"
              y={word ? 56 : 42}
              transform={word ? `rotate(${mid} 200 200) rotate(90 200 56)` : `rotate(${mid} 200 200)`}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={small ? 15 : word ? 10 : 15}
              fontWeight="900"
              fill="#fff"
              stroke="rgba(0,0,0,.45)"
              strokeWidth="2.4"
              style={{ paintOrder: 'stroke' }}
            >
              {label}
            </text>
          </g>
        );
      })}
      {Array.from({ length: n }, (_, i) => (
        <circle key={`p${i}`} cx={pt(192, i * slice).split(' ')[0]} cy={pt(192, i * slice).split(' ')[1]} r="2.6" fill="#ffe68a" />
      ))}
      <circle cx="200" cy="200" r="46" fill="url(#ct-hub)" stroke="#ffd54a" strokeWidth="4" />
      <defs>
        <radialGradient id="ct-hub" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor="#ffe9a3" />
          <stop offset="0.5" stopColor="#e3a21a" />
          <stop offset="1" stopColor="#7a4a00" />
        </radialGradient>
      </defs>
    </svg>
  );
}

type Phase = 'idle' | 'top' | 'spin' | 'bonus' | 'result';

// ---------------------------------------------------------------------------------------------
// Bonus shows
// ---------------------------------------------------------------------------------------------
function BonusShow({ bonus, top, onDone, ms, t, sound }: { bonus: CtBonusDetail; top: number; onDone: () => void; ms: (n: number) => number; t: (k: string, v?: Record<string, string | number>) => string; sound: WheelSound }) {
  const [step, setStep] = useState(0);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    let cancelled = false;
    const steps = bonus.kind === 'pachinko' ? CT_PACHINKO_ROWS + 2 : 3;
    const gap = bonus.kind === 'pachinko' ? ms(170) : ms(1100);
    (async () => {
      await wait(ms(700));
      for (let s = 1; s <= steps && !cancelled; s += 1) {
        setStep(s);
        if (bonus.kind === 'pachinko') sound.pop();
        await wait(gap);
      }
      if (cancelled) return;
      sound.fanfare();
      await wait(ms(1500));
      if (!cancelled) done.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [bonus, ms, sound]);

  const title = t(`spot.${bonus.kind}`);
  const result = step >= (bonus.kind === 'pachinko' ? CT_PACHINKO_ROWS + 1 : 2);
  return (
    <div className={`ct-bonus is-${bonus.kind}`} role="dialog" aria-label={title}>
      <h3>{title}</h3>
      {top > 1 ? <p className="ct-bonus-top">{t('topOnBonus', { mult: top })}</p> : null}

      {bonus.kind === 'coinflip' ? (
        <div className="ct-coin-row">
          <div className={`ct-side is-red${result && bonus.side === 'red' ? ' is-win' : ''}`}>×{bonus.red}</div>
          <div className={`ct-coin${step >= 1 ? ' is-flip' : ''} is-${bonus.side}`} aria-hidden="true">
            <i />
          </div>
          <div className={`ct-side is-blue${result && bonus.side === 'blue' ? ' is-win' : ''}`}>×{bonus.blue}</div>
        </div>
      ) : null}

      {bonus.kind === 'pachinko' ? (
        <div className="ct-pach" dir="ltr">
          <div className="ct-pach-board">
            {Array.from({ length: CT_PACHINKO_ROWS }, (_, r) => (
              <div key={r} className="ct-pach-row" style={{ ['--pegs' as string]: r + 1 }}>
                {Array.from({ length: r + 1 }, (_, k) => (
                  <i key={k} />
                ))}
              </div>
            ))}
            <span
              className="ct-puck"
              style={{
                ['--row' as string]: Math.min(step, CT_PACHINKO_ROWS),
                ['--x' as string]: 7.5 + bonus.path.slice(0, Math.min(step, CT_PACHINKO_ROWS)).reduce((a, b) => a + (b ? 0.5 : -0.5), 0),
              }}
            />
          </div>
          <div className="ct-pach-slots">
            {bonus.slots.map((v, i) => (
              <span key={i} className={result && i === bonus.slot ? 'is-win' : ''}>
                {v}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {bonus.kind === 'cashhunt' ? (
        <div className="ct-hunt" dir="ltr">
          {bonus.tiles.map((v, i) => (
            <span key={i} className={i === bonus.pick ? (step >= 1 ? 'is-pick is-open' : 'is-pick') : step >= 3 ? 'is-open is-dim' : ''}>
              <b>{v}</b>
              <i aria-hidden="true">★</i>
            </span>
          ))}
        </div>
      ) : null}

      {bonus.kind === 'crazytime' ? (
        <div className="ct-crazy">
          <div className="ct-crazy-wheel" style={{ transform: `rotate(${step >= 1 ? 360 * 4 - (bonus.pick * (360 / bonus.segments.length) + 360 / bonus.segments.length / 2) : 0}deg)` }}>
            <WheelFace labels={bonus.segments.map((v) => `${v}`)} colors={bonus.segments.map((_, i) => (i % 2 ? '#e3262f' : '#f2b800'))} small />
          </div>
          <span className="ct-pointer is-small" aria-hidden="true" />
        </div>
      ) : null}

      <p className={result ? 'ct-bonus-result is-on' : 'ct-bonus-result'}>{result ? `×${bonus.value}${top > 1 ? ` × ${top}` : ''}` : ' '}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------------------------
export function CrazyTimeGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('crazyTime');
  const tt = t as unknown as (k: string, v?: Record<string, string | number>) => string;
  const r = useRound({ endpoint: '/games/crazytime/play', currency, locale, initialBalanceMinor });
  const rRef = useRef(r);
  rRef.current = r;
  const sound = useRef(new WheelSound());
  const [soundOn, setSoundOn] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const turboRef = useRef(false);
  const [chosen, setChosen] = useState<CtSpot[]>([...CT_SPOTS]);
  const [phase, setPhase] = useState<Phase>('idle');
  const [deg, setDeg] = useState(0);
  const [landed, setLanded] = useState<number | null>(null);
  const [top, setTop] = useState<{ spot: CtSpot; mult: number } | null>(null);
  const [topRoll, setTopRoll] = useState<CtSpot | null>(null);
  const [bonus, setBonus] = useState<{ detail: CtBonusDetail; top: number } | null>(null);
  const bonusDone = useRef<(() => void) | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lastWin, setLastWin] = useState<bigint>(0n);
  const [recent, setRecent] = useState<CtSpot[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const [wheelArt, setWheelArt] = useState<'loading' | 'photo' | 'svg'>('loading');
  const degRef = useRef(0);

  useEffect(() => {
    try {
      if (localStorage.getItem('cb-sound') === '0') {
        setSoundOn(false);
        sound.current.on = false;
      }
      if (localStorage.getItem('cb-turbo') === '1') {
        setTurbo(true);
        turboRef.current = true;
      }
    } catch {
      /* storage not available: keep defaults */
    }
  }, []);

  const ms = useMemo(
    () => (n: number) => {
      const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      return Math.round(n * (turboRef.current || reduce ? 0.5 : 1));
    },
    [],
  );

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    sound.current.on = next;
    try {
      localStorage.setItem('cb-sound', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
  function toggleTurbo() {
    const next = !turbo;
    setTurbo(next);
    turboRef.current = next;
    try {
      localStorage.setItem('cb-turbo', next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
  function toggleSpot(s: CtSpot) {
    setChosen((list) => (list.includes(s) ? (list.length > 1 ? list.filter((x) => x !== s) : list) : CT_SPOTS.filter((x) => x === s || list.includes(x))));
  }

  const spotName = (s: CtSpot) => tt(`spot.${s}`);

  /** Plays the server result: top slot, wheel, bonus game, win. */
  async function present(res: RoundResponse) {
    const d = res.detail as { segment: number; landed: CtSpot; top: { spot: CtSpot; mult: number } | null; bonus: CtBonusDetail | null; value: number; spots: CtSpot[] };
    const fmt = rRef.current.fmt;
    // 1. top slot
    setPhase('top');
    for (let i = 0; i < 12; i += 1) {
      setTopRoll(CT_SPOTS[(i * 3 + d.segment) % CT_SPOTS.length] ?? '1');
      sound.current.tone(900 + (i % 4) * 120, 0.04, 'square', 0.02);
      await wait(ms(70 + i * 8));
    }
    setTopRoll(null);
    setTop(d.top);
    if (d.top) sound.current.win();
    await wait(ms(500));

    // 2. the wheel
    const slice = 360 / CT_WHEEL.length;
    const target = 360 - (d.segment * slice + slice / 2);
    const turns = degRef.current + 360 * 5 + ((((target - degRef.current) % 360) + 360) % 360);
    degRef.current = turns;
    setPhase('spin');
    setDeg(turns);
    sound.current.ticks(ms(SPIN_MS));
    await wait(ms(SPIN_MS) + 150);
    setLanded(d.segment);
    setRecent((list) => [d.landed, ...list].slice(0, 12));
    const hitTop = d.top && d.top.spot === d.landed ? d.top.mult : 1;

    // 3. bonus game (only when the player had a bet on it)
    if (d.bonus) {
      setPhase('bonus');
      await new Promise<void>((ok) => {
        bonusDone.current = ok;
        setBonus({ detail: d.bonus as CtBonusDetail, top: hitTop });
      });
      bonusDone.current = null;
      setBonus(null);
    }

    // 4. result
    setPhase('result');
    const payout = BigInt(res.payout.amountMinor);
    setLastWin(payout);
    if (payout > 0n) {
      sound.current.win();
      setMessage(t('won', { spot: spotName(d.landed), amount: fmt(payout) }));
    } else if (ctIsBonus(d.landed) && !d.spots.includes(d.landed)) {
      sound.current.lose();
      setMessage(t('noBetBonus', { spot: spotName(d.landed) }));
    } else {
      sound.current.lose();
      setMessage(t('landed', { spot: spotName(d.landed) }));
    }
    await wait(ms(400));
  }

  async function spin() {
    const round = rRef.current;
    if (round.busy || phase === 'top' || phase === 'spin' || phase === 'bonus') return;
    setMessage(null);
    setLanded(null);
    setTop(null);
    setLastWin(0n);
    await round.play({ spots: chosen }, present);
    setPhase('idle');
  }

  const stakeMinor = toMinor(r.stake, currency.decimals);
  const ladder = useMemo(() => betLadder(r.min, r.max, currency.decimals), [r.min, r.max, currency.decimals]);
  function changeBet(dir: 1 | -1) {
    const next = dir > 0 ? ladder.find((v) => v > stakeMinor) : [...ladder].reverse().find((v) => v < stakeMinor);
    if (next !== undefined) r.setStake(plain(next, currency.decimals));
  }
  const busy = r.busy || phase === 'top' || phase === 'spin' || phase === 'bonus';
  const share = chosen.length > 0 ? stakeMinor / BigInt(chosen.length) : 0n;
  const labels = useMemo(() => CT_WHEEL.map((s) => WHEEL_WORD[s]), []);
  const colors = useMemo(() => CT_WHEEL.map((s) => COLOR[s]), []);

  return (
    <div className={turbo ? 'ct-wrap is-turbo' : 'ct-wrap'}>
      <section className={`ct-machine phase-${phase}`} aria-label={t('title')}>
        <div className="ct-hero" aria-hidden="true" style={{ backgroundImage: `url(${ART}/studio.jpg)` }} />
        <div className="ct-top">
          <Link href="/casino" className="ct-ib ct-back" aria-label={t('back')} title={t('back')}>
            ‹
          </Link>
          <div className="ct-top-right">
            <button type="button" className="ct-ib" onClick={() => setShowInfo(true)} aria-label={t('info')} title={t('info')}>
              i
            </button>
            <button type="button" className={soundOn ? 'ct-ib' : 'ct-ib is-off'} onClick={toggleSound} aria-pressed={soundOn} aria-label={t('sound')} title={t('sound')}>
              {soundOn ? '♪' : '✕'}
            </button>
          </div>
        </div>
        <div className="ct-title ct-title--studio" aria-hidden="true">
          <strong>
            CRAZY TIME <span>HANNIBAL</span>
          </strong>
        </div>

        <div className={top || topRoll ? 'ct-topslot is-on' : 'ct-topslot'} aria-live="polite">
          <small>{t('topSlot')}</small>
          {topRoll ? (
            <b className="is-roll" style={{ ['--c' as string]: COLOR[topRoll] }}>
              {spotName(topRoll)}
            </b>
          ) : top ? (
            <b style={{ ['--c' as string]: COLOR[top.spot] }}>
              {spotName(top.spot)} <em>×{top.mult}</em>
            </b>
          ) : (
            <b className="is-none">{phase === 'idle' ? t('topSlotHint') : '—'}</b>
          )}
        </div>

        <div className="ct-wheel-box">
          <div className="ct-wheel" style={{ transform: `rotate(${deg}deg)`, transitionDuration: phase === 'spin' ? `${ms(SPIN_MS)}ms` : '0ms' }}>
            {wheelArt === 'svg' ? <WheelFace labels={labels} colors={colors} /> : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className={`ct-wheel-art${wheelArt === 'photo' ? ' is-ready' : ''}`}
              src={`${ART}/wheel.jpg`}
              alt=""
              draggable={false}
              onLoad={() => setWheelArt('photo')}
              onError={() => setWheelArt('svg')}
            />
          </div>
          <span className="ct-pointer" aria-hidden="true" />
          {landed !== null && phase === 'result' ? (
            <span className="ct-landed" style={{ ['--c' as string]: COLOR[CT_WHEEL[landed] ?? '1'] }}>
              {spotName(CT_WHEEL[landed] ?? '1')}
            </span>
          ) : null}
        </div>

        <div className="ct-msg">
          {lastWin > 0n ? (
            <span className="is-win">
              {t('win')} {r.fmt(lastWin)}
            </span>
          ) : (
            <span className="is-idle">{message ?? t('pickHint')}</span>
          )}
        </div>

        <div className="ct-spots" role="group" aria-label={t('spots')}>
          {CT_SPOTS.map((s) => {
            const on = chosen.includes(s);
            return (
              <button key={s} type="button" className={on ? 'ct-spot is-on' : 'ct-spot'} style={{ ['--c' as string]: COLOR[s] }} disabled={busy} onClick={() => toggleSpot(s)} aria-pressed={on}>
                <b>{ctIsBonus(s) ? spotName(s) : s}</b>
                <small>{ctIsBonus(s) ? t('bonus') : `${s}:1`}</small>
              </button>
            );
          })}
        </div>

        {r.error ? (
          <div className="ct-toast" role="alert">
            {r.error}
          </div>
        ) : null}

        <div className="ct-ctl">
          <div>
            <div className="ct-lab">{t('balance')}</div>
            <div className="ct-val" dir="ltr">
              {r.fmt(r.balance)}
            </div>
            <div className="ct-each" dir="ltr">
              {t('each', { count: chosen.length, amount: r.fmt(share) })}
            </div>
          </div>
          <button type="button" className={busy ? 'ct-spin is-busy' : 'ct-spin'} disabled={busy} onClick={() => void spin()} aria-label={t('spin')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#5a1200" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" />
              <path d="M20 4v5h-5" />
            </svg>
          </button>
          <div className="ct-betbox">
            <div className="ct-lab">{t('bet')}</div>
            <div className="ct-bet" dir="ltr">
              <button type="button" className="ct-pm" disabled={busy || !ladder.some((v) => v < stakeMinor)} onClick={() => changeBet(-1)} aria-label={t('betDown')}>
                −
              </button>
              <span className="ct-val">{r.fmt(stakeMinor)}</span>
              <button type="button" className="ct-pm" disabled={busy || !ladder.some((v) => v > stakeMinor)} onClick={() => changeBet(1)} aria-label={t('betUp')}>
                +
              </button>
            </div>
            <button type="button" className={turbo ? 'ct-turbo is-on' : 'ct-turbo'} onClick={toggleTurbo} aria-pressed={turbo}>
              » {t('turbo')}
            </button>
          </div>
        </div>

        {recent.length > 0 ? (
          <div className="ct-recent" aria-label={t('recent')}>
            {recent.map((s, i) => (
              <span key={i} style={{ ['--c' as string]: COLOR[s] }}>
                {WHEEL_WORD[s]}
              </span>
            ))}
          </div>
        ) : null}

        {bonus ? <BonusShow bonus={bonus.detail} top={bonus.top} onDone={() => bonusDone.current?.()} ms={ms} t={tt} sound={sound.current} /> : null}

        {showInfo ? (
          <div className="ct-info" role="dialog" aria-modal="true" aria-label={t('rulesTitle')}>
            <h3>{t('rulesTitle')}</h3>
            <ul>
              <li>{t('rule1')}</li>
              <li>{t('rule2')}</li>
              <li>{t('rule3')}</li>
              <li>{t('ruleCoin')}</li>
              <li>{t('rulePach')}</li>
              <li>{t('ruleHunt')}</li>
              <li>{t('ruleCrazy')}</li>
              <li>{t('ruleBet', { min: r.fmt(r.min), max: r.fmt(r.max) })}</li>
              <li>{t('ruleMax', { max: CT_CAP_X })}</li>
              <li>{t('ruleRtp', { rtp: CT_RTP })}</li>
              <li>{t('ruleServer')}</li>
            </ul>
            <button type="button" className="ct-close" onClick={() => setShowInfo(false)}>
              {t('close')}
            </button>
          </div>
        ) : null}
      </section>
      <div className="ct-under">
        <GameAiButton active={r.busy} />
        <small>{t('rtpLine', { rtp: CT_RTP, max: CT_CAP_X })}</small>
      </div>
    </div>
  );
}
