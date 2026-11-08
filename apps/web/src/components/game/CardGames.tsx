'use client';

import { BACCARAT_BETS, DRAGON_TIGER_BETS, type BaccaratBet, type DragonTigerBet } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PlayingCard } from './Fx';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

interface Props {
  currency: CurrencyDTO;
  locale: string;
  initialBalanceMinor: string;
}

// The suit of a card is only decoration here (the games compare ranks); it is derived from the card's place so it never flickers.
const suitOf = (i: number, rank: number) => (i + rank) % 4;

export function DragonTigerGame({ currency, locale, initialBalanceMinor }: Props) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/dragontiger/play', currency, locale, initialBalanceMinor });
  const [bet, setBet] = useState<DragonTigerBet>('dragon');
  const d = r.result?.detail;
  const dragon = d ? Number(d.dragon) : 0;
  const tiger = d ? Number(d.tiger) : 0;
  const winner = d ? (dragon > tiger ? 'dragon' : tiger > dragon ? 'tiger' : 'tie') : null;
  return (
    <div className="wheel-wrap">
      <div className="felt" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '1rem' }}>
          <div>
            <p className="felt-title">{t('dtDragon')}</p>
            <div className="hand" key={`d-${r.result?.roundId ?? 'x'}`}>
              {d ? <PlayingCard rank={dragon} suit={suitOf(0, dragon)} win={winner === 'dragon'} /> : <PlayingCard rank={1} suit={0} hidden />}
            </div>
          </div>
          <div>
            <p className="felt-title">{t('dtTiger')}</p>
            <div className="hand" key={`t-${r.result?.roundId ?? 'x'}`}>
              {d ? <PlayingCard rank={tiger} suit={suitOf(1, tiger)} index={1} win={winner === 'tiger'} /> : <PlayingCard rank={1} suit={0} hidden />}
            </div>
          </div>
        </div>
        <p className="muted">{t('dtPays')}</p>
      </div>
      <StakeBox r={r} currency={currency} rtp={93.7}>
        <div className="admin-actions" style={{ marginTop: '0.8rem' }}>
          {DRAGON_TIGER_BETS.map((b) => (
            <button key={b} type="button" disabled={r.busy} className={bet === b ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setBet(b)}>
              {t(b === 'dragon' ? 'dtDragon' : b === 'tiger' ? 'dtTiger' : 'dtTie')}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void r.play({ bet })}>
          {r.busy ? t('playing') : t('deal')}
        </button>
      </StakeBox>
    </div>
  );
}

export function BaccaratGame({ currency, locale, initialBalanceMinor }: Props) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/baccarat/play', currency, locale, initialBalanceMinor });
  const [bet, setBet] = useState<BaccaratBet>('player');
  const d = r.result?.detail;
  const winner = d ? String(d.winner) : null;
  const hand = (key: 'player' | 'banker', total: string, offset: number) => (
    <div>
      <p className="felt-title">
        {t(key === 'player' ? 'bacPlayer' : 'bacBanker')} {d ? `· ${String(d[total])}` : ''}
      </p>
      <div className="hand" key={`${key}-${r.result?.roundId ?? 'x'}`}>
        {d
          ? (d[key] as number[]).map((c, i) => <PlayingCard key={i} rank={c} suit={suitOf(i + offset, c)} index={i * 2 + offset} win={winner === key} />)
          : [0, 1].map((i) => <PlayingCard key={i} rank={1} suit={0} hidden />)}
      </div>
    </div>
  );
  return (
    <div className="wheel-wrap">
      <div className="felt" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: '1rem' }}>
          {hand('player', 'playerTotal', 0)}
          {hand('banker', 'bankerTotal', 1)}
        </div>
        {winner ? <p className="felt-title" style={{ marginTop: '1rem' }}>{t(winner === 'player' ? 'bacPlayer' : winner === 'banker' ? 'bacBanker' : 'bacTie')} ✓</p> : null}
        <p className="muted">{t('bacPays')}</p>
      </div>
      <StakeBox r={r} currency={currency} rtp={98.8}>
        <div className="admin-actions" style={{ marginTop: '0.8rem' }}>
          {BACCARAT_BETS.map((b) => (
            <button key={b} type="button" disabled={r.busy} className={bet === b ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setBet(b)}>
              {t(b === 'player' ? 'bacPlayer' : b === 'banker' ? 'bacBanker' : 'bacTie')}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void r.play({ bet })}>
          {r.busy ? t('playing') : t('deal')}
        </button>
      </StakeBox>
    </div>
  );
}
