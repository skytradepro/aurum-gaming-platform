'use client';

import { GOLD_LINES, GOLD_REEL, type GoldSymbol, type GoldWin } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

export type GoldTheme = 'goldrush' | 'hotfruits' | 'ancientbook';
const THEMES: Record<GoldTheme, { name: string; glyph: Record<GoldSymbol, string>; bg: string }> = {
  goldrush: { name: 'GOLD RUSH', glyph: { lemon: '🍋', cherry: '🍒', plum: '🍇', bell: '🔔', diamond: '💎', seven: '7️⃣', crown: '👑', wild: '⭐' }, bg: 'linear-gradient(180deg, #2a0f45, #14091f)' },
  hotfruits: { name: 'HOT FRUITS', glyph: { lemon: '🍋', cherry: '🍒', plum: '🍇', bell: '🍊', diamond: '🍉', seven: '7️⃣', crown: '🔥', wild: '⭐' }, bg: 'linear-gradient(180deg, #7a1010, #2b0505)' },
  ancientbook: { name: 'BOOK OF SANDS', glyph: { lemon: '🪲', cherry: '🏺', plum: '🐍', bell: '🪶', diamond: '💎', seven: '📖', crown: '👁️', wild: '📜' }, bg: 'linear-gradient(180deg, #7a5a1a, #2b1d05)' },
};
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const randomSymbol = (): GoldSymbol => GOLD_REEL[Math.floor(Math.random() * GOLD_REEL.length)] ?? 'lemon';

export function GoldRushGame({ theme = 'goldrush', currency, locale, initialBalanceMinor }: { theme?: GoldTheme; currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const GLYPH = THEMES[theme].glyph;
  const t = useTranslations('games');
  const r = useRound({ endpoint: `/games/${theme}/play`, currency, locale, initialBalanceMinor });
  const [grid, setGrid] = useState<GoldSymbol[][]>(() => [
    ['cherry', 'bell', 'lemon'],
    ['lemon', 'seven', 'plum'],
    ['diamond', 'crown', 'cherry'],
    ['plum', 'wild', 'lemon'],
    ['bell', 'lemon', 'cherry'],
  ]);
  const [state, setState] = useState<('idle' | 'spin' | 'land')[]>(Array(5).fill('idle'));
  const [wins, setWins] = useState<GoldWin[]>([]);
  const live = useRef<boolean[]>(Array(5).fill(false));

  const lit = new Set<string>();
  for (const w of wins) GOLD_LINES[w.line]?.forEach((row, reel) => reel < w.count && lit.add(`${reel}:${row}`));

  async function spin() {
    setWins([]);
    await r.play({}, async (res) => {
      const final = res.detail.grid as GoldSymbol[][];
      live.current = Array(5).fill(true);
      setState(Array(5).fill('spin'));
      const timer = setInterval(() => setGrid((cur) => cur.map((col, i) => (live.current[i] ? [randomSymbol(), randomSymbol(), randomSymbol()] : col))), 90);
      for (let i = 0; i < 5; i += 1) {
        await wait(750 + i * 380);
        live.current[i] = false;
        setGrid((cur) => cur.map((col, k) => (k === i ? (final[i] ?? col) : col)));
        setState((cur) => cur.map((x, k) => (k === i ? 'land' : x)));
      }
      clearInterval(timer);
      await wait(300);
      setWins(res.detail.wins as GoldWin[]);
    });
  }

  return (
    <div className="wheel-wrap">
      <div className="vslot" style={{ background: THEMES[theme].bg }}>
        <div className="vslot-title">{THEMES[theme].name}</div>
        <div className="vslot-reels">
          {grid.map((col, reel) => (
            <div key={reel} className={`vreel${state[reel] === 'spin' ? ' spin' : state[reel] === 'land' ? ' land' : ''}`}>
              <div className="vreel-col">
                {col.map((s, row) => (
                  <div key={row} className={`vcell${lit.has(`${reel}:${row}`) ? ' win' : ''}`}>
                    {GLYPH[s]}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="vslot-win">{wins.length > 0 ? t('goldLines', { n: wins.length }) : ''}</div>
        <ul className="slots-paytable" style={{ justifyContent: 'center' }}>
          <li>{t('goldPaytable')}</li>
          <li>{GLYPH.crown} 70 · 350 · 1750</li>
          <li>{GLYPH.seven} 35 · 135 · 675</li>
          <li>{GLYPH.diamond} 18 · 55 · 275</li>
          <li>{GLYPH.bell} 9 · 27 · 110</li>
          <li>{GLYPH.plum} 5 · 13 · 45</li>
          <li>{GLYPH.cherry} 5 · 12 · 36</li>
          <li>{GLYPH.lemon} 4 · 10 · 30</li>
          <li>{GLYPH.wild} {t('goldWild')}</li>
        </ul>
      </div>
      <StakeBox r={r} currency={currency} rtp={94.48}>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void spin()}>
          {r.busy ? t('spinning') : t('spinSlots')}
        </button>
      </StakeBox>
    </div>
  );
}
