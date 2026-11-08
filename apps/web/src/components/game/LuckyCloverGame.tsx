'use client';

import { LUCKY_CLOVER_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Original HANNIBAL lucky symbols (public/media/games/luckyclover), lowest paying first; the pot of gold is the scatter. */
const SYMBOL_FILES = ['coin', 'horseshoe', 'harp', 'hat', 'rainbow', 'bell', 'clover', 'pot'] as const;

const THEME: TumbleTheme = {
  id: 'luckyclover',
  ns: 'luckyClover',
  title: 'HANNIBAL Lucky Clover',
  config: LUCKY_CLOVER_CONFIG,
  className: 'theme-clover',
  renderSymbol: (id, title) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cb-sym" src={`/media/games/luckyclover/${SYMBOL_FILES[id] ?? 'coin'}.svg`} alt={title ?? ''} draggable={false} />
  ),
};

export function LuckyCloverGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  return <TumbleGame theme={THEME} {...props} />;
}
