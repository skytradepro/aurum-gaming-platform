'use client';

import '@/styles/sugar-hannibal.css';
import { SUGAR_CELLS, SUGAR_COLS, SUGAR_CONFIG, SUGAR_ROWS, sugarMarkSpots, type SugarStep } from '@aurum/shared';
import { Link } from '@/i18n/routing';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GameAiButton } from './GameInfo';
import { plain, useRound, type RoundResponse } from './useRound';

const CFG = SUGAR_CONFIG;
const STAR = CFG.scatter;
/** Pictures of the machine (public/media/games/sugarhannibal). */
const ART = '/media/games/sugarhannibal';

// ---------------------------------------------------------------------------------------------
// Sound: small synthesized effects (Web Audio), no audio files. Same on/off switch as the other
// games and the free spins show (localStorage "cb-sound").
// ---------------------------------------------------------------------------------------------
class SugarSound {
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
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.07, when = 0, slide = 0) {
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
  spin() {
    this.tone(320, 0.3, 'triangle', 0.05, 0, -200);
  }
  land(col: number) {
    this.tone(660 + col * 70, 0.06, 'sine', 0.045);
  }
  win(step: number) {
    const base = 587 * 2 ** (Math.min(step, 8) / 12);
    [0, 4, 7, 12].forEach((s, i) => this.tone(base * 2 ** (s / 12), 0.15, 'triangle', 0.06, i * 0.06));
  }
  pop() {
    this.tone(1100, 0.08, 'square', 0.03, 0, -600);
    this.tone(1700, 0.06, 'sine', 0.03, 0.03, -800);
  }
  stars() {
    [0, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(784 * 2 ** (s / 12), 0.3, 'sine', 0.07, i * 0.09));
  }
  tick() {
    this.tone(1900, 0.03, 'sine', 0.02);
  }
  big() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(440 * 2 ** (s / 12), 0.26, 'triangle', 0.07, i * 0.1));
  }
  lose() {
    this.tone(280, 0.14, 'sine', 0.035, 0, -80);
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
interface Cell {
  sym: number;
  /** Rows the candy falls (0 = it stays). */
  fall: number;
  key: string;
}
type Phase = 'idle' | 'out' | 'drop' | 'win' | 'burst' | 'tumble' | 'stars';

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** The board shown before the first spin: natural looking, without any winning cluster. */
const START: readonly number[] = [7, 4, 5, 3, 5, 4, 0, 0, 3, 3, 1, 5, 5, 2, 3, 4, 5, 0, 4, 6, 0, 2, 3, 4, 1, 2, 2, 4, 2, 0, 2, 5, 3, 6, 5, 1, 4, 0, 4, 6, 2, 6, 6, 3, 6, 3, 1, 6, 1];

/** Where every cell of `next` came from after the `burst` cells of `prev` exploded (rows it falls). */
function tumbleFalls(prev: readonly Cell[], burst: ReadonlySet<number>, next: readonly number[], gen: number): Cell[] {
  const out: Cell[] = new Array(SUGAR_CELLS);
  for (let col = 0; col < SUGAR_COLS; col += 1) {
    const keptRows: number[] = [];
    for (let row = SUGAR_ROWS - 1; row >= 0; row -= 1) if (!burst.has(row * SUGAR_COLS + col)) keptRows.push(row);
    const fresh = SUGAR_ROWS - keptRows.length;
    for (let row = SUGAR_ROWS - 1, k = 0; row >= 0; row -= 1, k += 1) {
      const i = row * SUGAR_COLS + col;
      const from = keptRows[k];
      const fall = from === undefined ? fresh : row - from;
      out[i] = { sym: next[i] ?? 0, fall, key: fall === 0 ? (prev[i]?.key ?? `s${i}-${gen}`) : `t${i}-${gen}` };
    }
  }
  return out;
}

/** Bet steps (1, 2, 5 × 10ⁿ) between the game's limits, plus the limits themselves. */
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

function useCountUp() {
  const [value, setValue] = useState(0n);
  const raf = useRef(0);
  const guard = useRef<number | undefined>(undefined);
  function stop() {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(guard.current);
  }
  function run(from: bigint, to: bigint, ms: number, onTick?: () => void): Promise<void> {
    stop();
    return new Promise((done) => {
      const start = performance.now();
      let lastTick = 0;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        stop();
        setValue(to);
        done();
      };
      // Browsers pause animation frames in hidden tabs: never let the round wait for them.
      guard.current = window.setTimeout(finish, ms + 250);
      const step = (now: number) => {
        if (finished) return;
        const p = Math.min(1, (now - start) / Math.max(1, ms));
        const eased = 1 - (1 - p) ** 3;
        setValue(from + ((to - from) * BigInt(Math.round(eased * 1000))) / 1000n);
        if (onTick && now - lastTick > 70) {
          lastTick = now;
          onTick();
        }
        if (p < 1) raf.current = requestAnimationFrame(step);
        else finish();
      };
      raf.current = requestAnimationFrame(step);
    });
  }
  return { value, setValue, run, stop };
}

/** One candy: pure CSS (no picture to download). */
function Candy({ id }: { id: number }) {
  if (id === STAR) {
    return (
      <span className="sh-sym sh-star" aria-hidden="true">
        ★
      </span>
    );
  }
  return <span className={`sh-sym sh-s${id}`} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------------------------
export function SugarHannibalGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('sugarHannibal');
  const r = useRound({ endpoint: '/games/sugarhannibal/play', currency, locale, initialBalanceMinor });
  const rRef = useRef(r);
  rRef.current = r;

  const sound = useRef(new SugarSound());
  const [soundOn, setSoundOn] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const turboRef = useRef(false);
  const [cells, setCells] = useState<Cell[]>(() => START.map((sym, i) => ({ sym, fall: 0, key: `s${i}-0` })));
  const [phase, setPhase] = useState<Phase>('idle');
  const [lit, setLit] = useState<ReadonlySet<number>>(new Set());
  const [spots, setSpots] = useState<number[]>(() => new Array<number>(SUGAR_CELLS).fill(0));
  const [stepText, setStepText] = useState<string | null>(null);
  const [big, setBig] = useState<{ level: 'big' | 'mega' | 'epic'; amount: bigint } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const autoStop = useRef(false);
  const skipBig = useRef<(() => void) | null>(null);
  const gen = useRef(0);
  const total = useCountUp();
  const bigCount = useCountUp();
  const setTotal = total.setValue;
  const result = r.result;

  // after the free spins show, the win shows the whole round (paid spin + free spins)
  useEffect(() => {
    if (result?.detail.freeSpins) setTotal(BigInt(result.payout.amountMinor));
  }, [result, setTotal]);

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

  /** Animation time, shorter in turbo mode or when the phone asks for less motion. */
  const ms = (n: number) => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    return Math.round(n * (turboRef.current || reduce ? 0.45 : 1));
  };

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

  const candyName = (i: number) => t(`sym.${i}` as never);

  /** Plays the server result: new board, then every cluster, burst and tumble, then the stars and the total. */
  async function present(res: RoundResponse, started: number) {
    const steps = (res.detail.steps as SugarStep[] | undefined) ?? [];
    const final = (res.detail.final as number[] | undefined) ?? [...START];
    const stars = typeof res.detail.scatters === 'number' ? res.detail.scatters : 0;
    const freeSpins = (res.detail.freeSpins as { count?: number } | undefined)?.count ?? 0;
    const stake = BigInt(res.stake.amountMinor);
    const fmt = rRef.current.fmt;
    await wait(Math.max(0, ms(480) - (performance.now() - started)));

    // 1. the new board drops in, column by column
    gen.current += 1;
    const first = steps[0]?.grid ?? final;
    let board: Cell[] = first.map((sym, i) => ({ sym, fall: SUGAR_ROWS, key: `d${i}-${gen.current}` }));
    setCells(board);
    setPhase('drop');
    for (let c = 0; c < SUGAR_COLS; c += 1) window.setTimeout(() => sound.current.land(c), ms(160 + c * 70));
    await wait(ms(70 * SUGAR_COLS + 480));

    // 2. clusters: light up, burst, mark the cells, tumble
    const live = new Array<number>(SUGAR_CELLS).fill(0);
    let running = 0n;
    for (let s = 0; s < steps.length; s += 1) {
      const step = steps[s] as SugarStep;
      const burst = new Set(step.burst);
      setLit(burst);
      setPhase('win');
      sound.current.win(s);
      const stepMinor = (stake * BigInt(step.tenths)) / 10n;
      setStepText(`${step.wins.map((w) => `${w.cells.length} × ${candyName(w.symbol)}${w.mult > 1 ? ` ×${w.mult}` : ''}`).join(' · ')} = ${fmt(stepMinor)}`);
      await total.run(running, running + stepMinor, ms(600));
      running += stepMinor;
      await wait(ms(200));
      setPhase('burst');
      sound.current.pop();
      await wait(ms(320));
      sugarMarkSpots(live, step.burst);
      setSpots(live.slice());
      const next = steps[s + 1]?.grid ?? final;
      gen.current += 1;
      board = tumbleFalls(board, burst, next, gen.current);
      setCells(board);
      setLit(new Set());
      setStepText(null);
      setPhase('tumble');
      for (let c = 0; c < SUGAR_COLS; c += 1) window.setTimeout(() => sound.current.land(c), ms(150 + c * 35));
      await wait(ms(500));
    }

    // 3. the total (the server's payout is the truth: it includes the cap)
    const payout = BigInt(res.payout.amountMinor);
    if (payout !== running) total.setValue(payout);
    setPhase('idle');

    // 4. gold stars: the free spins show (shared by every slot game) starts right after
    if (freeSpins > 0) {
      setPhase('stars');
      sound.current.stars();
      setStepText(t('starsWon', { stars, count: freeSpins }));
      await wait(ms(1800));
      setStepText(null);
      setPhase('idle');
    }

    if (payout === 0n) {
      if (freeSpins === 0) sound.current.lose();
      return;
    }
    const x = stake > 0n ? Number((payout * 100n) / stake) / 100 : 0;
    if (x >= 10) {
      const level = x >= 100 ? 'epic' : x >= 30 ? 'mega' : 'big';
      setBig({ level, amount: payout });
      sound.current.big();
      let skipped = false;
      const done = bigCount.run(0n, payout, ms(level === 'epic' ? 4000 : level === 'mega' ? 3200 : 2400), () => sound.current.tick());
      await Promise.race([
        done,
        new Promise<void>((ok) => {
          skipBig.current = () => {
            skipped = true;
            ok();
          };
        }),
      ]);
      if (skipped) {
        bigCount.stop();
        bigCount.setValue(payout);
      }
      await wait(ms(skipped ? 450 : 1100));
      skipBig.current = null;
      setBig(null);
    }
  }

  /** One spin. Resolves true when the round was settled by the server. */
  async function spinOnce(): Promise<boolean> {
    const round = rRef.current;
    if (round.busy) return false;
    sound.current.spin();
    setStepText(null);
    setLit(new Set());
    total.setValue(0n);
    setSpots(new Array<number>(SUGAR_CELLS).fill(0));
    setPhase('out');
    const started = performance.now();
    let settled = false;
    await round.play({}, async (res) => {
      settled = true;
      await present(res, started);
    });
    if (!settled) {
      // error (shown on the machine): put the board back
      gen.current += 1;
      setCells((cs) => cs.map((c, i) => ({ ...c, fall: 0, key: `s${i}-${gen.current}` })));
    }
    setPhase('idle');
    return settled;
  }

  async function startAuto(n: number) {
    autoStop.current = false;
    for (let i = n; i > 0; i -= 1) {
      setAutoLeft(i);
      const ok = await spinOnce();
      if (!ok || autoStop.current) break;
      await wait(ms(300));
    }
    setAutoLeft(0);
  }

  const stakeMinor = toMinor(r.stake, currency.decimals);
  const ladder = useMemo(() => betLadder(r.min, r.max, currency.decimals), [r.min, r.max, currency.decimals]);
  function changeBet(dir: 1 | -1) {
    const next = dir > 0 ? ladder.find((v) => v > stakeMinor) : [...ladder].reverse().find((v) => v < stakeMinor);
    if (next !== undefined) r.setStake(plain(next, currency.decimals));
  }

  const busy = r.busy || phase !== 'idle' || autoLeft > 0;
  const canAuto = !busy && stakeMinor > 0n && stakeMinor <= BigInt(r.balance);
  const lastPayout = r.result ? BigInt(r.result.payout.amountMinor) : null;
  const showing = phase === 'win' || phase === 'burst';

  return (
    <div className={turbo ? 'sh-wrap is-turbo' : 'sh-wrap'}>
      <section className={`sh-machine phase-${phase}`} aria-label={t('title')} style={{ backgroundImage: `url(${ART}/bg.jpg)` }}>
        <div className="sh-hero" aria-hidden="true" style={{ backgroundImage: `url(${ART}/top.jpg)` }} />
        <div className="sh-top">
          <Link href="/casino" className="sh-ib sh-back" aria-label={t('back')} title={t('back')}>
            ‹
          </Link>
          <div className="sh-top-right">
            <button type="button" className="sh-ib" onClick={() => setShowInfo(true)} aria-label={t('info')} title={t('info')}>
              i
            </button>
            <button type="button" className={soundOn ? 'sh-ib' : 'sh-ib is-off'} onClick={toggleSound} aria-pressed={soundOn} aria-label={t('sound')} title={t('sound')}>
              {soundOn ? '♪' : '✕'}
            </button>
          </div>
        </div>
        <div className="sh-title" aria-hidden="true">
          <strong>
            SUGAR <span>HANNIBAL</span>
          </strong>
          <em>1000</em>
          <span className="sh-fs">
            ★★★★<b>{t('fsBadge', { count: CFG.freeSpins[0]?.count ?? 10 })}</b>
          </span>
        </div>

        <div className="sh-board">
          <div className="sh-grid" role="grid" aria-label={t('board')}>
            {cells.map((c, i) => {
              const row = Math.floor(i / SUGAR_COLS);
              const col = i % SUGAR_COLS;
              const isLit = lit.has(i);
              const spot = spots[i] ?? 0;
              const cls = [
                'sh-cell',
                spot === 1 ? 'is-marked' : '',
                spot >= 2 ? 'is-spot' : '',
                isLit && phase === 'win' ? 'is-win' : '',
                isLit && phase === 'burst' ? 'is-burst' : '',
                showing && !isLit ? 'is-dim' : '',
                phase === 'stars' && c.sym === STAR ? 'is-star' : '',
                c.fall > 0 && (phase === 'drop' || phase === 'tumble') ? 'is-fall' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const delay = phase === 'drop' ? col * 0.07 + (SUGAR_ROWS - 1 - row) * 0.025 : phase === 'tumble' ? col * 0.035 : phase === 'out' ? col * 0.025 + (SUGAR_ROWS - 1 - row) * 0.015 : 0;
              return (
                <div
                  key={c.key}
                  className={cls}
                  role="gridcell"
                  aria-label={candyName(c.sym)}
                  style={{ ['--fall' as string]: c.fall, ['--row' as string]: row, ['--d' as string]: `${ms(delay * 1000)}ms` }}
                >
                  <Candy id={c.sym} />
                  {spot >= 2 ? <span className="sh-x">×{spot}</span> : null}
                </div>
              );
            })}
          </div>
          {stepText ? (
            <div className={phase === 'stars' ? 'sh-step is-stars' : 'sh-step'} aria-live="polite">
              {stepText}
            </div>
          ) : null}
        </div>

        <div className="sh-win">
          {total.value > 0n ? (
            <span key="w" className="is-up">
              {t('win')} {r.fmt(total.value)}
            </span>
          ) : (
            <span key="z" className="is-idle">
              {phase === 'idle' && lastPayout !== null ? (lastPayout > 0n ? t('lastWin', { amount: r.fmt(lastPayout) }) : t('noWin')) : t('rule')}
            </span>
          )}
        </div>

        {r.error ? (
          <div className="sh-toast" role="alert">
            {r.error}
          </div>
        ) : null}

        <div className="sh-ctl">
          <button
            type="button"
            className={autoLeft > 0 ? 'sh-side is-on' : 'sh-side'}
            disabled={autoLeft === 0 && !canAuto}
            onClick={() => (autoLeft > 0 ? (autoStop.current = true) : void startAuto(25))}
            aria-label={autoLeft > 0 ? t('autoStop') : t('auto')}
          >
            <i aria-hidden="true">{autoLeft > 0 ? autoLeft : '⟳'}</i>
            {autoLeft > 0 ? t('autoStop') : t('auto')}
          </button>
          <button type="button" className={busy ? 'sh-spin is-busy' : 'sh-spin'} disabled={busy} onClick={() => void spinOnce()} aria-label={t('spin')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#7a2a00" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 12a8 8 0 1 1-2.34-5.66" />
              <path d="M20 4v5h-5" />
            </svg>
          </button>
          <button type="button" className={turbo ? 'sh-side is-on' : 'sh-side'} onClick={toggleTurbo} aria-pressed={turbo}>
            <i aria-hidden="true">»</i>
            {t('turbo')}
          </button>
        </div>
        <div className="sh-row">
          <div>
            <div className="sh-lab">{t('balance')}</div>
            <div className="sh-val" dir="ltr">
              {r.fmt(r.balance)}
            </div>
          </div>
          <div className="sh-betbox">
            <div className="sh-lab">{t('bet')}</div>
            <div className="sh-bet" dir="ltr">
              <button type="button" className="sh-pm" disabled={busy || !ladder.some((v) => v < stakeMinor)} onClick={() => changeBet(-1)} aria-label={t('betDown')}>
                −
              </button>
              <span className="sh-val">{r.fmt(stakeMinor)}</span>
              <button type="button" className="sh-pm" disabled={busy || !ladder.some((v) => v > stakeMinor)} onClick={() => changeBet(1)} aria-label={t('betUp')}>
                +
              </button>
            </div>
          </div>
        </div>

        {big ? (
          <button type="button" className={`sh-big is-${big.level}`} onClick={() => skipBig.current?.()} aria-label={t('tapToSkip')}>
            <span className="sh-big-title">{t(big.level)}</span>
            <span className="sh-big-amount">{r.fmt(bigCount.value)}</span>
            <span className="sh-big-skip">{t('tapToSkip')}</span>
          </button>
        ) : null}

        {showInfo ? (
          <div className="sh-info" role="dialog" aria-modal="true" aria-label={t('paytable')}>
            <h3>{t('paytable')}</h3>
            <p className="sh-info-note">{t('payNote')}</p>
            <div className="sh-pay-scroll">
              <table className="sh-pay">
                <thead>
                  <tr>
                    <th>{t('size')}</th>
                    {CFG.bands.map((b, k) => (
                      <th key={b}>{k === CFG.bands.length - 1 ? `${b}+` : b}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {CFG.pays
                    .map((row, s) => (
                      <tr key={s}>
                        <th>
                          <Candy id={s} />
                        </th>
                        {row.map((p, k) => (
                          <td key={k}>{p / 10}</td>
                        ))}
                      </tr>
                    ))
                    .reverse()}
                </tbody>
              </table>
            </div>
            <div className="sh-fs-table">
              <Candy id={STAR} />
              <div>
                {CFG.freeSpins.map((f, k) => (
                  <span key={f.min}>{t(k === CFG.freeSpins.length - 1 ? 'fsRowPlus' : 'fsRow', { stars: f.min, count: f.count })}</span>
                ))}
              </div>
            </div>
            <ul className="sh-rules">
              <li>{t('ruleGrid')}</li>
              <li>{t('ruleTumble')}</li>
              <li>{t('ruleSpots', { max: CFG.spotMax })}</li>
              <li>{t('ruleFree')}</li>
              <li>{t('ruleMax', { max: CFG.capX })}</li>
              <li>{t('ruleBet', { min: r.fmt(r.min), max: r.fmt(r.max) })}</li>
              <li>{t('ruleRtp', { rtp: CFG.rtp })}</li>
              <li>{t('ruleServer')}</li>
            </ul>
            <button type="button" className="sh-close" onClick={() => setShowInfo(false)}>
              {t('close')}
            </button>
          </div>
        ) : null}
      </section>
      <div className="sh-under">
        <GameAiButton active={r.busy} />
        <small>{t('rtpLine', { rtp: CFG.rtp, max: CFG.capX })}</small>
      </div>
    </div>
  );
}
