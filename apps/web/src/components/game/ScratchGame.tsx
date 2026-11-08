'use client';

import { SCRATCH_PRIZES, type ScratchSymbol } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

const GLYPH: Record<ScratchSymbol, string> = { cherry: '🍒', lemon: '🍋', bell: '🔔', star: '⭐', diamond: '💎', crown: '👑' };
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export function ScratchGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/scratch/play', currency, locale, initialBalanceMinor });
  const [grid, setGrid] = useState<ScratchSymbol[]>([]);
  const [open, setOpen] = useState<boolean[]>(Array(9).fill(false));
  const [winSymbol, setWinSymbol] = useState<ScratchSymbol | null>(null);

  async function play() {
    setOpen(Array(9).fill(false));
    setWinSymbol(null);
    setGrid([]);
    await r.play({}, async (res) => {
      setGrid(res.detail.grid as ScratchSymbol[]);
      await wait(350);
      for (let i = 0; i < 9; i += 1) {
        setOpen((cur) => cur.map((x, k) => (k === i ? true : x)));
        await wait(260);
      }
      setWinSymbol((res.detail.symbol as ScratchSymbol | null) ?? null);
    });
  }

  return (
    <div className="wheel-wrap">
      <div className="dice-stage card">
        <div className="scratch">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className={`scratch-cell${open[i] ? ' open' : ''}${winSymbol && grid[i] === winSymbol ? ' hit' : ''}`}>
              <span className="sym">{grid[i] ? GLYPH[grid[i] as ScratchSymbol] : ''}</span>
              <span className="cover">✦</span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ textAlign: 'center' }}>{t('scratchRule')}</p>
        <ul className="slots-paytable" style={{ justifyContent: 'center' }}>
          {SCRATCH_PRIZES.map((p) => (
            <li key={p.symbol}>
              {GLYPH[p.symbol]}×3 — {p.x}×
            </li>
          ))}
        </ul>
      </div>
      <StakeBox r={r} currency={currency} rtp={94}>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void play()}>
          {r.busy ? t('scratching') : t('scratchBuy')}
        </button>
      </StakeBox>
    </div>
  );
}
