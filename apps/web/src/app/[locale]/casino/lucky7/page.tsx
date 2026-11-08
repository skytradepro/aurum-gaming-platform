import { GameGate } from '@/components/game/GameGate';
import { Lucky7Game } from '@/components/game/LiveCardGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalLucky7Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="lucky7"
      titleKey="lucky7Title"
      subtitleKey="lucky7Subtitle"
      render={({ currency, balanceMinor }) => <Lucky7Game currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
