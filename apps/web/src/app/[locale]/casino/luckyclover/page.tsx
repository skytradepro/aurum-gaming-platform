import { GameGate } from '@/components/game/GameGate';
import { LuckyCloverGame } from '@/components/game/LuckyCloverGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalLuckyCloverPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="luckyclover"
      titleKey="luckycloverTitle"
      subtitleKey="luckycloverSubtitle"
      render={({ currency, balanceMinor }) => <LuckyCloverGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
