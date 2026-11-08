import { GameGate } from '@/components/game/GameGate';
import { DeepCatchGame } from '@/components/game/DeepCatchGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalDeepCatchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="deepcatch"
      titleKey="deepcatchTitle"
      subtitleKey="deepcatchSubtitle"
      render={({ currency, balanceMinor }) => <DeepCatchGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
