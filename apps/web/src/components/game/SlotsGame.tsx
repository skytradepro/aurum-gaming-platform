'use client';

import { SLOTS_RTP_PERCENT, SLOT_REEL, type SlotSymbol } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

const GLYPH: Record<SlotSymbol, string> = { '7': '7', diamond: '💎', bell: '🔔', cherry: '🍒', lemon: '🍋' };
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const random = (): SlotSymbol => SLOT_REEL[Math.floor(Math.random() * SLOT_REEL.length)] ?? 'lemon';

export function SlotsGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/slots/play', currency, locale, initialBalanceMinor });
  const [reels, setReels] = useState<SlotSymbol[]>(['7', 'diamond', 'bell']);
  const [spinning, setSpinning] = useState<boolean[]>([false, false, false]);
  const live = useRef<boolean[]>([false, false, false]);

  async function spin() {
    await r.play({}, async (res) => {
      const final = (res.detail.symbols as SlotSymbol[]) ?? ['lemon', 'lemon', 'lemon'];
      live.current = [true, true, true];
      setSpinning([true, true, true]);
      const timer = setInterval(() => setReels((cur) => cur.map((s, i) => (live.current[i] ? random() : s))), 80);
      for (let i = 0; i < 3; i++) {
        await wait(900 + i * 500);
        live.current[i] = false;
        setSpinning((cur) => cur.map((x, k) => (k === i ? false : x)));
        setReels((cur) => cur.map((s, k) => (k === i ? (final[i] ?? s) : s)));
      }
      clearInterval(timer);
    });
  }

  return (
    <div className="wheel-wrap">
      <div className="slots-stage card">
        <div className="slots-reels">
          {reels.map((s, i) => (
            <div key={i} className={spinning[i] ? 'slots-reel slots-reel-spin' : 'slots-reel'}>
              {GLYPH[s]}
            </div>
          ))}
        </div>
        <ul className="slots-paytable">
          <li>
            {GLYPH['7']}×3 — 175×
          </li>
          <li>
            {GLYPH.diamond}×3 — 25×
          </li>
          <li>
            {GLYPH.bell}×3 — 10×
          </li>
          <li>
            {GLYPH.cherry}×3 — 5×
          </li>
          <li>
            {GLYPH.lemon}×3 — 2×
          </li>
          <li>{t('anyTwo')}</li>
          <li>
            {GLYPH.cherry} — 0.5×
          </li>
        </ul>
      </div>
      <StakeBox r={r} currency={currency} rtp={SLOTS_RTP_PERCENT}>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void spin()}>
          {r.busy ? t('spinning') : t('spinSlots')}
        </button>
      </StakeBox>
    </div>
  );
}
