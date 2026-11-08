import { DiceGame } from '@/components/game/DiceGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function DicePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="dice"
      titleKey="diceTitle"
      subtitleKey="diceSubtitle"
      render={({ currency, balanceMinor }) => <DiceGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
