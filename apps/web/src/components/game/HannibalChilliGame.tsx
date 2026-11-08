'use client';

import { CHILLI_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Symbols cut from the original HANNIBAL CHILLI key art (public/media/games/chilli), lowest paying first. */
const SYMBOL_FILES = ['j', 'q', 'k', 'a', 'guitar', 'cactus', 'sombrero', 'skull', 'taco', 'pepper', 'wild', 'scatter'] as const;

const THEME: TumbleTheme = {
  id: 'chilli',
  ns: 'hannibalChilli',
  title: 'HANNIBAL Chilli',
  config: CHILLI_CONFIG,
  scatterFreeSpins: { min: 4, count: 5 },
  className: 'theme-chilli',
  renderSymbol: (id, title) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cb-sym cb-tile" src={`/media/games/chilli/${SYMBOL_FILES[id] ?? 'j'}.jpg`} alt={title ?? ''} draggable={false} />
  ),
};

export function HannibalChilliGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  return <TumbleGame theme={THEME} {...props} />;
}
