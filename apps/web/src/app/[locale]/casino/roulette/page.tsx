import { RouletteGame } from '@/components/game/RouletteGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function RoulettePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="roulette"
      titleKey="rouletteTitle"
      subtitleKey="rouletteSubtitle"
      render={({ currency, balanceMinor }) => <RouletteGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
