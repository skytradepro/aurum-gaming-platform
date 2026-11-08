import { GameGate } from '@/components/game/GameGate';
import { OlympusStormGame } from '@/components/game/OlympusStormGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalOlympusStormPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="olympusstorm"
      titleKey="olympusstormTitle"
      subtitleKey="olympusstormSubtitle"
      render={({ currency, balanceMinor }) => <OlympusStormGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
