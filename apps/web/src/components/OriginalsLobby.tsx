'use client';

import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { COVER_OF } from '@/lib/originals';
import { GameArt } from './GameArt';
import { Icon } from './Icon';

export type OriginalGame = {
  id: string;
  title: string;
  tile: string;
  category: 'slots' | 'table' | 'crash' | 'instant';
  hue: number;
  featured?: boolean;
  isNew?: boolean;
};

type Tab = 'all' | 'featured' | 'new' | 'slots' | 'table' | 'crash' | 'instant';
const TABS: Tab[] = ['all', 'featured', 'new', 'slots', 'table', 'crash', 'instant'];

function Card({ g, index }: { g: OriginalGame; index: number }) {
  const t = useTranslations('games');
  return (
    <Link href={`/casino/${g.id}`} className="game-card" style={{ ['--i' as string]: Math.min(index, 16) }} aria-label={g.title}>
      <div className="game-thumb">
        <GameArt
          game={{
            id: g.id,
            slug: g.id,
            name: g.title,
            category: g.category === 'instant' ? 'other' : g.category,
            thumbnail: null,
            art: COVER_OF[g.id] ? { hue: g.hue, title: g.title, image: COVER_OF[g.id] } : { hue: g.hue, title: g.title },
          }}
        />
        <div className="game-badges">
          <span>{g.isNew ? <span className="badge badge-new">{t('badgeNew')}</span> : g.featured ? <span className="badge badge-hot">{t('badgeHot')}</span> : null}</span>
        </div>
        <div className="game-play">
          <span>
            <Icon name="play" className="flip-rtl" />
          </span>
        </div>
      </div>
      <div className="game-info">
        <p className="game-name" title={g.title}>
          {g.title}
        </p>
        <p className="game-provider">{t('byHannibal')}</p>
      </div>
    </Link>
  );
}

export function OriginalsGrid({ games }: { games: OriginalGame[] }) {
  return (
    <div className="grid-games">
      {games.map((g, i) => (
        <Card key={g.id} g={g} index={i} />
      ))}
    </div>
  );
}

export function OriginalsLobby({ games, hideSearch }: { games: OriginalGame[]; hideSearch?: boolean }) {
  const t = useTranslations('games');
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return games.filter((g) => {
      if (needle && !`${g.title} ${g.tile}`.toLowerCase().includes(needle)) return false;
      if (tab === 'all') return true;
      if (tab === 'featured') return !!g.featured;
      if (tab === 'new') return !!g.isNew;
      return g.category === tab;
    });
  }, [games, tab, q]);

  return (
    <section>
      <div className="casino-tabs" role="tablist" aria-label={t('lobbyTabs')}>
        {TABS.map((key) => (
          <button key={key} type="button" role="tab" className="casino-tab" aria-selected={tab === key} onClick={() => setTab(key)}>
            {t(`tab_${key}`)}
          </button>
        ))}
      </div>
      {hideSearch ? (
        <p className="muted" style={{ margin: '0 0 0.75rem' }}>
          {t('gamesCount', { count: shown.length })}
        </p>
      ) : (
        <div className="casino-toolbar">
          <div className="search-box">
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchGames')} aria-label={t('searchGames')} />
          </div>
          <span style={{ color: 'var(--text-muted)' }}>{t('gamesCount', { count: shown.length })}</span>
        </div>
      )}
      {shown.length === 0 ? (
        <div className="empty-state">{t('noGames')}</div>
      ) : (
        <div className="grid-games">
          {shown.map((g, i) => (
            <Card key={g.id} g={g} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
