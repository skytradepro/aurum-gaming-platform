import { GoldRushGame } from '@/components/game/GoldRushGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function GoldRushPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="goldrush"
      titleKey="goldrushTitle"
      subtitleKey="goldrushSubtitle"
      render={({ currency, balanceMinor }) => <GoldRushGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
