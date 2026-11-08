'use client';

import '@/styles/reel-slots.css';
import { BIG_BASS_FISH, BIG_BASS_LEVELS, REEL_SLOT_CONFIGS, RS_CELLS, RS_REELS, RS_ROWS, type ReelSlotId, type RsFish, type RsLineWin } from '@aurum/shared';
import { Link } from '@/i18n/routing';
import { apiClient } from '@/lib/api';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BassArt, type BassArtKind } from './BassArt';
import { GameAiButton } from './GameInfo';
import { plain, useRound, type RoundResponse } from './useRound';

/**
 * Chilli Hot Wins, Ultimate Striker and Hannibal Big Bass: the three HANNIBAL 5 x 3 payline slots, each with its own
 * original look. The server decides the paid spin and every free spin; this screen spins the reels to the server's
 * symbols, shows the wins, then plays the free spins on the same reels.
 */

// ---------------------------------------------------------------------------------------------
// Sound: small synthesized effects (Web Audio), same on/off switch as the other games ("cb-sound").
// ---------------------------------------------------------------------------------------------
class ReelSound {
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
  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.06, when = 0, slide = 0) {
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
    this.tone(260, 0.35, 'triangle', 0.045, 0, 380);
  }
  stop(reel: number) {
    this.tone(150 + reel * 18, 0.07, 'square', 0.035, 0, -60);
  }
  scatter(n: number) {
    this.tone(880 * 2 ** (n / 12), 0.22, 'sine', 0.07);
    this.tone(1320 * 2 ** (n / 12), 0.18, 'sine', 0.04, 0.05);
  }
  win() {
    [0, 4, 7, 12].forEach((s, i) => this.tone(659 * 2 ** (s / 12), 0.16, 'triangle', 0.06, i * 0.07));
  }
  collect() {
    [0, 5, 9].forEach((s, i) => this.tone(523 * 2 ** (s / 12), 0.12, 'sine', 0.07, i * 0.05));
    this.tone(196, 0.25, 'sine', 0.05, 0, 120);
  }
  fanfare() {
    [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.tone(n, 0.3, 'sawtooth', 0.05, i * 0.11));
    [523.25, 659.25, 783.99, 1046.5].forEach((n) => this.tone(n, 0.9, 'triangle', 0.04, 0.5));
  }
  tick() {
    this.tone(1900, 0.03, 'sine', 0.02);
  }
  big() {
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(440 * 2 ** (s / 12), 0.26, 'triangle', 0.07, i * 0.1));
  }
  lose() {
    this.tone(260, 0.14, 'sine', 0.03, 0, -80);
  }
  /** Hannibal Big Bass: short win hook (layered on line-win tones). */
  bassWin() {
    [392, 494, 587, 784].forEach((n, i) => this.tone(n, 0.22, 'triangle', 0.05, i * 0.08));
    this.tone(196, 0.35, 'sine', 0.04, 0.35, 90);
  }
  /** Hannibal Big Bass: soft “cast again” motif when the round pays nothing. */
  bassLose() {
    [330, 294, 262].forEach((n, i) => this.tone(n, 0.2, 'sine', 0.035, i * 0.12, -35));
  }
}

// ---------------------------------------------------------------------------------------------
// Pictures of the symbols
// ---------------------------------------------------------------------------------------------
const ART: Record<ReelSlotId, string> = {
  chilliheat: '/media/games/chilliheat',
  ultimatestriker: '/media/games/ultimatestriker',
  bigbass: '/media/games/bigbass',
};
/** Big Bass pictures: rod, tackle box, float, dragonfly (ids 2-5) and the card letters (ids 6-10). */
const BB_ART: Record<number, BassArtKind> = { 2: 'rod', 3: 'tackle', 4: 'float', 5: 'dragonfly' };
const BB_CARD = ['A', 'K', 'Q', 'J', '10'];
const GLYPH: Record<ReelSlotId, readonly string[]> = {
  chilliheat: ['🌶️', '🦊', '🍋', '🧴', '🎸', '☀️', '🔥', '🎺'],
  ultimatestriker: ['⚽', '👟', '📣', '🧤', '🏆', '👑', '⭐', '🏟️'],
  bigbass: ['', '🐟', '🎣', '🧰', '🛶', '', 'A', 'K', 'Q', 'J', '10', '', ''],
};
const SKIN: Record<ReelSlotId, string> = { chilliheat: 'rs-chilli', ultimatestriker: 'rs-striker', bigbass: 'rs-bass' };
/** Symbols shown on the turning reels (never the scatter, so a turning reel never promises free spins). */
const BLUR: Record<ReelSlotId, readonly number[]> = {
  chilliheat: [0, 1, 2, 3, 4, 5, 6, 0, 1, 2],
  ultimatestriker: [0, 1, 2, 3, 4, 5, 6, 0, 1, 2],
  bigbass: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
/** The reels shown before the first spin: natural looking, no win. */
const START: Record<ReelSlotId, readonly number[]> = {
  chilliheat: [0, 3, 5, 1, 4, 2, 6, 1, 4, 0, 5, 1, 2, 3, 7],
  ultimatestriker: [0, 2, 5, 3, 0, 4, 1, 0, 6, 1, 2, 3, 4, 7, 5],
  bigbass: [0, 6, 2, 9, 4, 7, 3, 8, 1, 12, 10, 5, 1, 11, 6],
};

interface SpinView {
  grid: number[];
  wins: RsLineWin[];
  scatters: number[];
  award: number;
  left: number;
  mult?: number;
  boost?: number;
  values?: RsFish[];
  fish?: RsFish[];
  fishermen?: number[];
  collected?: number;
}
interface FreeData {
  count: number;
  spins: { multiplier: string; payoutMinor: string; detail?: SpinView }[];
  basePayoutMinor: string;
  totalPayoutMinor: string;
  capped: boolean;
}
interface Banner {
  kind: 'intro' | 'more' | 'level' | 'total';
  title: string;
  sub?: string;
  amount?: bigint;
}

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

interface FreeStep {
  view: SpinView;
  pay: bigint;
}
/** Big Bass "buy spins": packages and discount set by the Super Admin. */
interface BuyConfig {
  enabled: boolean;
  discountPct: number;
  packs: number[];
}
interface BoughtSpin {
  milli: number;
  base: unknown;
  free: Record<string, unknown>[];
}

function viewOf(detail: unknown, fallback: readonly number[]): SpinView {
  const d = (detail ?? {}) as Partial<SpinView>;
  return {
    grid: Array.isArray(d.grid) && d.grid.length === RS_CELLS ? d.grid : [...fallback],
    wins: Array.isArray(d.wins) ? d.wins : [],
    scatters: Array.isArray(d.scatters) ? d.scatters : [],
    award: typeof d.award === 'number' ? d.award : 0,
    left: typeof d.left === 'number' ? d.left : 0,
    mult: typeof d.mult === 'number' ? d.mult : 1,
    boost: typeof d.boost === 'number' ? d.boost : 1,
    values: Array.isArray(d.values) ? d.values : [],
    fish: Array.isArray(d.fish) ? d.fish : [],
    fishermen: Array.isArray(d.fishermen) ? d.fishermen : [],
    collected: typeof d.collected === 'number' ? d.collected : 0,
  };
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
      // hidden tabs pause animation frames: never let the round wait for them
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

/** One symbol: emoji, card letter or picture (no heavy files). */
function Sym({ game, id, label, tag }: { game: ReelSlotId; id: number; label?: string; tag?: string }) {
  const cfg = REEL_SLOT_CONFIGS[game];
  if (game === 'bigbass') {
    if (id === cfg.scatter) {
      // the scatter must be seen at once: a big golden coin with FREE SPINS, never like the fish
      return (
        <b className="rs-badge is-scatter">
          <i aria-hidden="true">★</i>
          <span>{tag ?? 'FREE SPINS'}</span>
        </b>
      );
    }
    if (id === 0) {
      return (
        <span className="bb-tile is-man">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ART.bigbass}/fisherman.jpg`} alt="" draggable={false} />
        </span>
      );
    }
    if (id === 1) {
      return (
        <span className="bb-tile is-cash">
          <BassArt kind="fish" />
        </span>
      );
    }
    const art = BB_ART[id];
    if (art) return <BassArt kind={art} />;
    if (id >= 6 && id <= 10) return <b className={`bb-card c${id}`}>{BB_CARD[id - 6]}</b>;
    if (id === cfg.wild) return <b className="rs-badge is-wild">WILD</b>;
  }
  return (
    <>
      <i className="rs-glyph" aria-hidden="true">
        {GLYPH[game][id]}
      </i>
      {label ? <span className="rs-lab">{label}</span> : null}
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Game
// ---------------------------------------------------------------------------------------------
export function ReelSlotGame({ game, currency, locale, initialBalanceMinor }: { game: ReelSlotId; currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const cfg = REEL_SLOT_CONFIGS[game];
  const t = useTranslations('reelSlots');
  const tg = (key: string, values?: Record<string, string | number>) => t(`${game}.${key}` as never, values as never);
  const r = useRound({ endpoint: `/games/${game}/play`, currency, locale, initialBalanceMinor, ownFreeSpins: true });
  const rRef = useRef(r);
  rRef.current = r;

  const sound = useRef(new ReelSound());
  const [soundOn, setSoundOn] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const turboRef = useRef(false);
  const [grid, setGrid] = useState<number[]>(() => [...START[game]]);
  const [spinning, setSpinning] = useState<boolean[]>(() => new Array<boolean>(RS_REELS).fill(false));
  const [tease, setTease] = useState(-1);
  const [lit, setLit] = useState<ReadonlySet<number>>(new Set());
  const [scat, setScat] = useState<ReadonlySet<number>>(new Set());
  const [fishOn, setFishOn] = useState<ReadonlyMap<number, number>>(new Map());
  const [catchers, setCatchers] = useState<ReadonlySet<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [lineText, setLineText] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [fs, setFs] = useState<{ left: number; mult: number; collected: number; boost: boolean; played: number; total: number } | null>(null);
  const [bought, setBought] = useState<{ i: number; n: number } | null>(null);
  const buySkip = useRef(false);
  const [buyCfg, setBuyCfg] = useState<BuyConfig | null>(null);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyPick, setBuyPick] = useState<number | null>(null);
  const reelsRef = useRef<HTMLDivElement>(null);
  /** Big Bass: the prize shown on every cash fish of the reels (thousandths of the bet). */
  const [vals, setVals] = useState<ReadonlyMap<number, number>>(new Map());
  const [big, setBig] = useState<{ level: 'big' | 'mega' | 'epic'; amount: bigint } | null>(null);
  const [showInfo, setShowInfo] = useState<false | 'pay' | 'how'>(false);
  const [bbPeek, setBbPeek] = useState(false);
  const bbPeekTimer = useRef<number | null>(null);
  const [autoLeft, setAutoLeft] = useState(0);
  const [played, setPlayed] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'spin' | 'show'>('idle');
  const autoStop = useRef(false);
  const skip = useRef<(() => void) | null>(null);
  const total = useCountUp();
  const bigCount = useCountUp();
  const [blurSeed, setBlurSeed] = useState(0);

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
  /** Big Bass: longer reel travel so spins feel fuller (same server result). */
  const anim = (n: number) => ms(game === 'bigbass' ? Math.round(n * 1.9) : n);

  // packages of spins sold by the Super Admin (Big Bass)
  useEffect(() => {
    if (game !== 'bigbass') return;
    apiClient<BuyConfig>('/games/bigbass/buy')
      .then((c) => setBuyCfg(c))
      .catch(() => setBuyCfg(null));
  }, [game]);

  /** The fish prizes swim to the fisherman (Big Bass): each value flies from its fish to the nearest fisherman. */
  function flyFish(fishermen: number[]) {
    const root = reelsRef.current;
    if (!root || fishermen.length === 0) return;
    const centre = (cell: number) => {
      const el = root.querySelector<HTMLElement>(`[data-cell="${cell}"]`);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    };
    root.querySelectorAll<HTMLElement>('[data-fish]').forEach((tag) => {
      const from = centre(Number(tag.dataset.fish));
      if (!from) return;
      let best: { x: number; y: number } | null = null;
      for (const f of fishermen) {
        const c = centre(f);
        if (c && (!best || Math.hypot(c.x - from.x, c.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y))) best = c;
      }
      if (!best) return;
      tag.style.setProperty('--fx', `${best.x - from.x}px`);
      tag.style.setProperty('--fy', `${best.y - from.y}px`);
      tag.classList.add('is-flying');
    });
  }

  function flashBass() {
    if (game !== 'bigbass') return;
    if (bbPeekTimer.current) window.clearTimeout(bbPeekTimer.current);
    setBbPeek(true);
    bbPeekTimer.current = window.setTimeout(() => {
      setBbPeek(false);
      bbPeekTimer.current = null;
    }, 2200);
  }

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

  const symName = (id: number) => tg(`sym.${id}`);
  const stakeMinor = toMinor(r.stake, currency.decimals);

  /** Waits, or less when the player taps the banner. */
  function hold(n: number): Promise<void> {
    return new Promise((ok) => {
      const timer = window.setTimeout(() => {
        skip.current = null;
        ok();
      }, n);
      skip.current = () => {
        window.clearTimeout(timer);
        skip.current = null;
        ok();
      };
    });
  }

  /** Turns the reels and stops them one by one on the server's symbols; slows down when free spins are close. */
  async function runReels(target: number[], started: number, values: RsFish[] = []) {
    setVals(new Map(values.map((v) => [v.cell, v.milli])));
    setBlurSeed((s) => s + 1);
    setSpinning(new Array<boolean>(RS_REELS).fill(true));
    await wait(Math.max(0, anim(480) - (performance.now() - started)));
    let scatters = 0;
    for (let reel = 0; reel < RS_REELS; reel += 1) {
      const close = scatters >= cfg.freeMin - 2 && scatters > 0 && reel >= 2 && scatters + (RS_REELS - reel) >= cfg.freeMin;
      if (close) {
        setTease(reel);
        if (game === 'bigbass') flashBass();
        await wait(anim(720));
      } else if (reel > 0) {
        await wait(anim(175));
      }
      setGrid((g) => g.map((s, i) => (i % RS_REELS === reel ? (target[i] ?? s) : s)));
      setSpinning((sp) => sp.map((v, i) => (i === reel ? false : v)));
      sound.current.stop(reel);
      let found = 0;
      for (let row = 0; row < RS_ROWS; row += 1) if (target[row * RS_REELS + reel] === cfg.scatter) found += 1;
      if (found > 0) {
        scatters += found;
        sound.current.scatter(scatters);
      }
    }
    setTease(-1);
    await wait(anim(180));
  }

  /** Line wins (and Big Bass fish) of one spin; `from` is the win already counted before this spin. */
  async function showSpin(v: SpinView, payout: bigint, from: bigint) {
    const fmt = rRef.current.fmt;
    const stake = stakeMinor;
    if (v.wins.length > 0) {
      setLit(new Set(v.wins.flatMap((w) => w.cells)));
      sound.current.win();
      if (game === 'bigbass') {
        sound.current.bassWin();
        flashBass();
      }
      const top = [...v.wins].sort((a, b) => b.milli - a.milli)[0] as RsLineWin;
      const lineMinor = (BigInt(v.wins.reduce((a, w) => a + w.milli, 0)) * stake) / 1000n;
      const extra = (v.boost ?? 1) > 1 ? ` · ${t('boost')}` : (v.mult ?? 1) > 1 ? ` · x${v.mult}` : '';
      setLineText(`${t('linesWon', { n: v.wins.length })} · ${top.count} × ${symName(top.symbol)}${extra} = ${fmt((v.boost ?? 1) > 1 ? lineMinor * 2n : lineMinor)}`);
      setPhase('show');
      await total.run(from, from + ((v.boost ?? 1) > 1 ? lineMinor * 2n : lineMinor), ms(650));
      await wait(ms(450));
    }
    const fish = v.fish ?? [];
    if (fish.length > 0) {
      setCatchers(new Set(v.fishermen ?? []));
      setFishOn(new Map(fish.map((f) => [f.cell, f.milli])));
      sound.current.collect();
      if (game === 'bigbass') flashBass();
      const fishMinor = (BigInt(fish.reduce((a, f) => a + f.milli, 0)) * stake) / 1000n;
      setLineText(tg('fishCollect', { amount: fmt(fishMinor) }));
      setPhase('show');
      await wait(ms(800));
      flyFish(v.fishermen ?? []);
      const now = total.value > from ? total.value : from;
      await total.run(now, now + fishMinor, ms(900));
      await wait(ms(450));
    }
    if (payout > 0n) total.setValue(from + payout);
    setLit(new Set());
    setCatchers(new Set());
    setLineText(null);
  }

  /** The free spins of one paid spin, played on the same reels. Returns the win counted so far. */
  async function playFree(base: SpinView, steps: FreeStep[], from: bigint): Promise<bigint> {
    let running = from;
    setBanner({ kind: 'intro', title: t('fsIntro', { count: base.award >= cfg.freeCount ? cfg.freeCount : base.award }), sub: tg('fsIntroSub') });
    await hold(ms(2000));
    setBanner(null);
    setScat(new Set());
    let mult = game === 'ultimatestriker' ? 2 : 1;
    if (game === 'bigbass') mult = BIG_BASS_LEVELS.filter((l) => (base.collected ?? 0) >= l.at).at(-1)?.mult ?? 1;
    setFs({ left: base.left, mult, collected: base.collected ?? 0, boost: false, played: 0, total: base.left });
    for (const step of steps) {
      if (buySkip.current) break;
      const v = step.view;
      setFs((f) => (f ? { ...f, left: Math.max(0, f.left - 1), played: f.played + 1, mult: v.mult ?? f.mult, boost: false } : f));
      sound.current.spin();
      setFishOn(new Map());
      await runReels(v.grid, performance.now(), v.values);
      if ((v.boost ?? 1) > 1) setFs((f) => (f ? { ...f, boost: true } : f));
      await showSpin(v, step.pay, running);
      running += step.pay;
      total.setValue(running);
      setFs((f) => (f ? { ...f, left: v.left, total: f.played + v.left, collected: v.collected ?? f.collected } : f));
      if (v.award > 0) {
        setScat(new Set(v.scatters.length >= cfg.freeMin ? v.scatters : []));
        if (game === 'bigbass') {
          const before = (v.collected ?? 0) - (v.fishermen?.length ?? 0);
          const level = BIG_BASS_LEVELS.filter((l) => before < l.at && (v.collected ?? 0) >= l.at).at(-1);
          if (level) setBanner({ kind: 'level', title: tg('levelUp', { mult: level.mult }), sub: t('fsMore', { count: v.award }) });
          else setBanner({ kind: 'more', title: t('fsMore', { count: v.award }) });
          sound.current.bassWin();
          flashBass();
        } else {
          setBanner({ kind: 'more', title: t('fsMore', { count: v.award }), sub: game === 'ultimatestriker' ? tg('multUp', { mult: Math.min(10, (v.mult ?? 2) + 1) }) : undefined });
        }
        sound.current.fanfare();
        await hold(ms(1500));
        setBanner(null);
        setScat(new Set());
      }
      await wait(ms(250));
    }
    return running;
  }

  /** Bought spins (Big Bass): every spin of the package on the reels, fast, with its own free spins; then the total. */
  async function presentBought(res: RoundResponse, bet: bigint) {
    const fmt = rRef.current.fmt;
    const list = ((res.detail as { spins?: BoughtSpin[] }).spins ?? []).filter((x) => x && typeof x === 'object');
    const wasTurbo = turboRef.current;
    turboRef.current = true;
    let running = 0n;
    try {
      for (let i = 0; i < list.length && !buySkip.current; i += 1) {
        const sp = list[i] as BoughtSpin;
        setBought({ i: i + 1, n: list.length });
        const base = viewOf(sp.base, START[game]);
        const baseMilli = base.wins.reduce((a, w) => a + w.milli, 0) + (base.fish ?? []).reduce((a, f) => a + f.milli, 0);
        const basePay = (BigInt(baseMilli) * bet) / 1000n;
        sound.current.spin();
        setLit(new Set());
        setFishOn(new Map());
        await runReels(base.grid, performance.now(), base.values);
        if (base.scatters.length >= cfg.freeMin) {
          setScat(new Set(base.scatters));
          sound.current.fanfare();
        }
        await showSpin(base, basePay, running);
        running += basePay;
        total.setValue(running);
        if (sp.free.length > 0 && !buySkip.current) {
          running = await playFree(
            base,
            sp.free.map((f) => ({ view: viewOf(f, START[game]), pay: (BigInt(typeof f.milli === 'number' ? f.milli : 0) * bet) / 1000n })),
            running,
          );
          setFs(null);
        }
        setScat(new Set());
        await wait(ms(120));
      }
    } finally {
      turboRef.current = wasTurbo;
      setBought(null);
      setFs(null);
      setLit(new Set());
      setScat(new Set());
      setFishOn(new Map());
    }
    const payout = BigInt(res.payout.amountMinor);
    total.setValue(payout);
    setBanner({ kind: 'total', title: t('boughtTotal', { n: list.length }), amount: payout });
    if (payout > 0n) sound.current.bassWin();
    sound.current.big();
    await hold(ms(3000));
    setBanner(null);
    setMsg(payout > 0n ? tg('winMsg', { amount: fmt(payout), n: list.length }) : tg('loseMsg'));
  }

  /** Buys one package of spins at the current bet (price with the Super Admin's discount). */
  async function buyPack(n: number) {
    const round = rRef.current;
    if (round.busy || !buyCfg) return;
    const bet = stakeMinor;
    const price = (bet * BigInt(n) * BigInt(100 - buyCfg.discountPct)) / 100n;
    setBuyOpen(false);
    setBuyPick(null);
    buySkip.current = false;
    sound.current.spin();
    setMsg(null);
    setLineText(null);
    total.setValue(0n);
    setPhase('spin');
    let settled = false;
    await round.play(
      { spins: n },
      async (res) => {
        settled = true;
        await presentBought(res, bet);
      },
      { path: '/games/bigbass/buy', costMinor: price },
    );
    buySkip.current = false;
    setSpinning(new Array<boolean>(RS_REELS).fill(false));
    setTease(-1);
    setPhase('idle');
    if (settled) setPlayed((x) => x + n);
  }

  /** Plays the server result: the paid spin, then the free spins on the same reels, then the total. */
  async function present(res: RoundResponse, started: number) {
    const fmt = rRef.current.fmt;
    const stake = BigInt(res.stake.amountMinor);
    const free = res.detail.freeSpins as FreeData | undefined;
    const base = viewOf(res.detail, START[game]);
    const basePayout = BigInt(free ? free.basePayoutMinor : res.payout.amountMinor);

    await runReels(base.grid, started, base.values);
    if (base.scatters.length >= cfg.freeMin) {
      setScat(new Set(base.scatters));
      sound.current.fanfare();
      if (game === 'bigbass') {
        sound.current.bassWin();
        flashBass();
      }
    }
    await showSpin(base, basePayout, 0n);

    let running = basePayout;
    if (free && free.spins.length > 0) {
      running = await playFree(
        base,
        free.spins.map((sp) => ({ view: viewOf(sp.detail, START[game]), pay: BigInt(sp.payoutMinor) })),
        running,
      );
      const totalPayout = BigInt(res.payout.amountMinor);
      total.setValue(totalPayout);
      setBanner({ kind: 'total', title: t('fsTotal'), amount: totalPayout });
      sound.current.big();
      await hold(ms(2600));
      setBanner(null);
      setFs(null);
      running = totalPayout;
    }

    const payout = BigInt(res.payout.amountMinor);
    total.setValue(payout);
    setFishOn(new Map());
    setMsg(payout > 0n ? tg('winMsg', { amount: fmt(payout), n: base.wins.length }) : tg('loseMsg'));
    if (payout === 0n) {
      if (game === 'bigbass') sound.current.bassLose();
      else sound.current.lose();
      return;
    }
    if (game === 'bigbass' && payout > 0n && !(free?.spins?.length)) sound.current.bassWin();
    const x = stake > 0n ? Number((payout * 100n) / stake) / 100 : 0;
    if (x >= 10) {
      const level = x >= 100 ? 'epic' : x >= 30 ? 'mega' : 'big';
      setBig({ level, amount: payout });
      if (game === 'bigbass') flashBass();
      sound.current.big();
      let skipped = false;
      const done = bigCount.run(0n, payout, ms(level === 'epic' ? 4000 : level === 'mega' ? 3200 : 2400), () => sound.current.tick());
      await Promise.race([
        done,
        new Promise<void>((ok) => {
          skip.current = () => {
            skipped = true;
            ok();
          };
        }),
      ]);
      if (skipped) {
        bigCount.stop();
        bigCount.setValue(payout);
      }
      await wait(ms(skipped ? 400 : 1000));
      skip.current = null;
      setBig(null);
    }
  }

  /** One spin. Resolves true when the round was settled by the server. */
  async function spinOnce(): Promise<boolean> {
    const round = rRef.current;
    if (round.busy) return false;
    sound.current.spin();
    setMsg(null);
    setLineText(null);
    setLit(new Set());
    setScat(new Set());
    setFishOn(new Map());
    total.setValue(0n);
    setPhase('spin');
    setBlurSeed((s) => s + 1);
    setSpinning(new Array<boolean>(RS_REELS).fill(true));
    const started = performance.now();
    let settled = false;
    await round.play({}, async (res) => {
      settled = true;
      await present(res, started);
    });
    setSpinning(new Array<boolean>(RS_REELS).fill(false));
    setTease(-1);
    setPhase('idle');
    if (settled) setPlayed((n) => n + 1);
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

  const ladder = useMemo(() => betLadder(r.min, r.max, currency.decimals), [r.min, r.max, currency.decimals]);
  function changeBet(dir: 1 | -1) {
    const next = dir > 0 ? ladder.find((v) => v > stakeMinor) : [...ladder].reverse().find((v) => v < stakeMinor);
    if (next !== undefined) r.setStake(plain(next, currency.decimals));
  }

  const busy = r.busy || phase !== 'idle' || autoLeft > 0;
  const canSpin = !busy;
  const canAuto = !busy && stakeMinor > 0n && stakeMinor <= BigInt(r.balance);
  const lastPayout = r.result ? BigInt(r.result.payout.amountMinor) : null;
  const fmt = r.fmt;
  const blur = useMemo(() => {
    const pool = BLUR[game];
    return Array.from({ length: RS_REELS }, (_, reel) => Array.from({ length: 9 }, (_, k) => pool[(reel * 3 + k * 7 + blurSeed * 5) % pool.length] as number));
  }, [game, blurSeed]);

  // ---------------------------------------------------------------- reels
  const reels = (
    <div ref={reelsRef} className={`rs-reels${fs ? ' is-free' : ''}`} role="grid" aria-label={t('reels')}>
      {Array.from({ length: RS_REELS }, (_, reel) => (
        <div key={reel} className={`rs-reel${spinning[reel] ? ' is-spinning' : ' is-stopped'}${tease === reel ? ' is-tease' : ''}`} role="row">
          {spinning[reel] ? (
            <div className="rs-strip" aria-hidden="true" style={{ ['--d' as string]: `${(reel * 37) % 90}ms` }}>
              {[...(blur[reel] ?? []), ...(blur[reel] ?? [])].map((id, k) => (
                <div key={k} className={`rs-sym s${id}`}>
                  <Sym game={game} id={id} />
                </div>
              ))}
            </div>
          ) : (
            Array.from({ length: RS_ROWS }, (_, row) => {
              const cell = row * RS_REELS + reel;
              const id = grid[cell] ?? 0;
              const fishMilli = fishOn.get(cell);
              const cls = [
                'rs-sym',
                `s${id}`,
                id === cfg.wild ? 'is-wild' : '',
                id === cfg.scatter ? 'is-scatter' : '',
                lit.has(cell) ? 'is-win' : '',
                scat.has(cell) ? 'is-scat' : '',
                catchers.has(cell) ? 'is-catch' : '',
                fishMilli !== undefined ? 'is-fish' : '',
                (lit.size > 0 || scat.size > 0) && !lit.has(cell) && !scat.has(cell) && !catchers.has(cell) && fishMilli === undefined ? 'is-dim' : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={`${cell}-${blurSeed}`} className={cls} role="gridcell" aria-label={symName(id)} title={symName(id)} data-cell={cell}>
                  <Sym game={game} id={id} label={game === 'chilliheat' ? tg(`lab.${id}`) : undefined} tag={game === 'bigbass' ? t('scatterTag') : undefined} />
                  {fishMilli !== undefined ? (
                    <em className="rs-fishval is-got" dir="ltr" data-fish={cell}>
                      {fmt((BigInt(fishMilli) * stakeMinor) / 1000n)}
                    </em>
                  ) : game === 'bigbass' && id === 1 && vals.has(cell) ? (
                    <em className="rs-fishval" dir="ltr">
                      {fmt((BigInt(vals.get(cell) ?? 0) * stakeMinor) / 1000n)}
                    </em>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      ))}
    </div>
  );

  const bannerEl = banner ? (
    <button type="button" className={`rs-banner is-${banner.kind}`} onClick={() => skip.current?.()} aria-live="polite">
      <strong>{banner.title}</strong>
      {banner.amount !== undefined ? <b dir="ltr">{fmt(banner.amount)}</b> : null}
      {banner.sub ? <span>{banner.sub}</span> : null}
      <small>{t('tapToContinue')}</small>
    </button>
  ) : null;

  const bigEl = big ? (
    <button type="button" className={`rs-big is-${big.level}${game === 'bigbass' ? ' is-bass' : ''}`} onClick={() => skip.current?.()} aria-label={t('tapToContinue')}>
      <span className="rs-big-title">{t(big.level)}</span>
      <span className="rs-big-amount" dir="ltr">
        {fmt(bigCount.value)}
      </span>
      <span className="rs-big-skip">{t('tapToContinue')}</span>
    </button>
  ) : null;

  const winNow = total.value;
  const status = lineText ?? (phase !== 'idle' && winNow > 0n ? `${t('win')} ${fmt(winNow)}` : phase !== 'idle' ? tg('spinning') : (msg ?? tg('idle')));

  const topBar = (
    <div className="rs-top">
      <Link href="/casino" className="rs-ib" aria-label={t('back')} title={t('back')}>
        ‹
      </Link>
      <div className="rs-brand" aria-hidden="true">
        <span className="rs-crest">♛</span>
        <span>
          <b>HANNIBAL</b>
          <small>CASINO</small>
        </span>
      </div>
      <div className="rs-top-right">
        <button type="button" className={turbo ? 'rs-ib is-on' : 'rs-ib'} onClick={toggleTurbo} aria-pressed={turbo} aria-label={t('turbo')} title={t('turbo')}>
          »
        </button>
        <button type="button" className="rs-ib" onClick={() => setShowInfo('pay')} aria-label={t('info')} title={t('info')}>
          i
        </button>
        <button type="button" className={soundOn ? 'rs-ib' : 'rs-ib is-off'} onClick={toggleSound} aria-pressed={soundOn} aria-label={t('sound')} title={t('sound')}>
          {soundOn ? '♫' : '✕'}
        </button>
      </div>
    </div>
  );

  const betBox = (
    <div className="rs-betbox">
      <button type="button" className="rs-pm" disabled={busy || !ladder.some((v) => v < stakeMinor)} onClick={() => changeBet(-1)} aria-label={t('betDown')}>
        −
      </button>
      <div>
        <small>{t('bet')}</small>
        <strong dir="ltr">{fmt(stakeMinor)}</strong>
      </div>
      <button type="button" className="rs-pm" disabled={busy || !ladder.some((v) => v > stakeMinor)} onClick={() => changeBet(1)} aria-label={t('betUp')}>
        +
      </button>
    </div>
  );

  const autoBtn = (
    <button
      type="button"
      className={autoLeft > 0 ? 'rs-auto is-on' : 'rs-auto'}
      disabled={autoLeft === 0 && !canAuto}
      onClick={() => (autoLeft > 0 ? (autoStop.current = true) : void startAuto(25))}
    >
      {autoLeft > 0 ? `${tg('autoStop')} · ${autoLeft}` : tg('auto')}
    </button>
  );

  const errorEl = r.error ? (
    <div className="rs-toast" role="alert">
      {r.error}
    </div>
  ) : null;

  // ---------------------------------------------------------------- paytable / how to play
  const payRows = cfg.pays
    .map((p, id) => ({ id, p }))
    .filter((x) => (x.p[0] ?? 0) > 0 || (x.p[2] ?? 0) > 0)
    .reverse();
  const info = showInfo ? (
    <div className="rs-modal" role="dialog" aria-modal="true" aria-label={t('paytable')} onClick={(e) => e.target === e.currentTarget && setShowInfo(false)}>
      <div className="rs-modal-card">
        <button type="button" className="rs-close" onClick={() => setShowInfo(false)} aria-label={t('close')}>
          ×
        </button>
        <div className="rs-tabs">
          <button type="button" className={showInfo === 'pay' ? 'is-on' : ''} onClick={() => setShowInfo('pay')}>
            {t('paytable')}
          </button>
          <button type="button" className={showInfo === 'how' ? 'is-on' : ''} onClick={() => setShowInfo('how')}>
            {t('howToPlay')}
          </button>
        </div>
        {showInfo === 'pay' ? (
          <>
            <p className="rs-muted">{t('payNote', { lines: cfg.lines.length })}</p>
            <div className="rs-pay">
              {payRows.map(({ id, p }) => (
                <div key={id} className="rs-payrow">
                  <span className={`rs-paysym s${id}${id === cfg.wild ? ' is-wild' : ''}`}>
                    <Sym game={game} id={id} />
                  </span>
                  <b>{symName(id)}</b>
                  <span dir="ltr">
                    {[5, 4, 3].map((n) => (
                      <i key={n}>
                        {n}× <em>{fmt((BigInt(p[n - 3] ?? 0) * stakeMinor) / 1000n)}</em>
                      </i>
                    ))}
                  </span>
                </div>
              ))}
              <div className="rs-payrow is-feature">
                <span className={`rs-paysym s${cfg.scatter} is-scatter`}>
                  <Sym game={game} id={cfg.scatter} tag={game === 'bigbass' ? t('scatterTag') : undefined} />
                </span>
                <b>{symName(cfg.scatter)}</b>
                <span>{tg('scatterPay')}</span>
              </div>
              {game === 'bigbass' ? (
                <div className="rs-payrow is-feature">
                  <span className="rs-paysym s1">
                    <Sym game={game} id={1} />
                  </span>
                  <b>{symName(1)}</b>
                  <span dir="ltr">{[...new Set(BIG_BASS_FISH)].map((f) => `${f / 1000}×`).join(' · ')}</span>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <ul className="rs-rules">
            <li>{tg('rule1')}</li>
            <li>{tg('rule2')}</li>
            <li>{tg('rule3')}</li>
            {game !== 'chilliheat' ? <li>{tg('rule4')}</li> : null}
            <li>{t('ruleMax', { max: cfg.capX })}</li>
            <li>{t('ruleBet', { min: fmt(r.min), max: fmt(r.max) })}</li>
            <li>{t('ruleRtp', { rtp: cfg.rtp })}</li>
            <li>{t('ruleServer')}</li>
          </ul>
        )}
      </div>
    </div>
  ) : null;

  const under = (
    <div className="rs-under">
      <GameAiButton active={r.busy} />
      <small>{t('rtpLine', { rtp: cfg.rtp, max: cfg.capX })}</small>
    </div>
  );

  // ---------------------------------------------------------------- Chilli Hot Wins
  if (game === 'chilliheat') {
    return (
      <div className={`rs-wrap ${SKIN[game]}${turbo ? ' is-turbo' : ''}`}>
        <section className="rs-shell" aria-label={tg('title')}>
          {topBar}
          <div className="ch-hero">
            <div className="ch-copy">
              <span className="ch-eyebrow">{tg('eyebrow')}</span>
              <h2>
                {tg('h1a')} <em>{tg('h1b')}</em>
              </h2>
              <p>{tg('tagline')}</p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="ch-art" src={`${ART.chilliheat}/mariachi.jpg`} alt="" />
            <span className="ch-pepper" aria-hidden="true">
              🌶️
            </span>
          </div>
          <div className={`ch-machine${phase === 'spin' ? ' busy' : ''}`}>
            <div className="ch-frame">
              {reels}
              {bannerEl}
            </div>
            <div className="ch-status">
              <span>{status}</span>
              <span>{fs ? tg('fsStatus', { n: fs.left }) : ''}</span>
            </div>
            <div className="ch-controls">
              <div className="ch-wallet">
                <small>{tg('credit')}</small>
                <strong dir="ltr">{fmt(r.balance)}</strong>
              </div>
              {betBox}
              <button type="button" className={busy ? 'ch-spin is-busy' : 'ch-spin'} disabled={!canSpin} onClick={() => void spinOnce()} aria-label={tg('spin')}>
                <span>{fs ? tg('freeSpin') : tg('spin')}</span>
                <small aria-hidden="true">▶</small>
              </button>
              {autoBtn}
            </div>
            <div className="ch-result">{phase !== 'idle' ? '\u00a0' : lastPayout !== null ? (lastPayout > 0n ? tg('youWon', { amount: fmt(lastPayout) }) : tg('noWin')) : tg('ready')}</div>
            {errorEl}
          </div>
          <footer className="ch-foot">
            <button type="button" onClick={() => setShowInfo('pay')}>
              {tg('paytableBtn')}
            </button>
            <span>{tg('footer')}</span>
            <button type="button" onClick={() => setShowInfo('how')}>
              {tg('howBtn')}
            </button>
          </footer>
          {bigEl}
          {info}
        </section>
        {under}
      </div>
    );
  }

  // ---------------------------------------------------------------- Ultimate Striker
  if (game === 'ultimatestriker') {
    return (
      <div className={`rs-wrap ${SKIN[game]}${turbo ? ' is-turbo' : ''}`}>
        <section className="rs-shell" aria-label={tg('title')}>
          {topBar}
          <div className="us-head">
            <div className="us-eyebrow">{tg('eyebrow')}</div>
            <h2>
              {tg('h1a')} <em>{tg('h1b')}</em>
            </h2>
            <p>{tg('tagline')}</p>
          </div>
          <div className="us-stadium">
            <div className="us-lights" aria-hidden="true" />
            <div className="us-crowd" aria-hidden="true" />
            <div className="us-pitch" aria-hidden="true">
              <div className="us-halfline" />
              <div className="us-circle" />
            </div>
            <div className="us-frame">
              {reels}
              <div className="us-ribbon" aria-live="polite">
                {fs ? tg('freePrefix', { text: status }) : status}
              </div>
              {bannerEl}
            </div>
          </div>
          <div className="us-controls">
            <div className="us-balance">
              <small>{t('balance')}</small>
              <strong dir="ltr">{fmt(r.balance)}</strong>
            </div>
            <label className="us-stake">
              <small>{tg('stake')}</small>
              <select value={stakeMinor.toString()} disabled={busy} onChange={(e) => r.setStake(plain(BigInt(e.target.value), currency.decimals))} dir="ltr">
                {(ladder.some((v) => v === stakeMinor) ? ladder : [...ladder, stakeMinor].sort((a, b) => (a < b ? -1 : 1))).map((v) => (
                  <option key={v.toString()} value={v.toString()}>
                    {fmt(v)}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={busy ? 'us-spin is-busy' : 'us-spin'} disabled={!canSpin} onClick={() => void spinOnce()}>
              ⚽ {tg('kickOff')}
            </button>
            {autoBtn}
          </div>
          {errorEl}
          <div className="us-row">
            <article>
              <b>{tg('matchStatus')}</b>
              <span>{tg('spinsPlayed', { n: played })}</span>
            </article>
            <article className={fs ? 'is-live' : ''}>
              <b>{tg('fsTitle')}</b>
              <span>{tg('fsRemaining', { n: fs ? fs.left : 0 })}</span>
            </article>
            <article className={fs ? 'is-live' : ''}>
              <b>{tg('multTitle')}</b>
              <span>
                x{fs ? fs.mult : 1}
                {fs?.boost ? ` · ${t('boost')}` : ''}
              </span>
            </article>
          </div>
          <div className="us-row">
            <article>
              <b>{tg('wildTitle')}</b>
              <span>{tg('wildText')}</span>
            </article>
            <article>
              <b>{tg('scatterTitle')}</b>
              <span>{tg('scatterText')}</span>
            </article>
            <article>
              <b>{tg('risingTitle')}</b>
              <span>{tg('risingText')}</span>
            </article>
          </div>
          <div className="us-paytable">
            <h3>{tg('rulesTitle')}</h3>
            <div className="us-items">
              {cfg.symbols.map((_, id) => (
                <span key={id}>
                  {GLYPH.ultimatestriker[id]} {symName(id)}
                </span>
              ))}
            </div>
            <p>{tg('rulesLine', { max: cfg.capX })}</p>
            <button type="button" className="us-more" onClick={() => setShowInfo('pay')}>
              {t('paytable')}
            </button>
          </div>
          {bigEl}
          {info}
        </section>
        {under}
      </div>
    );
  }

  // ---------------------------------------------------------------- Hannibal Big Bass
  const collected = fs?.collected ?? 0;
  const dockMsg =
    lineText ??
    (phase !== 'idle' && winNow > 0n ? `${t('win')} ${fmt(winNow)}` : phase !== 'idle' ? tg('spinning') : busy ? tg('spinning') : (msg ?? tg('placeBets')));
  return (
    <div className={`rs-wrap ${SKIN[game]} bb-v2${fs ? ' is-free' : ''}${turbo ? ' is-turbo' : ''}`}>
      <div className="bb-ocean" aria-hidden="true">
        <div className="bb-ocean-bg" />
        <div className="bb-ocean-surface" />
        <div className="bb-ocean-rays" />
        <div className="bb-ocean-caustics" />
        <div className="bb-ocean-bubbles bb-ocean-bubbles--a" />
        <div className="bb-ocean-bubbles bb-ocean-bubbles--b" />
        <div className="bb-kelp bb-kelp--l" />
        <div className="bb-kelp bb-kelp--r" />
        <div className="bb-ocean-edge bb-ocean-edge--l" />
        <div className="bb-ocean-edge bb-ocean-edge--r" />
        <div className="bb-ocean-floor" />
      </div>
      <section className="rs-shell" aria-label={tg('title')}>
        <div className="bb-scene">
          <div className="bb-overlay-top">
            <Link href="/casino" className="bb-tool" aria-label={t('back')} title={t('back')}>
              ‹
            </Link>
            <div className="bb-overlay-right">
              <button type="button" className={turbo ? 'bb-tool is-on' : 'bb-tool'} onClick={toggleTurbo} aria-pressed={turbo} aria-label={t('turbo')} title={t('turbo')}>
                »
              </button>
              <button type="button" className="bb-tool" onClick={() => setShowInfo('pay')} aria-label={t('info')} title={t('info')}>
                i
              </button>
              <button type="button" className={soundOn ? 'bb-tool' : 'bb-tool is-off'} onClick={toggleSound} aria-pressed={soundOn} aria-label={t('sound')} title={t('sound')}>
                {soundOn ? '♫' : '✕'}
              </button>
            </div>
          </div>
          <div className="bb-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="bb-logo-fish" src={`${ART.bigbass}/bass.svg`} alt="" draggable={false} />
            <div className="bb-logo-text">
              <span className="bb-logo-line">HANNIBAL</span>
              <span className="bb-logo-line bb-logo-line--sub">BIG BASS</span>
            </div>
          </div>
          <div className="bb-machine">
            {bought ? (
              <div className="bb-hud is-bought">
                <span className="bb-left">{t('boughtCount', { i: bought.i, n: bought.n })}</span>
                <span className="bb-win" dir="ltr">
                  {t('win')} {fmt(total.value)}
                </span>
                <button type="button" className="bb-skip" onClick={() => (buySkip.current = true)}>
                  {t('skip')} »
                </button>
              </div>
            ) : null}
            {fs ? (
              <div className="bb-hud">
                <span className="bb-left">{t('fsCount', { n: Math.max(1, fs.played), total: Math.max(fs.total, fs.played) })}</span>
                <span className="bb-collector" aria-label={tg('collector')}>
                  {Array.from({ length: BIG_BASS_LEVELS.at(-1)?.at ?? 12 }, (_, k) => {
                    const level = BIG_BASS_LEVELS.find((l) => l.at === k + 1);
                    return (
                      <i key={k} className={`bb-pip${k < collected ? ' on' : ''}${level ? ' is-level' : ''}`}>
                        {level ? (
                          <em>
                            +{level.spins}
                            <small>x{level.mult}</small>
                          </em>
                        ) : null}
                      </i>
                    );
                  })}
                </span>
                <span className="bb-mult">x{fs.mult}</span>
              </div>
            ) : null}
            <div className="bb-stage">
              <div className="bb-reels-wrap">
                {reels}
                {bannerEl}
                {bbPeek && !fs && !bought ? (
                  <div className="bb-win-pop" aria-live="polite">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="bb-mascot" src={`${ART.bigbass}/bass.svg`} alt="" draggable={false} />
                    <strong>{tg('winner')}</strong>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="bb-dock">
              <div className="bb-money">
                <p>
                  <small>{tg('creditLabel')}</small>
                  <strong dir="ltr">{fmt(r.balance)}</strong>
                </p>
                <p>
                  <small>{t('bet')}</small>
                  <strong dir="ltr">{fmt(stakeMinor)}</strong>
                </p>
              </div>
              <p className="bb-dock-msg" aria-live="polite">
                {dockMsg}
              </p>
              <button
                type="button"
                className={autoLeft > 0 ? 'bb-auto is-on' : 'bb-auto'}
                disabled={autoLeft === 0 && !canAuto}
                onClick={() => (autoLeft > 0 ? (autoStop.current = true) : void startAuto(25))}
              >
                {autoLeft > 0 ? `${tg('autoStop')} · ${autoLeft}` : tg('auto')}
              </button>
              {buyCfg?.enabled ? (
                <button type="button" className="bb-buybtn" disabled={busy} onClick={() => setBuyOpen(true)}>
                  <b>{t('buy')}</b>
                  {buyCfg.discountPct > 0 ? <small>-{buyCfg.discountPct}%</small> : null}
                </button>
              ) : null}
              <div className="bb-spin-cluster">
                <button type="button" className="bb-bet-pm" disabled={busy || !ladder.some((v) => v < stakeMinor)} onClick={() => changeBet(-1)} aria-label={t('betDown')}>
                  −
                </button>
                <button type="button" className={busy ? 'bb-spin-round is-busy' : 'bb-spin-round'} disabled={!canSpin} onClick={() => void spinOnce()} aria-label={tg('spin')}>
                  <span aria-hidden="true">↻</span>
                </button>
                <button type="button" className="bb-bet-pm" disabled={busy || !ladder.some((v) => v > stakeMinor)} onClick={() => changeBet(1)} aria-label={t('betUp')}>
                  +
                </button>
              </div>
            </div>
            {errorEl}
          </div>
          {bigEl}
          {info}
          {buyOpen && buyCfg ? (
            <div className="rs-modal" role="dialog" aria-modal="true" aria-label={t('buyTitle')} onClick={(e) => e.target === e.currentTarget && (setBuyOpen(false), setBuyPick(null))}>
              <div className="rs-modal-card bb-buy">
                <button type="button" className="rs-close" onClick={() => (setBuyOpen(false), setBuyPick(null))} aria-label={t('close')}>
                  ×
                </button>
                <h3>🎣 {t('buyTitle')}</h3>
                <p className="rs-muted">{t('buyNote', { bet: fmt(stakeMinor) })}</p>
                {buyPick === null ? (
                  <div className="bb-packs">
                    {buyCfg.packs.map((n) => {
                      const full = stakeMinor * BigInt(n);
                      const price = (full * BigInt(100 - buyCfg.discountPct)) / 100n;
                      const short = price > BigInt(r.balance);
                      return (
                        <button key={n} type="button" className="bb-pack" disabled={short || stakeMinor <= 0n} onClick={() => setBuyPick(n)}>
                          {buyCfg.discountPct > 0 ? <em>-{buyCfg.discountPct}%</em> : null}
                          <b>{n}</b>
                          <span>{t('buySpins')}</span>
                          {buyCfg.discountPct > 0 ? <s dir="ltr">{fmt(full)}</s> : null}
                          <strong dir="ltr">{fmt(price)}</strong>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bb-confirm">
                    <p>
                      {t('buyConfirm', {
                        n: buyPick,
                        bet: fmt(stakeMinor),
                        price: fmt((stakeMinor * BigInt(buyPick) * BigInt(100 - buyCfg.discountPct)) / 100n),
                      })}
                    </p>
                    <div>
                      <button type="button" className="bb-buyyes" onClick={() => void buyPack(buyPick)}>
                        {t('buyYes')}
                      </button>
                      <button type="button" className="bb-auto" onClick={() => setBuyPick(null)}>
                        {t('buyNo')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
