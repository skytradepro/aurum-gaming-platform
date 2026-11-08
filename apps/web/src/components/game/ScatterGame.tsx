'use client';

import { SCATTER_CELLS, SCATTER_PAYS_TENTHS, type ScatterWin } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

export type ScatterTheme = 'candy' | 'thunder' | 'ocean' | 'aztec';

/** Nine symbols per theme, lowest paying first. Only the pictures differ between themes; the maths is the same. */
const THEMES: Record<ScatterTheme, { glyphs: string[]; bg: string; border: string; name: string }> = {
  candy: { glyphs: ['🍬', '🍭', '🍫', '🍩', '🧁', '🍓', '🍇', '🍉', '💎'], bg: 'linear-gradient(180deg, #ff8ad8, #8f3fd1)', border: '#ffd1f3', name: 'SUGAR POP' },
  thunder: { glyphs: ['🏺', '🛡️', '🔱', '🦅', '⚡', '🏛️', '💍', '👑', '🌩️'], bg: 'linear-gradient(180deg, #2d4a8a, #0e1a3d)', border: '#9fc4ff', name: 'THUNDER GODS' },
  ocean: { glyphs: ['🐚', '🦀', '🐠', '🐡', '🐙', '🦈', '⚓', '🐋', '💰'], bg: 'linear-gradient(180deg, #0b7aa8, #052f4a)', border: '#7fe3ff', name: 'DEEP SEA GOLD' },
  aztec: { glyphs: ['🌿', '🥥', '🦜', '🐍', '🗿', '🏹', '🪶', '🌞', '💎'], bg: 'linear-gradient(180deg, #2f7d3a, #10331a)', border: '#f5c518', name: 'AZTEC GEMS' },
};
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export function ScatterGame({ theme, currency, locale, initialBalanceMinor }: { theme: ScatterTheme; currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const th = THEMES[theme];
  const r = useRound({ endpoint: `/games/${theme}/play`, currency, locale, initialBalanceMinor });
  const [cells, setCells] = useState<number[]>(() => Array.from({ length: SCATTER_CELLS }, (_, i) => (i * 7 + 3) % 9));
  const [round, setRound] = useState(0);
  const [wins, setWins] = useState<ScatterWin[] | null>(null);

  async function spin() {
    setWins(null);
    await r.play({}, async (res) => {
      setCells(res.detail.cells as number[]);
      setRound((n) => n + 1);
      await wait(900 + 30 * 40);
      setWins(res.detail.wins as ScatterWin[]);
    });
  }

  const winning = new Set((wins ?? []).map((w) => w.symbol));
  return (
    <div className="wheel-wrap">
      <div className="sgrid-wrap" style={{ ['--sg-bg' as string]: th.bg, ['--sg-border' as string]: th.border }}>
        <div className="vslot-title">{th.name}</div>
        <div className="sgrid" key={round}>
          {cells.map((c, i) => (
            <div key={i} className={`scell${round > 0 ? ' drop' : ''}${wins && winning.has(c) ? ' win' : wins && winning.size > 0 ? ' dim' : ''}`} style={{ ['--delay' as string]: `${(i % 6) * 0.06 + Math.floor(i / 6) * 0.03}s` }}>
              {th.glyphs[c]}
            </div>
          ))}
        </div>
        <div className="vslot-win">{wins && wins.length > 0 ? wins.map((w) => `${th.glyphs[w.symbol]}×${w.count}`).join('  ') : ''}</div>
        <p className="muted" style={{ textAlign: 'center', margin: 0 }}>{t('scatterRule')}</p>
        <div className="sgrid-legend">
          {th.glyphs.map((g, i) => (
            <span key={i}>
              {g} {(SCATTER_PAYS_TENTHS[i]?.[0] ?? 0) / 10}–{(SCATTER_PAYS_TENTHS[i]?.[2] ?? 0) / 10}×
            </span>
          ))}
        </div>
      </div>
      <StakeBox r={r} currency={currency} rtp={94.07}>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void spin()}>
          {r.busy ? t('spinning') : t('spinSlots')}
        </button>
      </StakeBox>
    </div>
  );
}
