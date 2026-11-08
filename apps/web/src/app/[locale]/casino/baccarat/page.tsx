import { BaccaratGame } from '@/components/game/CardGames';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function BaccaratPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="baccarat"
      titleKey="baccaratTitle"
      subtitleKey="baccaratSubtitle"
      render={({ currency, balanceMinor }) => <BaccaratGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
