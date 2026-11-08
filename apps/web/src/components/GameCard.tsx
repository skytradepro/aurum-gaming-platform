'use client';

import type { GameItem } from '@/lib/types';
import { useRouter } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { GameArt } from './GameArt';
import { Icon } from './Icon';

export const LAUNCH_EVENT = 'aurum-launch-game';

export function GameCard({ game, index = 0 }: { game: GameItem; index?: number }) {
  const t = useTranslations('common');
  const router = useRouter();
  const provider = game.art.source === 'aggregator';
  const playPath = `/casino/play/${game.slug}`;

  return (
    <button
      type="button"
      className="game-card"
      style={{ ['--i' as string]: Math.min(index, 16) }}
      aria-label={`${t('play')}: ${game.name}`}
      onPointerEnter={provider ? () => router.prefetch(playPath) : undefined}
      onClick={() => (provider ? router.push(playPath) : window.dispatchEvent(new CustomEvent(LAUNCH_EVENT, { detail: game })))}
    >
      <div className="game-thumb">
        <GameArt game={game} />
        <div className="game-badges">
          <span>
            {game.isNew ? <span className="badge badge-new">{t('new')}</span> : game.isFeatured ? <span className="badge badge-hot">{t('hot')}</span> : null}
          </span>
          {game.isDemo ? <span className="badge badge-demo">{t('demo')}</span> : null}
        </div>
        <div className="game-play">
          <span>
            <Icon name="play" className="flip-rtl" />
          </span>
        </div>
      </div>
      <div className="game-info">
        <p className="game-name" title={game.name}>
          {game.name}
        </p>
        <p className="game-provider">{game.provider.name}</p>
      </div>
    </button>
  );
}
