import { GameGate } from '@/components/game/GameGate';
import { JewelRouletteGame } from '@/components/game/JewelRouletteGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalJewelRoulettePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="jewelroulette"
      titleKey="jewelrouletteTitle"
      subtitleKey="jewelrouletteSubtitle"
      render={({ currency, balanceMinor }) => <JewelRouletteGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
