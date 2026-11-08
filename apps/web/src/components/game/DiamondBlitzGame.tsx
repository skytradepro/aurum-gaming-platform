'use client';

import { DIAMOND_BLITZ_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Original HANNIBAL gem symbols (public/media/games/diamondblitz), lowest paying first; the gem crown is the scatter. */
const SYMBOL_FILES = ['topaz', 'emerald', 'aquamarine', 'amethyst', 'pink', 'ruby', 'sapphire', 'diamond', 'crown'] as const;

const THEME: TumbleTheme = {
  id: 'diamondblitz',
  ns: 'diamondBlitz',
  title: 'HANNIBAL Diamond Blitz',
  config: DIAMOND_BLITZ_CONFIG,
  className: 'theme-diamond',
  renderSymbol: (id, title) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cb-sym" src={`/media/games/diamondblitz/${SYMBOL_FILES[id] ?? 'topaz'}.svg`} alt={title ?? ''} draggable={false} />
  ),
};

export function DiamondBlitzGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  return <TumbleGame theme={THEME} {...props} />;
}
