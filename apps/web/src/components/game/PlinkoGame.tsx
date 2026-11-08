'use client';

import { PLINKO_RISKS, PLINKO_ROWS, PLINKO_TABLES, type PlinkoRisk } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

const GAP = 44;
const ROW_H = 38;
const WIDTH = GAP * (PLINKO_ROWS + 1) + GAP;

function pos(step: number, rights: number): { x: number; y: number } {
  return { x: WIDTH / 2 + (rights - step / 2) * GAP, y: 24 + step * ROW_H };
}

export function PlinkoGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/plinko/play', currency, locale, initialBalanceMinor });
  const [risk, setRisk] = useState<PlinkoRisk>('medium');
  const [ball, setBall] = useState<{ step: number; rights: number } | null>(null);
  const [landed, setLanded] = useState<number | null>(null);

  async function drop() {
    setLanded(null);
    setBall({ step: 0, rights: 0 });
    await r.play({ risk }, async (res) => {
      const path = res.detail.path as number[];
      let rights = 0;
      for (let i = 0; i < path.length; i += 1) {
        rights += path[i] ?? 0;
        setBall({ step: i + 1, rights });
        await new Promise((ok) => setTimeout(ok, 220));
      }
      setLanded(Number(res.detail.slot));
    });
  }

  const table = PLINKO_TABLES[risk];
  const height = 24 + PLINKO_ROWS * ROW_H + 50;
  const ballAt = ball ? pos(ball.step, ball.rights) : null;

  return (
    <div className="wheel-wrap">
      <div className="dice-stage card" style={{ textAlign: 'center' }}>
        <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-label="Plinko" style={{ maxWidth: '100%', height: 'auto' }}>
          {Array.from({ length: PLINKO_ROWS }, (_, row) =>
            Array.from({ length: row + 1 }, (_, k) => {
              const p = pos(row, k);
              return <circle key={`${row}-${k}`} cx={p.x} cy={p.y + ROW_H / 2} r={4} fill="#d4a017" opacity={0.7} />;
            }),
          )}
          {table.map((m, k) => {
            const p = pos(PLINKO_ROWS, k);
            return (
              <g key={k}>
                <rect x={p.x - GAP / 2 + 3} y={p.y + 4} width={GAP - 6} height={26} rx={5} fill={landed === k ? '#f5c518' : '#2a2140'} />
                <text x={p.x} y={p.y + 22} textAnchor="middle" fontSize="12" fill={landed === k ? '#000' : '#fff'}>
                  {m / 10}×
                </text>
              </g>
            );
          })}
          {ballAt ? <circle cx={ballAt.x} cy={ballAt.y} r={8} fill="#f5c518" stroke="#fff" strokeWidth={1.5} /> : null}
        </svg>
      </div>
      <StakeBox r={r} currency={currency} rtp={93.98}>
        <div className="admin-actions" style={{ marginTop: '0.8rem' }}>
          {PLINKO_RISKS.map((k) => (
            <button key={k} type="button" disabled={r.busy} className={risk === k ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setRisk(k)}>
              {t(k === 'low' ? 'riskLow' : k === 'medium' ? 'riskMedium' : 'riskHigh')}
            </button>
          ))}
        </div>
        <p className="muted">
          {t('plinkoPays')} {table.map((m) => `${m / 10}×`).join(' · ')}
        </p>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void drop()}>
          {r.busy ? t('dropping') : t('drop')}
        </button>
      </StakeBox>
    </div>
  );
}
