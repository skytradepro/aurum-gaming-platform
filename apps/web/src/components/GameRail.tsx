'use client';

import { Link } from '@/i18n/routing';
import type { GameItem } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';
import { GameCard } from './GameCard';
import { Icon } from './Icon';
import type { IconName } from './Icon';

const CATALOG_HASH = '#provider-catalog';

export function GameRail({ title, icon, games, href }: { title: string; icon: IconName; games: GameItem[]; href: string }) {
  const t = useTranslations('common');
  const track = useRef<HTMLDivElement>(null);

  if (games.length === 0) return null;

  function scroll(direction: 1 | -1) {
    const el = track.current;
    if (!el) return;
    const rtl = document.documentElement.dir === 'rtl';
    el.scrollBy({ left: direction * (rtl ? -1 : 1) * el.clientWidth * 0.85, behavior: 'smooth' });
  }

  return (
    <section>
      <div className="section-head">
        <h2 className="section-title">
          <Icon name={icon} />
          {title}
        </h2>
        <Link href={href.includes('#') ? href : `${href}${CATALOG_HASH}`} className="section-link">
          {t('viewAll')}
        </Link>
      </div>
      <div className="rail">
        <button type="button" className="rail-btn prev" aria-label={t('scrollLeft')} onClick={() => scroll(-1)}>
          <Icon name="chevronLeft" className="flip-rtl" />
        </button>
        <div className="rail-track" ref={track}>
          {games.map((g, i) => (
            <GameCard key={g.id} game={g} index={i} />
          ))}
        </div>
        <button type="button" className="rail-btn next" aria-label={t('scrollRight')} onClick={() => scroll(1)}>
          <Icon name="chevronRight" className="flip-rtl" />
        </button>
      </div>
    </section>
  );
}
