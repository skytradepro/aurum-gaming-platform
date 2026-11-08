'use client';

import { DESERT_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Original HANNIBAL temple symbols (public/media/games/desert), lowest paying first. */
const SYMBOL_FILES = ['scarab', 'eye', 'ankh', 'pyramid', 'gold-mask', 'ruby', 'gold-coin', 'crown'] as const;

export function DesertRichesGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('desertRiches');
  const theme = useMemo<TumbleTheme>(
    () => ({
      id: 'desert',
      ns: 'desertRiches',
      title: 'HANNIBAL Desert Riches',
      config: DESERT_CONFIG,
      className: 'theme-desert',
      renderSymbol: (id, title) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cb-sym" src={`/media/games/desert/${SYMBOL_FILES[id] ?? 'scarab'}.svg`} alt={title ?? ''} draggable={false} />
      ),
      header: (
        <div className="dr-header">
          <span className="dr-eyebrow">{t('eyebrow')}</span>
          <h2 className="dr-title">
            DESERT <em>RICHES</em>
          </h2>
          <div className="dr-tags">
            <span>✦ {t('tagGrid')}</span>
            <span>✦ {t('tagTumble')}</span>
            <span>✦ {t('tagOriginal')}</span>
          </div>
        </div>
      ),
    }),
    [t],
  );
  return <TumbleGame theme={theme} {...props} />;
}
