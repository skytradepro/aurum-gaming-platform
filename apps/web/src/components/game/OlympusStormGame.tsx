'use client';

import { OLYMPUS_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

/** Original HANNIBAL Olympus symbols (public/media/games/olympusstorm), lowest paying first; the lightning bolt is WILD. */
const SYMBOL_FILES = ['coin', 'amphora', 'laurel', 'helmet', 'sapphire', 'ruby', 'eagle', 'trident', 'crown', 'bolt'] as const;

const THEME: TumbleTheme = {
  id: 'olympusstorm',
  ns: 'olympusStorm',
  title: 'HANNIBAL Olympus Storm',
  config: OLYMPUS_CONFIG,
  className: 'theme-olympus',
  renderSymbol: (id, title) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="cb-sym" src={`/media/games/olympusstorm/${SYMBOL_FILES[id] ?? 'coin'}.svg`} alt={title ?? ''} draggable={false} />
  ),
};

export function OlympusStormGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  return <TumbleGame theme={THEME} {...props} />;
}
