'use client';

import { CRASH_RTP_PERCENT, CRASH_TARGET_MAX_X100, CRASH_TARGET_MIN_X100 } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

export function CrashGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/crash/play', currency, locale, initialBalanceMinor });
  const [targetText, setTargetText] = useState('2.00');
  const [shown, setShown] = useState<number | null>(null);
  const [won, setWon] = useState<boolean | null>(null);

  const targetX100 = Math.round(Number(targetText.replace(',', '.')) * 100);
  const valid = Number.isFinite(targetX100) && targetX100 >= CRASH_TARGET_MIN_X100 && targetX100 <= CRASH_TARGET_MAX_X100;
  const chance = valid ? (CRASH_RTP_PERCENT / (targetX100 / 100)).toFixed(2) : '-';

  async function launch() {
    if (!valid) return;
    setWon(null);
    setShown(1);
    await r.play({ targetX100 }, async (res) => {
      const crash = Number(res.detail.crashPoint);
      // The picture climbs to the crash point the server already decided; it never influences the result.
      const steps = 40;
      for (let i = 1; i <= steps; i += 1) {
        setShown(1 + ((crash - 1) * i) / steps);
        await new Promise((ok) => setTimeout(ok, 35));
      }
      setShown(crash);
      setWon(res.win);
    });
  }

  return (
    <div className="wheel-wrap">
      <div className="dice-stage card">
        <div className={won === null ? 'dice-number' : won ? 'dice-number dice-win' : 'dice-number dice-lose'}>{shown === null ? '1.00×' : `${shown.toFixed(2)}×`}</div>
        <p className="muted">{won === null ? '' : `${t('crashPoint')} ${shown?.toFixed(2)}×`}</p>
      </div>
      <StakeBox r={r} currency={currency} rtp={CRASH_RTP_PERCENT}>
        <div className="field" style={{ marginTop: '0.8rem' }}>
          <label>{t('cashOutAt')} (×)</label>
          <input inputMode="decimal" value={targetText} disabled={r.busy} onChange={(e) => setTargetText(e.target.value)} />
          <small className="muted">
            {CRASH_TARGET_MIN_X100 / 100}× – {CRASH_TARGET_MAX_X100 / 100}× · {t('winChance')}: {chance}%
          </small>
        </div>
        <p className="muted">{t('crashPays')}</p>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy || !valid} onClick={() => void launch()}>
          {r.busy ? t('launching') : t('launch')}
        </button>
      </StakeBox>
    </div>
  );
}
