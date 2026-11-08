'use client';

import { FOREST_HOWL_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Original HANNIBAL forest symbols (public/media/games/foresthowl), lowest paying first; the wolf is WILD and the moon is SCATTER. */
const SYMBOL_FILES = ['feather', 'paw', 'arrow', 'pinecone', 'dreamcatcher', 'totem', 'crystal', 'wolf', 'moon'] as const;

const THEME: TumbleTheme = {
  id: 'foresthowl',
  ns: 'forestHowl',
  title: 'HANNIBAL Forest Howl',
  config: FOREST_HOWL_CONFIG,
  className: 'theme-howl',
  renderSymbol: (id, title) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cb-sym" src={`/media/games/foresthowl/${SYMBOL_FILES[id] ?? 'feather'}.svg`} alt={title ?? ''} draggable={false} />
  ),
};

export function ForestHowlGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  return <TumbleGame theme={THEME} {...props} />;
}
