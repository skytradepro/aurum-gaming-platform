import '@/styles/thunder-roulette.css';
import { GameGate } from '@/components/game/GameGate';
import { JewelRouletteGame, THUNDER_ROOM } from '@/components/game/JewelRouletteGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalThunderRoulettePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="thunderroulette"
      titleKey="thunderrouletteTitle"
      subtitleKey="thunderrouletteSubtitle"
      render={({ currency, balanceMinor }) => <JewelRouletteGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} room={THUNDER_ROOM} />}
    />
  );
}
