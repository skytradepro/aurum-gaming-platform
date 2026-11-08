import { GameGate } from '@/components/game/GameGate';
import { ForestHowlGame } from '@/components/game/ForestHowlGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalForestHowlPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="foresthowl"
      titleKey="foresthowlTitle"
      subtitleKey="foresthowlSubtitle"
      render={({ currency, balanceMinor }) => <ForestHowlGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
