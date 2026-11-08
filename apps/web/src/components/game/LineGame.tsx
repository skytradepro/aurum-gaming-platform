'use client';

import '@/styles/candy-burst.css';
import '@/styles/line-game.css';
import type { GameId, LineConfig, LineWin } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StakeBox } from './StakeBox';
import { CandySound, useCountUp } from './TumbleGame';
import { useRound, type RoundResponse } from './useRound';

/** What makes one line slot different from another: maths, pictures, texts and colours. */
export interface LineTheme {
  /** Game id: the API endpoint is /games/<id>/play. */
  id: GameId;
  /** next-intl namespace with the game's own texts (board name, symbol names, rules). */
  ns: string;
  title: string;
  config: LineConfig;
  className: string;
  /** Folder in public/media/games and the symbol file names, lowest paying first. */
  folder: string;
  files: readonly string[];
}

type Phase = 'idle' | 'spin' | 'show';
const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const LINE_COLORS = ['#ffd34d', '#ff5d8f', '#4ade80', '#38bdf8', '#c084fc', '#fb923c', '#f87171', '#a3e635', '#22d3ee', '#f472b6'];

/** A calm first board (no wins) shown before the first spin. */
function startBoard(cfg: LineConfig): number[] {
  const regular = cfg.weights.map((_, i) => i).filter((i) => i !== cfg.wild && i !== cfg.scatter?.symbol);
  return Array.from({ length: cfg.reels * cfg.rows }, (_, i) => regular[((i % cfg.reels) * 5 + Math.floor(i / cfg.reels) * 3 + (((i % cfg.reels) * Math.floor(i / cfg.reels)) % 3)) % regular.length] ?? 0);
}

export function LineGame({ theme, currency, locale, initialBalanceMinor }: { theme: LineTheme; currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations(theme.ns);
  const tl = useTranslations('lineSlot');
  const cfg = theme.config;
  const START = useMemo(() => startBoard(cfg), [cfg]);
  const r = useRound({ endpoint: `/games/${theme.id}/play`, currency, locale, initialBalanceMinor });
  const rRef = useRef(r);
  rRef.current = r;

  const sound = useRef(new CandySound());
  const [soundOn, setSoundOn] = useState(true);
  const [turbo, setTurbo] = useState(false);
  const turboRef = useRef(false);
  const [grid, setGrid] = useState<number[]>(START);
  const [phase, setPhase] = useState<Phase>('idle');
  const [stopped, setStopped] = useState(cfg.reels);
  const [strips, setStrips] = useState<number[][]>([]);
  const [wins, setWins] = useState<LineWin[]>([]);
  const [focus, setFocus] = useState<number>(-1);
  const [big, setBig] = useState<{ level: 'big' | 'mega' | 'epic'; amount: bigint } | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [lastRes, setLastRes] = useState<RoundResponse | null>(null);
  const [autoLeft, setAutoLeft] = useState(0);
  const autoStop = useRef(false);
  const skipBig = useRef<(() => void) | null>(null);
  const cycle = useRef(0);
  const total = useCountUp();
  const bigCount = useCountUp();

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
      /* storage not available */
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

  const sym = (i: number, title?: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="lg-sym" src={`/media/games/${theme.folder}/${theme.files[i] ?? theme.files[0]}.svg`} alt={title ?? ''} draggable={false} />
  );
  const glyphName = (i: number) => t(`sym.${i}` as never);
  const winMinor = (res: RoundResponse, milli: number) => (BigInt(res.stake.amountMinor) * BigInt(milli)) / 1000n;

  /** Spins the reels, stops them one by one, then shows the server's result. */
  async function present(res: RoundResponse, started: number) {
    const detail = res.detail as { grid: number[]; wins: LineWin[]; scatter: LineWin | null };
    await wait(Math.max(0, ms(1200) - (performance.now() - started)));
    setGrid(detail.grid);
    for (let reel = 0; reel < cfg.reels; reel += 1) {
      setStopped(reel + 1);
      sound.current.land(reel);
      await wait(ms(190));
    }
    await wait(ms(220));
    const all = [...detail.wins, ...(detail.scatter ? [detail.scatter] : [])];
    setLastRes(res);
    const payout = BigInt(res.payout.amountMinor);
    setPhase('show');
    if (all.length === 0) {
      sound.current.lose();
      setPhase('idle');
      return;
    }
    setWins(all);
    setFocus(-1);
    sound.current.win(Math.min(all.length, 6));
    await total.run(0n, payout, ms(Math.min(1600, 500 + all.length * 160)));
    const stake = BigInt(res.stake.amountMinor);
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
      await wait(ms(skipped ? 400 : 1000));
      skipBig.current = null;
      setBig(null);
    }
    setPhase('idle');
    // keep showing every win in turn until the next spin
    const id = (cycle.current += 1);
    void (async () => {
      for (let k = 0; cycle.current === id; k = (k + 1) % all.length) {
        if (all.length < 2 && k > 0) break;
        setFocus(k);
        await wait(1300);
      }
    })();
  }

  async function spinOnce(): Promise<boolean> {
    const round = rRef.current;
    if (round.busy) return false;
    cycle.current += 1;
    sound.current.spin();
    setWins([]);
    setFocus(-1);
    total.setValue(0n);
    setStrips(Array.from({ length: cfg.reels }, () => Array.from({ length: 12 }, () => Math.floor(Math.random() * cfg.weights.length))));
    setStopped(0);
    setPhase('spin');
    const started = performance.now();
    let settled = false;
    await round.play({}, async (res) => {
      settled = true;
      await present(res, started);
    });
    if (!settled) {
      setStopped(cfg.reels);
      setPhase('idle');
    }
    return settled;
  }

  async function startAuto(n: number) {
    autoStop.current = false;
    for (let i = n; i > 0; i -= 1) {
      setAutoLeft(i);
      const ok = await spinOnce();
      if (!ok || autoStop.current) break;
      await wait(ms(600));
    }
    setAutoLeft(0);
  }

  const busy = r.busy || phase !== 'idle' || autoLeft > 0;
  const stakeMinorNow = (() => {
    try {
      const [w = '0', f = ''] = r.stake.trim().split('.');
      return BigInt(w || '0') * 10n ** BigInt(currency.decimals) + BigInt(f.padEnd(currency.decimals, '0').slice(0, currency.decimals) || '0');
    } catch {
      return 0n;
    }
  })();

  const shown = focus >= 0 ? wins.slice(focus, focus + 1) : wins;
  const lit = new Set(shown.flatMap((w) => w.cells));
  const focusWin = focus >= 0 ? wins[focus] : undefined;
  const lines = cfg.lines ?? [];
  const res = lastRes;
  const stepText = (() => {
    if (!focusWin || !res) return null;
    const amount = r.fmt(winMinor(res, focusWin.milli));
    if (focusWin.symbol === cfg.scatter?.symbol) return `${tl('scatterWin', { count: focusWin.count })} = ${amount}`;
    if (focusWin.line >= 0) return `${tl('lineWin', { line: focusWin.line + 1 })}: ${glyphName(focusWin.symbol)} ×${focusWin.count} = ${amount}`;
    return `${glyphName(focusWin.symbol)} ×${focusWin.count} · ${tl('waysWin', { ways: focusWin.ways })} = ${amount}`;
  })();
  const pay = (milli: number) => `${Math.round(milli / 10) / 100}×`;

  return (
    <div className={`cb-wrap lg-wrap ${theme.className}`}>
      <section className={`cb-stage lg-stage lg-phase-${phase}`} aria-label={theme.title}>
        <div className="cb-top">
          <div className="cb-mult lg-badge">
            <small>{cfg.mode === 'ways' ? tl('ways') : tl('lines')}</small>
            <strong>{cfg.mode === 'ways' ? cfg.rows ** cfg.reels : lines.length}</strong>
          </div>
          <div className="cb-tools">
            <button type="button" className={soundOn ? 'cb-tool is-on' : 'cb-tool'} onClick={toggleSound} aria-pressed={soundOn} aria-label={tl('sound')} title={tl('sound')}>
              {soundOn ? '🔊' : '🔇'}
            </button>
            <button type="button" className={turbo ? 'cb-tool is-on' : 'cb-tool'} onClick={toggleTurbo} aria-pressed={turbo} aria-label={tl('turbo')} title={tl('turbo')}>
              ⚡
            </button>
            <button type="button" className="cb-tool" onClick={() => setShowInfo(true)} aria-label={tl('info')} title={tl('info')}>
              i
            </button>
          </div>
        </div>

        <div className="cb-board lg-board">
          <div className="lg-reels" role="grid" aria-label={t('board')} style={{ ['--reels' as string]: cfg.reels, ['--rows' as string]: cfg.rows }}>
            {Array.from({ length: cfg.reels }, (_, reel) => {
              const spinning = phase === 'spin' && reel >= stopped;
              return (
                <div key={reel} className={spinning ? 'lg-reel is-spinning' : reel < stopped && phase === 'spin' ? 'lg-reel is-landed' : 'lg-reel'}>
                  {spinning ? (
                    <div className="lg-strip" style={{ ['--rd' as string]: `${-reel * 0.06}s` }} aria-hidden="true">
                      {[...(strips[reel] ?? []), ...(strips[reel] ?? [])].map((s, k) => (
                        <div key={k} className="lg-cell">
                          {sym(s)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    Array.from({ length: cfg.rows }, (_, row) => {
                      const i = row * cfg.reels + reel;
                      const s = grid[i] ?? 0;
                      const isWin = lit.has(i);
                      const cls = ['lg-cell', isWin ? 'is-win' : '', wins.length > 0 && !isWin ? 'is-dim' : '', s === cfg.wild ? 'is-wild' : '', s === cfg.scatter?.symbol ? 'is-scatter-sym' : ''].join(' ');
                      return (
                        <div key={row} className={cls} role="gridcell">
                          {sym(s, glyphName(s))}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
            {wins.length > 0 && cfg.mode === 'lines' ? (
              <svg className="lg-lines" viewBox={`0 0 ${cfg.reels * 100} ${cfg.rows * 100}`} preserveAspectRatio="none" aria-hidden="true">
                {shown
                  .filter((w) => w.line >= 0)
                  .map((w) => (
                    <polyline
                      key={w.line}
                      points={(lines[w.line] ?? []).map((row, reel) => `${reel * 100 + 50},${row * 100 + 50}`).join(' ')}
                      stroke={LINE_COLORS[w.line % LINE_COLORS.length]}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
              </svg>
            ) : null}
          </div>
        </div>

        <div className="cb-bar">
          <div className="cb-win">
            <small>{tl('win')}</small>
            <strong key={total.value > 0n ? 'w' : 'z'} className={total.value > 0n ? 'is-up' : ''}>
              {r.fmt(total.value)}
            </strong>
          </div>
          <button type="button" className="cb-spin-mini" disabled={busy} onClick={() => void spinOnce()} aria-label={tl('spin')}>
            <span aria-hidden="true">⟳</span>
          </button>
          <div className="cb-step" aria-live="polite">
            {stepText ?? (phase === 'idle' && r.result ? (BigInt(r.result.payout.amountMinor) > 0n ? tl('lastWin', { amount: r.fmt(r.result.payout.amountMinor) }) : t('noWin')) : cfg.mode === 'ways' ? tl('ruleWaysShort') : tl('ruleLinesShort'))}
          </div>
        </div>

        {big ? (
          <button type="button" className={`cb-big is-${big.level}`} onClick={() => skipBig.current?.()} aria-label={tl('tapToSkip')}>
            <span className="cb-confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, k) => (
                <i key={k} style={{ ['--x' as string]: `${(k * 37) % 100}%`, ['--dl' as string]: `${(k % 6) * 0.18}s` }}>
                  {sym(k % cfg.weights.length)}
                </i>
              ))}
            </span>
            <span className="cb-big-title">{tl(big.level)}</span>
            <span className="cb-big-amount">{r.fmt(bigCount.value)}</span>
            <span className="cb-big-skip">{tl('tapToSkip')}</span>
          </button>
        ) : null}

        {showInfo ? (
          <div className="cb-info" role="dialog" aria-modal="true" aria-label={t('paytable')}>
            <div className="cb-info-card">
              <h3>{t('paytable')}</h3>
              <p className="cb-info-note">{cfg.mode === 'ways' ? tl('payNoteWays') : tl('payNoteLines')}</p>
              <div className="cb-pays">
                {cfg.wild !== undefined ? (
                  <div className="cb-pay is-special">
                    {sym(cfg.wild, glyphName(cfg.wild))}
                    <div>
                      <strong>WILD</strong>
                      <span>{tl('ruleWild')}</span>
                      {(cfg.pays[cfg.wild] ?? []).some((v) => v > 0) ? (cfg.pays[cfg.wild] ?? []).slice(0, cfg.reels - 2).map((v, k) => <span key={k}>{k + 3}: {pay(v)}</span>) : null}
                    </div>
                  </div>
                ) : null}
                {cfg.scatter ? (
                  <div className="cb-pay is-special">
                    {sym(cfg.scatter.symbol, glyphName(cfg.scatter.symbol))}
                    <div>
                      <strong>SCATTER</strong>
                      {cfg.scatter.pays.map((sp) => (
                        <span key={sp.min}>
                          {sp.min}: {pay(sp.milli)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {cfg.pays
                  .map((p, i) =>
                    i === cfg.wild || i === cfg.scatter?.symbol ? null : (
                      <div key={i} className="cb-pay">
                        {sym(i, glyphName(i))}
                        <div>
                          {p.slice(0, cfg.reels - 2).map((v, k) => (
                            <span key={k}>
                              {k + 3}: {pay(v)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ),
                  )
                  .reverse()}
              </div>
              {cfg.mode === 'lines' ? (
                <>
                  <h4 className="lg-info-h">{tl('paylines')}</h4>
                  <div className="lg-mini-lines">
                    {lines.map((l, n) => (
                      <div key={n} className="lg-mini" title={tl('lineWin', { line: n + 1 })}>
                        <small>{n + 1}</small>
                        <div className="lg-mini-grid" style={{ ['--reels' as string]: cfg.reels, ['--rows' as string]: cfg.rows }}>
                          {Array.from({ length: cfg.reels * cfg.rows }, (_, i) => (
                            <i key={i} className={l[i % cfg.reels] === Math.floor(i / cfg.reels) ? 'on' : ''} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
              <ul className="cb-rules">
                <li>{cfg.mode === 'ways' ? tl('ruleWays', { reels: cfg.reels, rows: cfg.rows, ways: cfg.rows ** cfg.reels }) : tl('ruleLines', { reels: cfg.reels, rows: cfg.rows, lines: lines.length })}</li>
                <li>{tl('ruleWild')}</li>
                {cfg.scatter ? <li>{tl('ruleScatter')}</li> : null}
                <li>{tl('ruleMax', { max: cfg.capX })}</li>
                <li>{tl('ruleRtp', { rtp: cfg.rtp })}</li>
                <li>{tl('ruleServer')}</li>
              </ul>
              <button type="button" className="btn btn-gold" onClick={() => setShowInfo(false)}>
                {tl('close')}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <div className="cb-side">
        <StakeBox r={r} currency={currency} rtp={cfg.rtp}>
          <div className="cb-controls">
            <button type="button" className="cb-spin" disabled={busy} onClick={() => void spinOnce()} aria-label={tl('spin')}>
              <span className="cb-spin-icon" aria-hidden="true">⟳</span>
              <span>{tl('spin')}</span>
            </button>
            {autoLeft > 0 ? (
              <button type="button" className="btn btn-dark cb-auto" onClick={() => (autoStop.current = true)}>
                {tl('stop')} ({autoLeft})
              </button>
            ) : (
              <div className="cb-auto-row">
                {[10, 25].map((n) => (
                  <button key={n} type="button" className="btn btn-dark btn-sm" disabled={busy || stakeMinorNow <= 0n || stakeMinorNow > BigInt(r.balance)} onClick={() => void startAuto(n)}>
                    {tl('auto')} {n}
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
