'use client';

import { RAPTOR_MAX_JUMPS, raptorPayout } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export function RaptorGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/raptor/play', currency, locale, initialBalanceMinor });
  const [jumps, setJumps] = useState(5);
  const [pos, setPos] = useState(0); // 0 = start, 1..jumps = at obstacle i, jumps+1 = finish
  const [mode, setMode] = useState<'idle' | 'jump' | 'fall'>('idle');
  const [shownJumps, setShownJumps] = useState(5);

  const pay = raptorPayout(jumps);
  const mult = pay ? Math.floor((pay.num * 100) / pay.den) / 100 : 0;
  const slot = (i: number, n: number) => 6 + (88 * i) / (n + 1);

  async function run() {
    setPos(0);
    setMode('idle');
    setShownJumps(jumps);
    await r.play({ jumps }, async (res) => {
      const cleared = Number(res.detail.cleared);
      for (let i = 1; i <= jumps; i += 1) {
        setPos(i);
        await wait(480);
        if (i > cleared) {
          setMode('fall');
          await wait(650);
          return;
        }
        setMode('jump');
        await wait(450);
        setMode('idle');
      }
      setPos(jumps + 1);
      await wait(500);
    });
  }

  const n = shownJumps;
  return (
    <div className="wheel-wrap">
      <div className="run">
        <div className="run-ground" />
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="run-obstacle" style={{ left: `${slot(i + 1, n)}%` }}>
            🌵
          </span>
        ))}
        <span className="run-flag">🏁</span>
        <span className={`run-dino${mode === 'jump' ? ' jump' : mode === 'fall' ? ' fall' : ''}`} style={{ left: `${pos === 0 ? 4 : pos > n ? 94 : slot(pos, n) - (mode === 'fall' ? 0 : 0)}%` }}>
          🦖
        </span>
      </div>
      <StakeBox r={r} currency={currency} rtp={94}>
        <div className="field">
          <label>
            {t('raptorJumps')}: <strong>{jumps}</strong> · {t('multiplier')}: <strong>{mult}×</strong>
          </label>
          <input type="range" min={1} max={RAPTOR_MAX_JUMPS} value={jumps} disabled={r.busy} onChange={(e) => setJumps(Number(e.target.value))} />
        </div>
        <p className="muted">{t('raptorRule')}</p>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void run()}>
          {r.busy ? t('running') : t('raptorStart')}
        </button>
      </StakeBox>
    </div>
  );
}
