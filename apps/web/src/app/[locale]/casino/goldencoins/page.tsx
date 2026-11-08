import { GameGate } from '@/components/game/GameGate';
import { GoldenCoinsGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function GoldenCoinsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="goldencoins"
      titleKey="goldencoinsTitle"
      subtitleKey="goldencoinsSubtitle"
      render={({ currency, balanceMinor }) => <GoldenCoinsGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
