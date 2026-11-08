'use client';

import { CANDY_CONFIG } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { CandyDefs, CandySymbol } from './CandySymbols';
import { TumbleGame, type TumbleTheme } from './TumbleGame';

const THEME: TumbleTheme = {
  id: 'candyburst',
  ns: 'candyBurst',
  title: 'HANNIBAL Candy Burst',
  config: CANDY_CONFIG,
  className: 'theme-candy',
  renderSymbol: (id, title) => <CandySymbol id={id} title={title} />,
  defs: <CandyDefs />,
};

export function CandyBurstGame(props: { currency: CurrencyDTO; locale: string; initialBalanceMinor: string }) {
  return <TumbleGame theme={THEME} {...props} />;
}
