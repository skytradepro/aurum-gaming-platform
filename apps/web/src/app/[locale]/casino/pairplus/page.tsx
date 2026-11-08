import { PairPlusGame } from '@/components/game/PairPlusGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function PairPlusPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="pairplus"
      titleKey="pairplusTitle"
      subtitleKey="pairplusSubtitle"
      render={({ currency, balanceMinor }) => <PairPlusGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
