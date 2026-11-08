'use client';

import '@/styles/candy-burst.css';
import { TUMBLE_CELLS as CANDY_CELLS, TUMBLE_COLS as CANDY_COLS, TUMBLE_ROWS as CANDY_ROWS, type CandyStep, type TumbleConfig } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StakeBox } from './StakeBox';
import { useRound, type RoundResponse } from './useRound';

// ---------------------------------------------------------------------------------------------
// Sound: small synthesized effects (Web Audio), no audio files. Off until the player turns it on
// or presses Spin (browsers only allow sound after a click).
// ---------------------------------------------------------------------------------------------
export class CandySound {
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
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, when = 0, slide = 0) {
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
    this.tone(180, 0.35, 'triangle', 0.06, 0, 420);
  }
  land(col: number) {
    this.tone(520 + col * 60, 0.07, 'sine', 0.05, col * 0.06);
  }
  win(step: number) {
    const base = 523 * 2 ** (Math.min(step, 8) / 12);
    [0, 4, 7, 12].forEach((s, i) => this.tone(base * 2 ** (s / 12), 0.16, 'triangle', 0.07, i * 0.07));
  }
  pop() {
    this.tone(900, 0.09, 'square', 0.035, 0, -500);
    this.tone(1400, 0.06, 'sine', 0.03, 0.03, -700);
  }
  tick() {
    this.tone(1800, 0.03, 'sine', 0.025);
  }
  big() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(392 * 2 ** (s / 12), 0.28, 'triangle', 0.08, i * 0.11));
  }
  lose() {
    this.tone(260, 0.16, 'sine', 0.04, 0, -80);
  }
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
interface Cell {
  sym: number;
  fall: number;
  key: string;
}
type Phase = 'idle' | 'out' | 'spin' | 'drop' | 'win' | 'burst' | 'tumble';

/** Random symbols for the spinning reel strips (looks only: the result always comes from the server). */
function reelStrips(symbols: number): number[][] {
  return Array.from({ length: CANDY_COLS }, () => Array.from({ length: 10 }, () => Math.floor(Math.random() * symbols)));
}

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
/** A fixed, natural-looking first board (never 8 of a kind, no repeated columns) shown before the first spin. */
const startBoard = (symbols: number): number[] => Array.from({ length: CANDY_CELLS }, (_, i) => (i * 11 + Math.floor(i / 6) * 5 + ((i * i * 3) % 7)) % symbols);

/** Where every cell of `next` came from after `burst` cells of `prev` exploded (rows it falls). */
function tumbleFalls(prev: number[], burst: Set<number>, next: number[], gen: number): Cell[] {
  const out: Cell[] = new Array(CANDY_CELLS);
  for (let col = 0; col < CANDY_COLS; col += 1) {
    const keptRows: number[] = [];
    for (let row = CANDY_ROWS - 1; row >= 0; row -= 1) if (!burst.has(row * CANDY_COLS + col)) keptRows.push(row);
    const fresh = CANDY_ROWS - keptRows.length;
    for (let row = CANDY_ROWS - 1, k = 0; row >= 0; row -= 1, k += 1) {
      const i = row * CANDY_COLS + col;
      const from = keptRows[k];
      const fall = from === undefined ? fresh : row - from;
      out[i] = { sym: next[i] ?? 0, fall, key: fall === 0 ? `s${i}-${gen - 1}` : `t${i}-${gen}` };
    }
  }
  return out;
}

export function useCountUp() {
  const [value, setValue] = useState(0n);
  const raf = useRef(0);
  const guard = useRef<number | undefined>(undefined);
  function run(from: bigint, to: bigint, ms: number, onTick?: () => void): Promise<void> {
    cancelAnimationFrame(raf.current);
    window.clearTimeout(guard.current);
    return new Promise((done) => {
      const start = performance.now();
      let lastTick = 0;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(raf.current);
        window.clearTimeout(guard.current);
        setValue(to);
        done();
      };
      // Browsers pause animation frames in hidden tabs: never let the round wait for them.
      guard.current = window.setTimeout(finish, ms + 250);
      const step = (now: number) => {
        const p = Math.min(1, (now - start) / Math.max(1, ms));
        const eased = 1 - (1 - p) ** 3;
        setValue(from + ((to - from) * BigInt(Math.round(eased * 1000))) / 1000n);
        if (onTick && now - lastTick > 70) {
          lastTick = now;
          onTick();
        }
        if (finished) return;
        if (p < 1) raf.current = requestAnimationFrame(step);
        else finish();
      };
      raf.current = requestAnimationFrame(step);
    });
  }
  return {
    value,
    setValue,
    run,
    stop: () => {
      cancelAnimationFrame(raf.current);
      window.clearTimeout(guard.current);
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------------------------
/** What makes one tumble game different from another: maths, pictures, texts and colours. */
export interface TumbleTheme {
  /** Game id: the API endpoint is /games/<id>/play. */
  id: 'candyburst' | 'desert' | 'chilli' | 'lionsroar' | 'tidal' | 'olympusstorm' | 'diamondblitz' | 'vesuvius' | 'deepcatch' | 'luckyclover' | 'foresthowl';
  /** next-intl namespace with the game's texts (same keys for every theme). */
  ns: 'candyBurst' | 'desertRiches' | 'hannibalChilli' | 'lionsRoar' | 'tidalTreasure' | 'olympusStorm' | 'diamondBlitz' | 'vesuviusFury' | 'deepCatch' | 'luckyClover' | 'forestHowl';
  title: string;
  config: TumbleConfig;
  className: string;
  renderSymbol: (id: number, title?: string) => ReactNode;
  defs?: ReactNode;
  header?: ReactNode;
  /** Temple/scatter bonus: server plays this many free tumble spins at the same stake (shown on the board). */
  scatterFreeSpins?: { min: number; count: number };
}

export function TumbleGame({ theme, currency, locale, initialBalanceMinor }: { theme: TumbleTheme; currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations(theme.ns);
  const cfg = theme.config;
  const symbolCount = cfg.weights.length;
  const START = useMemo(() => startBoard(symbolCount), [symbolCount]);
  const r = useRound({ endpoint: `/games/${theme.id}/play`, currency, locale, initialBalanceMinor });
  const rRef = useRef(r);
  rRef.current = r;

  const sound = useRef(new CandySound());
  const [soundOn, setSoundOn] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const turboRef = useRef(false);
  const [cells, setCells] = useState<Cell[]>(() => START.map((sym, i) => ({ sym, fall: 0, key: `s${i}-0` })));
  const [phase, setPhase] = useState<Phase>('idle');
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [scatterLit, setScatterLit] = useState<Set<number>>(new Set());
  const [multiplier, setMultiplier] = useState(0);
  const [stepText, setStepText] = useState<string | null>(null);
  const [big, setBig] = useState<{ level: 'big' | 'mega' | 'epic'; amount: bigint } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [autoLeft, setAutoLeft] = useState(0);
  const autoStop = useRef(false);
  const skipBig = useRef<(() => void) | null>(null);
  const gen = useRef(0);
  const [reels, setReels] = useState<number[][] | null>(null);
  /** Seconds between two reels stopping (also the drop delay between columns). */
  const stopGap = useRef(0.07);
  const total = useCountUp();
  const bigCount = useCountUp();

  useEffect(() => {
    try {
      const s = localStorage.getItem('cb-sound');
      if (s === '0') {
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

  const stakeOf = (res: RoundResponse) => BigInt(res.stake.amountMinor);
  const glyphName = (i: number) => t(`sym.${i}` as never);

  async function runTumbles(steps: CandyStep[], final: number[], stake: bigint, running: bigint): Promise<bigint> {
    for (let s = 0; s < steps.length; s += 1) {
      const step = steps[s] as CandyStep;
      const burst = new Set(step.burst);
      setMultiplier(step.multiplier);
      setLit(burst);
      const sc = cfg.scatter;
      setScatterLit(sc && step.wins.some((w) => w.symbol === sc.symbol) ? new Set(step.grid.flatMap((v, i) => (v === sc.symbol ? [i] : []))) : new Set());
      setPhase('win');
      sound.current.win(s);
      const stepMinor = (stake * BigInt(step.tenths)) / 10n;
      setStepText(
        step.wins
          .map((w) => `${glyphName(w.symbol)} ×${w.count}`)
          .join(' · ') + (step.multiplier > 1 ? `  ×${step.multiplier}` : '') + `  = ${r.fmt(stepMinor)}`,
      );
      await total.run(running, running + stepMinor, ms(650));
      running += stepMinor;
      await wait(ms(250));
      setPhase('burst');
      sound.current.pop();
      await wait(ms(380));
      const next = steps[s + 1]?.grid ?? final;
      gen.current += 1;
      const moved = tumbleFalls(step.grid, burst, next, gen.current);
      setCells((prev) => moved.map((c, i) => (c.fall === 0 ? { ...c, key: prev[i]?.key ?? c.key } : c)));
      setLit(new Set());
      setScatterLit(new Set());
      setPhase('tumble');
      for (let c = 0; c < CANDY_COLS; c += 1) setTimeout(() => sound.current.land(c), ms(150 + c * 40));
      await wait(ms(560));
    }
    return running;
  }

  /** Plays the server result: drop, then every tumble step, then the total. */
  async function present(res: RoundResponse, outStarted: number) {
    const steps = (res.detail.steps as CandyStep[] | undefined) ?? [];
    const final = (res.detail.final as number[] | undefined) ?? START;
    const stake = stakeOf(res);
    // the reels spin for a moment (several turns), then stop one by one from left to right
    await wait(Math.max(0, ms(1300) - (performance.now() - outStarted)));
    stopGap.current = ms(170) / 1000;

    // 1. drop the first board
    gen.current += 1;
    const first = steps[0]?.grid ?? final;
    setCells(first.map((sym, i) => ({ sym, fall: CANDY_ROWS + 1, key: `d${i}-${gen.current}` })));
    setPhase('drop');
    for (let c = 0; c < CANDY_COLS; c += 1) setTimeout(() => sound.current.land(c), ms(140) + Math.round(c * stopGap.current * 1000));
    await wait(Math.round(stopGap.current * 1000 * CANDY_COLS) + ms(560));
    setReels(null);

    // 2. tumbles (paid spin)
    let running = await runTumbles(steps, final, stake, 0n);

    const fs = res.detail.freeSpins as { spins?: { detail?: { steps?: CandyStep[]; final?: number[] } }[]; count?: number } | undefined;
    if (fs?.spins?.length) {
      sound.current.big();
      setStepText(t('fsIntro', { count: fs.count ?? fs.spins.length }));
      await wait(ms(1800));
      for (let i = 0; i < fs.spins.length; i += 1) {
        const spin = fs.spins[i];
        const spinSteps = spin?.detail?.steps ?? [];
        const spinFinal = spin?.detail?.final ?? START;
        setStepText(t('fsSpin', { n: i + 1, total: fs.spins.length }));
        gen.current += 1;
        const drop = spinSteps[0]?.grid ?? spinFinal;
        setCells(drop.map((sym, ci) => ({ sym, fall: CANDY_ROWS + 1, key: `fs${i}-${ci}-${gen.current}` })));
        setPhase('drop');
        await wait(ms(700));
        running = await runTumbles(spinSteps, spinFinal, stake, running);
      }
    }

    // 3. total (the server's payout is the truth: it includes the cap)
    const payout = BigInt(res.payout.amountMinor);
    if (payout !== running) total.setValue(payout);
    setStepText(null);
    setPhase('idle');
    if (payout === 0n) {
      sound.current.lose();
      return;
    }
    const x = stake > 0n ? Number((payout * 100n) / stake) / 100 : 0;
    if (x >= 10) {
      const level = x >= 50 ? 'epic' : x >= 25 ? 'mega' : 'big';
      setBig({ level, amount: payout });
      sound.current.big();
      let skipped = false;
      const done = bigCount.run(0n, payout, ms(level === 'epic' ? 4200 : level === 'mega' ? 3400 : 2600), () => sound.current.tick());
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
      await wait(ms(skipped ? 500 : 1200));
      skipBig.current = null;
      setBig(null);
    }
  }

  /** One spin. Resolves true when the round was settled by the server. */
  async function spinOnce(): Promise<boolean> {
    const round = rRef.current;
    if (round.busy) return false;
    sound.current.spin();
    setMultiplier(0);
    setStepText(null);
    setLit(new Set());
    total.setValue(0n);
    setReels(reelStrips(symbolCount));
    setPhase('spin');
    const outStarted = performance.now();
    let settled = false;
    await round.play({}, async (res) => {
      settled = true;
      await present(res, outStarted);
    });
    if (!settled) {
      // error (shown by the stake box): put the board back
      setReels(null);
      setPhase('idle');
      gen.current += 1;
      setCells((cs) => cs.map((c, i) => ({ ...c, fall: 0, key: `s${i}-${gen.current}` })));
    }
    return settled;
  }

  async function startAuto(n: number) {
    autoStop.current = false;
    for (let i = n; i > 0; i -= 1) {
      setAutoLeft(i);
      const ok = await spinOnce();
      if (!ok || autoStop.current) break;
      await wait(ms(350));
    }
    setAutoLeft(0);
  }

  const busy = r.busy || phase !== 'idle' || autoLeft > 0;
  const stakeMinorNow = (() => {
    try {
      const [w = '0', f = ''] = r.stake.trim().split('.');
      return BigInt(w || '0') * 10n ** BigInt(currency.decimals) + BigInt((f.padEnd(currency.decimals, '0').slice(0, currency.decimals) || '0'));
    } catch {
      return 0n;
    }
  })();

  return (
    <div className={`cb-wrap ${theme.className}`}>
      {theme.defs ?? null}
      <section className={`cb-stage phase-${phase}`} aria-label={theme.title}>
        {theme.header ?? null}
        <div className="cb-top">
          {cfg.growingMultiplier ? (
            <div className={multiplier > 1 ? 'cb-mult is-hot' : 'cb-mult'} key={`m${multiplier}`}>
              <small>{t('multiplier')}</small>
              <strong>×{Math.max(1, multiplier)}</strong>
            </div>
          ) : (
            <div className={multiplier > 0 ? 'cb-mult is-hot' : 'cb-mult'} key={`m${multiplier}`}>
              <small>{t('tumbles')}</small>
              <strong>
                {multiplier}/{cfg.maxTumbles}
              </strong>
            </div>
          )}
          <div className="cb-tools">
            <button type="button" className={soundOn ? 'cb-tool is-on' : 'cb-tool'} onClick={toggleSound} aria-pressed={soundOn} aria-label={t('sound')} title={t('sound')}>
              {soundOn ? '🔊' : '🔇'}
            </button>
            <button type="button" className={turbo ? 'cb-tool is-on' : 'cb-tool'} onClick={toggleTurbo} aria-pressed={turbo} aria-label={t('turbo')} title={t('turbo')}>
              ⚡
            </button>
            <button type="button" className="cb-tool" onClick={() => setShowInfo(true)} aria-label={t('info')} title={t('info')}>
              i
            </button>
          </div>
        </div>

        <div className="cb-board">
          <div className="cb-grid" role="grid" aria-label={t('board')}>
            {cells.map((c, i) => {
              const row = Math.floor(i / CANDY_COLS);
              const col = i % CANDY_COLS;
              const isLit = lit.has(i);
              const isScatter = scatterLit.has(i) && (phase === 'win' || phase === 'burst');
              const cls = ['cb-cell', isLit && phase === 'win' ? 'is-win' : '', isLit && phase === 'burst' ? 'is-burst' : '', isScatter ? 'is-scatter' : '', !isLit && !isScatter && (phase === 'win' || phase === 'burst') ? 'is-dim' : ''].join(' ');
              const delay = phase === 'drop' ? col * stopGap.current + (CANDY_ROWS - 1 - row) * 0.03 : phase === 'tumble' ? col * 0.04 : 0;
              return (
                <div key={c.key} className={cls} role="gridcell" style={{ ['--fall' as string]: c.fall, ['--d' as string]: `${delay}s` }}>
                  {theme.renderSymbol(c.sym, glyphName(c.sym))}
                  {isLit && phase === 'burst' ? (
                    <span className="cb-pop" aria-hidden="true">
                      {Array.from({ length: 8 }, (_, k) => (
                        <i key={k} style={{ ['--a' as string]: `${k * 45}deg` }} />
                      ))}
                    </span>
                  ) : null}
                </div>
              );
            })}
            {reels ? (
              <div className={phase === 'spin' ? 'cb-reels' : 'cb-reels is-stopping'} aria-hidden="true">
                {reels.map((strip, c) => (
                  <div key={c} className="cb-reel" style={{ ['--sd' as string]: `${c * stopGap.current}s` }}>
                    <div className="cb-reel-strip" style={{ ['--rd' as string]: `${-c * 0.07}s` }}>
                      {[...strip, ...strip].map((sym, k) => (
                        <div key={k} className="cb-reel-item">
                          {theme.renderSymbol(sym)}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="cb-bar">
          <div className="cb-win">
            <small>{t('win')}</small>
            <strong key={total.value > 0n ? 'w' : 'z'} className={total.value > 0n ? 'is-up' : ''}>
              {r.fmt(total.value)}
            </strong>
          </div>
          <button type="button" className="cb-spin-mini" disabled={busy} onClick={() => void spinOnce()} aria-label={t('spin')}>
            <span aria-hidden="true">⟳</span>
          </button>
          <div className="cb-step" aria-live="polite">
            {stepText ?? (phase === 'idle' && r.result ? (BigInt(r.result.payout.amountMinor) > 0n ? t('lastWin', { amount: r.fmt(r.result.payout.amountMinor) }) : t('noWin')) : t('rule'))}
          </div>
        </div>

        {big ? (
          <button type="button" className={`cb-big is-${big.level}`} onClick={() => skipBig.current?.()} aria-label={t('tapToSkip')}>
            <span className="cb-confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, k) => (
                <i key={k} style={{ ['--x' as string]: `${(k * 37) % 100}%`, ['--dl' as string]: `${(k % 6) * 0.18}s`, ['--s' as string]: `${k % symbolCount}` }}>
                  {theme.renderSymbol(k % symbolCount)}
                </i>
              ))}
            </span>
            <span className="cb-big-title">{t(big.level)}</span>
            <span className="cb-big-amount">{r.fmt(bigCount.value)}</span>
            <span className="cb-big-skip">{t('tapToSkip')}</span>
          </button>
        ) : null}

        {showInfo ? (
          <div className="cb-info" role="dialog" aria-modal="true" aria-label={t('paytable')}>
            <div className="cb-info-card">
              <h3>{t('paytable')}</h3>
              <p className="cb-info-note">{t('payNote')}</p>
              <div className="cb-pays">
                {cfg.wild !== undefined ? (
                  <div className="cb-pay is-special">
                    {theme.renderSymbol(cfg.wild, glyphName(cfg.wild))}
                    <div>
                      <strong>WILD</strong>
                      <span>{t('ruleWild')}</span>
                    </div>
                  </div>
                ) : null}
                {cfg.scatter ? (
                  <div className="cb-pay is-special">
                    {theme.renderSymbol(cfg.scatter.symbol, glyphName(cfg.scatter.symbol))}
                    <div>
                      <strong>SCATTER</strong>
                      {cfg.scatter.pays.map((sp, k) => {
                        const nextMin = cfg.scatter?.pays[k + 1]?.min;
                        return (
                          <span key={sp.min}>
                            {nextMin === undefined ? `${sp.min}+` : nextMin - 1 === sp.min ? `${sp.min}` : `${sp.min}–${nextMin - 1}`}: {sp.tenths / 10}×
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {cfg.pays
                  .map((p, i) =>
                    i === cfg.wild || i === cfg.scatter?.symbol ? null : (
                    <div key={i} className="cb-pay">
                      {theme.renderSymbol(i, glyphName(i))}
                      <div>
                        {cfg.bands.map((min, b) => {
                          const nextMin = cfg.bands[b + 1];
                          return (
                            <span key={b}>
                              {nextMin === undefined ? `${min}+` : nextMin - 1 === min ? `${min}` : `${min}–${nextMin - 1}`}: {(p[b] ?? 0) / 10}×
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    ),
                  )
                  .reverse()}
              </div>
              <ul className="cb-rules">
                <li>{t('ruleGrid')}</li>
                <li>{t('ruleTumble')}</li>
                <li>{t('ruleMultiplier')}</li>
                {cfg.wild !== undefined ? <li>{t('ruleWild')}</li> : null}
                {cfg.scatter ? <li>{t('ruleScatter')}</li> : null}
                <li>{t('ruleMax', { max: cfg.capX })}</li>
                <li>{t('ruleRtp', { rtp: cfg.rtp })}</li>
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
        <StakeBox r={r} currency={currency} rtp={cfg.rtp}>
          <div className="cb-controls">
            <button type="button" className="cb-spin" disabled={busy} onClick={() => void spinOnce()} aria-label={t('spin')}>
              <span className="cb-spin-icon" aria-hidden="true">⟳</span>
              <span>{t('spin')}</span>
            </button>
            {autoLeft > 0 ? (
              <button type="button" className="btn btn-dark cb-auto" onClick={() => (autoStop.current = true)}>
                {t('stop')} ({autoLeft})
              </button>
            ) : (
              <div className="cb-auto-row">
                {[10, 25].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className="btn btn-dark btn-sm"
                    disabled={busy || stakeMinorNow <= 0n || stakeMinorNow > BigInt(r.balance)}
                    onClick={() => void startAuto(n)}
                  >
                    {t('auto')} {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        </StakeBox>
      </div>
    </div>
  );
}
