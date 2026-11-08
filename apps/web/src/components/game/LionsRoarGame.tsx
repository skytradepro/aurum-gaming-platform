'use client';

import { LIONS_ROAR_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Original HANNIBAL lion-temple symbols (public/media/games/lionsroar), lowest paying first. */
const SYMBOL_FILES = ['helmet', 'coin', 'chalice', 'shield', 'temple', 'emerald', 'crown', 'lion'] as const;

export function LionsRoarGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  const t = useTranslations('lionsRoar');
  const theme = useMemo<TumbleTheme>(
    () => ({
      id: 'lionsroar',
      ns: 'lionsRoar',
      title: "HANNIBAL Lion's Roar",
      config: LIONS_ROAR_CONFIG,
      className: 'theme-lion',
      renderSymbol: (id, title) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cb-sym" src={`/media/games/lionsroar/${SYMBOL_FILES[id] ?? 'helmet'}.svg`} alt={title ?? ''} draggable={false} />
      ),
      header: (
        <div className="dr-header lr-header">
          <span className="dr-eyebrow">{t('eyebrow')}</span>
          <h2 className="dr-title">
            LION&rsquo;S <em>ROAR</em>
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
