import { GameGate } from '@/components/game/GameGate';
import { CandyBurstGame } from '@/components/game/CandyBurstGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalCandyBurstPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="candyburst"
      titleKey="candyburstTitle"
      subtitleKey="candyburstSubtitle"
      render={({ currency, balanceMinor }) => <CandyBurstGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
