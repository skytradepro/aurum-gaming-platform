import { GameGate } from '@/components/game/GameGate';
import { GenieLampGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalGenieLampPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="genielamp"
      titleKey="genielampTitle"
      subtitleKey="genielampSubtitle"
      render={({ currency, balanceMinor }) => <GenieLampGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
