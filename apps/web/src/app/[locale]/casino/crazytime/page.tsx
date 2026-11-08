import { GameGate } from '@/components/game/GameGate';
import { CrazyTimeGame } from '@/components/game/CrazyTimeGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function CrazyTimeHannibalPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="crazytime"
      titleKey="crazytimeTitle"
      subtitleKey="crazytimeSubtitle"
      render={({ currency, balanceMinor }) => <CrazyTimeGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
