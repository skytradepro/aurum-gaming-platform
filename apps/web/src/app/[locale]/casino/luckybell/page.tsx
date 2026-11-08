import { GameGate } from '@/components/game/GameGate';
import { LuckyBellGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function LuckyBellPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="luckybell"
      titleKey="luckybellTitle"
      subtitleKey="luckybellSubtitle"
      render={({ currency, balanceMinor }) => <LuckyBellGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
