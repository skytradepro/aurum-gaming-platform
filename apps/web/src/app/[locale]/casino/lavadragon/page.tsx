import { GameGate } from '@/components/game/GameGate';
import { LavaDragonGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalLavaDragonPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="lavadragon"
      titleKey="lavadragonTitle"
      subtitleKey="lavadragonSubtitle"
      render={({ currency, balanceMinor }) => <LavaDragonGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
