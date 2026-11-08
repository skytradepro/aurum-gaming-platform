'use client';

import { TIDAL_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Original HANNIBAL sea symbols (public/media/games/tidal), lowest paying first; the treasure chest is the scatter. */
const SYMBOL_FILES = ['pearl', 'shell', 'coral', 'jellyfish', 'turtle', 'trident', 'crown', 'treasure'] as const;

const THEME: TumbleTheme = {
  id: 'tidal',
  ns: 'tidalTreasure',
  title: 'HANNIBAL Tidal Treasure',
  config: TIDAL_CONFIG,
  className: 'theme-tidal',
  renderSymbol: (id, title) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cb-sym" src={`/media/games/tidal/${SYMBOL_FILES[id] ?? 'pearl'}.svg`} alt={title ?? ''} draggable={false} />
  ),
};

export function TidalTreasureGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  return <TumbleGame theme={THEME} {...props} />;
}
