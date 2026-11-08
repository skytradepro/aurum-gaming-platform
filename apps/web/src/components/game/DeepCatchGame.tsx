'use client';

import { DEEP_CATCH_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Original HANNIBAL fishing symbols (public/media/games/deepcatch), lowest paying first; the golden hook is WILD. */
const SYMBOL_FILES = ['bobber', 'lure', 'reel', 'anchor', 'clownfish', 'tuna', 'puffer', 'bass', 'hook'] as const;

const THEME: TumbleTheme = {
  id: 'deepcatch',
  ns: 'deepCatch',
  title: 'HANNIBAL Deep Catch',
  config: DEEP_CATCH_CONFIG,
  className: 'theme-deepcatch',
  renderSymbol: (id, title) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cb-sym" src={`/media/games/deepcatch/${SYMBOL_FILES[id] ?? 'bobber'}.svg`} alt={title ?? ''} draggable={false} />
  ),
};

export function DeepCatchGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  return <TumbleGame theme={THEME} {...props} />;
}
