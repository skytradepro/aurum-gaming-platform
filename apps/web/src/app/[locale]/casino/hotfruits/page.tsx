import { GameGate } from '@/components/game/GameGate';
import { GoldRushGame } from '@/components/game/GoldRushGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HotFruitsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="hotfruits"
      titleKey="hotfruitsTitle"
      subtitleKey="hotfruitsSubtitle"
      render={({ currency, balanceMinor }) => <GoldRushGame theme="hotfruits" currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
