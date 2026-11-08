import { GameGate } from '@/components/game/GameGate';
import { SevenOrchardGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalSevenOrchardPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="sevenorchard"
      titleKey="sevenorchardTitle"
      subtitleKey="sevenorchardSubtitle"
      render={({ currency, balanceMinor }) => <SevenOrchardGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
