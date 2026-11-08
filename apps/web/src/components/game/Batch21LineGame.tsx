'use client';

import { isBatch21SlotId, type Batch21SlotId } from '@aurum/shared';
import type { CurrencyDTO } from '@/lib/types';
import { batch21LineTheme } from '@/lib/batch21-line-themes';
import { LineGame } from './LineGame';

type Props = { gameId: Batch21SlotId; currency: CurrencyDTO; locale: string; initialBalanceMinor: string };

export function Batch21LineGame({ gameId, currency, locale, initialBalanceMinor }: Props) {
  if (!isBatch21SlotId(gameId)) return null;
  return <LineGame theme={batch21LineTheme(gameId)} currency={currency} locale={locale} initialBalanceMinor={initialBalanceMinor} />;
}
