'use client';

import { VESUVIUS_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Original HANNIBAL Roman symbols (public/media/games/vesuvius), lowest paying first; the volcano is WILD. */
const SYMBOL_FILES = ['coin', 'scroll', 'torch', 'gladius', 'shield', 'helmet', 'colosseum', 'eagle', 'volcano'] as const;

const THEME: TumbleTheme = {
  id: 'vesuvius',
  ns: 'vesuviusFury',
  title: 'HANNIBAL Vesuvius Fury',
  config: VESUVIUS_CONFIG,
  className: 'theme-vesuvius',
  renderSymbol: (id, title) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cb-sym" src={`/media/games/vesuvius/${SYMBOL_FILES[id] ?? 'coin'}.svg`} alt={title ?? ''} draggable={false} />
  ),
};

export function VesuviusFuryGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  return <TumbleGame theme={THEME} {...props} />;
}
