'use client';

import { Link } from '@/i18n/routing';
import { COVER_OF } from '@/lib/originals';
import { useState } from 'react';

export interface LiveTable {
  id: string;
  title: string;
  isNew: boolean;
}

/** Colour band under each table tile (like a studio colour per table). */
const BANDS: Record<string, string> = {
  carthagecards: '#15803d',
  wheel: '#7c3aed',
  roulette: '#b91c1c',
  dragontiger: '#c2410c',
  baccarat: '#0f766e',
  sicbo: '#1d4ed8',
  pairplus: '#be185d',
  andarbahar: '#a16207',
  casinowar: '#991b1b',
  jewelroulette: '#0e7490',
  lucky7: '#16a34a',
  teenpatti: '#e11d48',
  crazytime: '#a21caf',
  thunderroulette: '#1e40af',
  blackjack: '#047857',
};
type Kind = 'shows' | 'roulette' | 'cards' | 'dice';
const KIND: Record<string, Kind> = { crazytime: 'shows', wheel: 'shows', roulette: 'roulette', jewelroulette: 'roulette', thunderroulette: 'roulette', sicbo: 'dice' };
type Filter = 'all' | Kind;

/** Live-casino lobby: the Hannibal Play tables as large picture tiles, with a filter row. */
export function LiveTables({ tables, labels }: { tables: LiveTable[]; labels: { all: string; shows: string; roulette: string; cards: string; dice: string; count: string; studio: string; isNew: string; play: string } }) {
  const [filter, setFilter] = useState<Filter>('all');
  const kindOf = (id: string): Kind => KIND[id] ?? 'cards';
  const shown = tables.filter((t) => filter === 'all' || kindOf(t.id) === filter);
  const filters: Filter[] = (['all', 'shows', 'roulette', 'cards', 'dice'] as const).filter((f) => f === 'all' || tables.some((t) => kindOf(t.id) === f));
  return (
    <section className="lt-wrap">
      <div className="lt-bar" role="tablist">
        {filters.map((f) => (
          <button key={f} type="button" role="tab" aria-selected={filter === f} className={filter === f ? 'lt-chip on' : 'lt-chip'} onClick={() => setFilter(f)}>
            {labels[f]}
            <sup>{f === 'all' ? tables.length : tables.filter((t) => kindOf(t.id) === f).length}</sup>
          </button>
        ))}
      </div>
      <div className="lt-grid">
        {shown.map((t, i) => (
          <Link key={t.id} href={`/casino/${t.id}`} className="lt-tile" style={{ ['--band' as string]: BANDS[t.id] ?? '#7c2d12', ['--i' as string]: i }} aria-label={t.title}>
            <span className="lt-media">
              {COVER_OF[t.id] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={COVER_OF[t.id]} alt="" loading={i < 8 ? 'eager' : 'lazy'} draggable={false} />
              ) : null}
              {t.isNew ? <span className="lt-new">{labels.isNew}</span> : null}
              <span className="lt-play" aria-hidden="true">
                ▶
              </span>
            </span>
            <span className="lt-band">
              <strong>{t.title.replace(/^(Hannibal|حنبعل)\s+/i, '')}</strong>
              <small>{labels.studio}</small>
            </span>
          </Link>
        ))}
      </div>
      <p className="lt-count">{labels.count}</p>
    </section>
  );
}
