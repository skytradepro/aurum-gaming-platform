'use client';

import '@/styles/sportsbook.css';
import { useCallback } from 'react';
import type { ReactNode } from 'react';
import { SlipFab } from './sports/SlipFab';
import { BetSlip } from './BetSlip';
import type { BetRulesDTO } from './BetSlip';
import { FootballMatches, rowPrices } from './FootballMatches';
import type { FootballMatch, FootballReply } from './FootballMatches';
import { slip, useSlip } from '@/lib/sports-slip';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';

/** Matches with their prices on the left, the bet slip on the right (below on a phone). Pre-match board or live board. */
export function SportsBoard({
  initial,
  locale,
  currency,
  rules,
  balanceMinor,
  side,
  mode = 'fixtures',
}: {
  initial: FootballReply;
  locale: string;
  currency: CurrencyDTO | null;
  rules: BetRulesDTO | null;
  balanceMinor: string | null;
  side?: ReactNode;
  mode?: 'fixtures' | 'live';
}) {
  const items = useSlip();
  const t = useTranslations('sbk');

  const toggle = useCallback((m: FootballMatch, pick: 'home' | 'draw' | 'away') => {
    const p = rowPrices(m);
    if (!p || p.suspended) return;
    slip.toggle({ fixtureId: m.id, market: 'match_winner', pick, lineX10: null, oddsX100: p[pick], home: m.home.name, away: m.away.name, league: m.league, live: p.live, kickoff: m.kickoff });
  }, []);

  const onMatches = useCallback((list: FootballMatch[]) => {
    for (const m of list) {
      const p = rowPrices(m);
      if (!p || p.suspended) continue;
      slip.follow(
        m.id,
        (['home', 'draw', 'away'] as const).map((pick) => ({ market: 'match_winner' as const, pick, lineX10: null, oddsX100: p[pick] })),
        p.live,
      );
    }
  }, []);

  const selected = (id: number) => {
    const s = items.find((i) => i.fixtureId === id);
    return s && s.market === 'match_winner' ? (s.pick as 'home' | 'draw' | 'away') : undefined;
  };

  return (
    <div className="sbk-layout">
      <div className="sbk-main">
        <FootballMatches mode={mode} initial={initial} locale={locale} bet={{ selected, toggle, onMatches }} />
      </div>
      <div className="sports-aside sbk-aside">
        <BetSlip currency={currency} rules={rules} balanceMinor={balanceMinor} locale={locale} />
        {side}
      </div>
      <SlipFab count={items.length} label={t('slipShort')} />
    </div>
  );
}
