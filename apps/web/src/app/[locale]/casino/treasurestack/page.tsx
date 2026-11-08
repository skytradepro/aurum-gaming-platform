import { GameGate } from '@/components/game/GameGate';
import { TreasureStackGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalTreasureStackPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="treasurestack"
      titleKey="treasurestackTitle"
      subtitleKey="treasurestackSubtitle"
      render={({ currency, balanceMinor }) => <TreasureStackGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
