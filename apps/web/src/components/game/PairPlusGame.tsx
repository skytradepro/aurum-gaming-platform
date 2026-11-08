'use client';

import { PAIR_PLUS_PAYS } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { DeckCard } from './Fx';
import { StakeBox } from './StakeBox';
import { useRound } from './useRound';

const HANDS = ['straightFlush', 'threeKind', 'straight', 'flush', 'pair'] as const;

export function PairPlusGame({ currency, locale, initialBalanceMinor }: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('games');
  const r = useRound({ endpoint: '/games/pairplus/play', currency, locale, initialBalanceMinor });
  const d = r.result?.detail;
  const cards = d ? (d.cards as number[]) : [];
  const hand = d ? String(d.hand) : null;
  return (
    <div className="wheel-wrap">
      <div className="felt" style={{ textAlign: 'center' }}>
        <p className="felt-title">{t('ppTable')}</p>
        <div className="hand" key={r.result?.roundId ?? 'x'}>
          {cards.length > 0 ? cards.map((c, i) => <DeckCard key={i} id={c} index={i} win={hand !== null && hand !== 'high'} />) : null}
        </div>
        <p style={{ fontWeight: 800, minHeight: '1.6rem' }}>{hand ? t(`pp_${hand}` as never) : ''}</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.2rem', fontSize: '0.9rem' }}>
          {HANDS.map((h) => (
            <li key={h} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: hand === h ? 800 : 400, color: hand === h ? '#ffd84d' : undefined }}>
              <span>{t(`pp_${h}` as never)}</span>
              <span>{PAIR_PLUS_PAYS[h]}×</span>
            </li>
          ))}
        </ul>
      </div>
      <StakeBox r={r} currency={currency} rtp={97.68}>
        <button type="button" className="btn btn-gold wheel-spin" disabled={r.busy} onClick={() => void r.play({})}>
          {r.busy ? t('playing') : t('deal')}
        </button>
      </StakeBox>
    </div>
  );
}
