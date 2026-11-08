'use client';

import { SICBO_BETS, sicBoValueOk, type SicBoBet } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Die } from './Fx';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const BET_KEY: Record<SicBoBet, string> = { big: 'sbBig', small: 'sbSmall', single: 'sbSingle', total: 'sbTotal', anytriple: 'sbAnyTriple', triple: 'sbTriple' };

export function SicBoGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/sicbo/play', currency, locale, initialBalanceMinor });
  const [bet, setBet] = useState<SicBoBet>('big');
  const [value, setValue] = useState(1);
  const [dice, setDice] = useState<number[]>([1, 2, 3]);
  const [rolling, setRolling] = useState(false);
  const needsValue = bet === 'single' || bet === 'triple' || bet === 'total';
  const valueOk = sicBoValueOk(bet, needsValue ? value : undefined);
  const matching = !rolling && r.result ? (dice.map((d) => needsValue && (bet === 'single' || bet === 'triple') && d === value) as boolean[]) : [false, false, false];

  function pick(b: SicBoBet) {
    setBet(b);
    if (b === 'total') setValue(10);
    else if (b === 'single' || b === 'triple') setValue(1);
  }

  async function roll() {
    if (!valueOk) return;
    setRolling(true);
    const timer = setInterval(() => setDice([1, 2, 3].map(() => 1 + Math.floor(Math.random() * 6))), 110);
    try {
      await r.play(needsValue ? { bet, value } : { bet }, async (res) => {
        await wait(1300);
        clearInterval(timer);
        setDice(res.detail.dice as number[]);
      });
    } finally {
      clearInterval(timer);
      setRolling(false);
    }
  }

  const total = dice.reduce((a, b) => a + b, 0);
  return (
    <div className="wheel-wrap">
      <div className="felt" style={{ textAlign: 'center' }}>
        <p className="felt-title">{t('sbTable')}</p>
        <div className="hand">
          {dice.map((d, i) => (
            <Die key={i} value={d} rolling={rolling} hit={matching[i]} />
          ))}
        </div>
        <p style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0.6rem 0 0' }}>{rolling ? '…' : r.result ? total : '--'}</p>
        <p className="muted">{t('sbPays')}</p>
      </div>
      <StakeBox r={r} currency={currency} rtp={92}>
        <div className="admin-actions" style={{ marginTop: '0.8rem', flexWrap: 'wrap' }}>
          {SICBO_BETS.map((b) => (
            <button key={b} type="button" disabled={r.busy} className={bet === b ? 'btn btn-gold btn-sm' : 'btn btn-ghost btn-sm'} onClick={() => pick(b)}>
              {t(BET_KEY[b] as never)}
            </button>
          ))}
        </div>
        {needsValue ? (
          <div className="field">
            <label>
              {t(bet === 'total' ? 'sbPickTotal' : 'sbPickNumber')}: <strong>{value}</strong>
            </label>
            <input type="range" min={bet === 'total' ? 4 : 1} max={bet === 'total' ? 17 : 6} value={value} disabled={r.busy} onChange={(e) => setValue(Number(e.target.value))} />
          </div>
        ) : null}
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy || !valueOk} onClick={() => void roll()}>
          {r.busy ? t('rolling') : t('roll')}
        </button>
      </StakeBox>
    </div>
  );
}
