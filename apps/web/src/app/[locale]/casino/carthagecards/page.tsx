import { GameGate } from '@/components/game/GameGate';
import { CarthageCardsGame } from '@/components/game/CarthageCardsGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalCarthageCardsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="carthagecards"
      titleKey="carthagecardsTitle"
      subtitleKey="carthagecardsSubtitle"
      render={({ currency, balanceMinor }) => <CarthageCardsGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
