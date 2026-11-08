'use client';

import { ANDAR_BAHAR_BETS, ANDAR_BAHAR_RTP, WAR_RTP, type AndarBaharBet } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { DeckCard, PlayingCard } from './Fx';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

interface Props {
  currency: CurrencyDTO;
  locale: string;
  initialBalanceMinor: string;
}

export function AndarBaharGame({ currency, locale, initialBalanceMinor }: Props) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/andarbahar/play', currency, locale, initialBalanceMinor });
  const [bet, setBet] = useState<AndarBaharBet>('andar');
  const d = r.result?.detail;
  const andar = d ? (d.andar as number[]) : [];
  const bahar = d ? (d.bahar as number[]) : [];
  const winner = d ? (d.winner as AndarBaharBet) : null;
  const row = (side: AndarBaharBet, cards: number[]) => (
    <div style={{ marginTop: '0.6rem' }}>
      <p className="felt-title" style={{ color: winner === side ? '#ffd54a' : undefined }}>
        {t(side === 'andar' ? 'abAndar' : 'abBahar')} {d ? `(${cards.length})` : ''}
      </p>
      <div className="hand tight" key={`${side}-${r.result?.roundId ?? 'x'}`}>
        {d ? cards.map((c, i) => <DeckCard key={c} id={c} index={Math.min(i, 12)} win={winner === side && i === cards.length - 1} />) : <PlayingCard rank={1} suit={0} hidden />}
      </div>
    </div>
  );
  return (
    <div className="wheel-wrap">
      <div className="felt" style={{ textAlign: 'center' }}>
        <p className="felt-title">{t('abJoker')}</p>
        <div className="hand" key={`j-${r.result?.roundId ?? 'x'}`}>
          {d ? <DeckCard id={Number(d.joker)} /> : <PlayingCard rank={1} suit={0} hidden />}
        </div>
        {row('andar', andar)}
        {row('bahar', bahar)}
        <p className="muted">{t('abPays')}</p>
      </div>
      <StakeBox r={r} currency={currency} rtp={ANDAR_BAHAR_RTP[bet]}>
        <div className="admin-actions" style={{ marginTop: '0.8rem' }}>
          {ANDAR_BAHAR_BETS.map((b) => (
            <button key={b} type="button" disabled={r.busy} className={bet === b ? 'btn btn-gold' : 'btn btn-ghost'} onClick={() => setBet(b)}>
              {t(b === 'andar' ? 'abAndar' : 'abBahar')}
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

export function CasinoWarGame({ currency, locale, initialBalanceMinor }: Props) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/casinowar/play', currency, locale, initialBalanceMinor });
  const d = r.result?.detail;
  const outcome = d ? String(d.outcome) : null;
  return (
    <div className="wheel-wrap">
      <div className="felt" style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'space-around', gap: '1rem' }}>
          <div>
            <p className="felt-title">{t('warPlayer')}</p>
            <div className="hand" key={`p-${r.result?.roundId ?? 'x'}`}>
              {d ? <DeckCard id={Number(d.player)} win={outcome === 'win'} /> : <PlayingCard rank={1} suit={0} hidden />}
            </div>
          </div>
          <div>
            <p className="felt-title">{t('warDealer')}</p>
            <div className="hand" key={`d-${r.result?.roundId ?? 'x'}`}>
              {d ? <DeckCard id={Number(d.dealer)} index={1} win={outcome === 'lose'} /> : <PlayingCard rank={1} suit={0} hidden />}
            </div>
          </div>
        </div>
        <p className="muted">{t('warPays')}</p>
      </div>
      <StakeBox r={r} currency={currency} rtp={WAR_RTP}>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void r.play({})}>
          {r.busy ? t('playing') : t('deal')}
        </button>
      </StakeBox>
    </div>
  );
}
