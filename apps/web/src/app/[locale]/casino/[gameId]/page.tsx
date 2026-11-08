import { GameGate } from '@/components/game/GameGate';
import { Batch21LineGame } from '@/components/game/Batch21LineGame';
import { isLocale } from '@aurum/i18n';
import { BATCH21_SLOT_IDS, isBatch21SlotId } from '@aurum/shared';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return BATCH21_SLOT_IDS.flatMap((gameId) =>
    ['en', 'fr', 'ar', 'tr', 'ru'].map((locale) => ({ locale, gameId })),
  );
}

export default async function Batch21CasinoPage({ params }: { params: Promise<{ locale: string; gameId: string }> }) {
  const { locale, gameId } = await params;
  if (!isLocale(locale) || !isBatch21SlotId(gameId)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game={gameId}
      titleKey={`${gameId}Title`}
      subtitleKey={`${gameId}Subtitle`}
      render={({ currency, balanceMinor }) => (
        <Batch21LineGame gameId={gameId} currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />
      )}
    />
  );
}
