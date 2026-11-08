'use client';

import type { GameItem } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LAUNCH_EVENT } from './GameCard';
import { GameArt } from './GameArt';

/**
 * Shown when a player clicks a game. No game provider is connected in this build, so a game cannot be
 * launched; the dialog says so honestly instead of faking a game.
 */
export function LaunchDialog() {
  const t = useTranslations('casino');
  const tc = useTranslations('common');
  const [game, setGame] = useState<GameItem | null>(null);

  useEffect(() => {
    const open = (e: Event) => setGame((e as CustomEvent<GameItem>).detail);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGame(null);
    };
    window.addEventListener(LAUNCH_EVENT, open);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener(LAUNCH_EVENT, open);
      window.removeEventListener('keydown', key);
    };
  }, []);

  if (!game) return null;

  return (
    <div className="modal-backdrop" onClick={() => setGame(null)}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={game.name} onClick={(e) => e.stopPropagation()}>
        <div className="modal-art">
          <GameArt game={game} />
        </div>
        <div className="modal-body">
          <h2>
            {game.name} <span className="badge badge-demo">{game.isDemo ? tc('demo') : game.provider.name}</span>
          </h2>
          <strong>{t('launchUnavailableTitle')}</strong>
          <p>{t('launchUnavailableBody')}</p>
          <button type="button" className="btn btn-gold" onClick={() => setGame(null)} autoFocus>
            {tc('close')}
          </button>
        </div>
      </div>
    </div>
  );
}
