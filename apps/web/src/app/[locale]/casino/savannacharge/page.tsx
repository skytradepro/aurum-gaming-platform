import { GameGate } from '@/components/game/GameGate';
import { SavannaChargeGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalSavannaChargePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="savannacharge"
      titleKey="savannachargeTitle"
      subtitleKey="savannachargeSubtitle"
      render={({ currency, balanceMinor }) => <SavannaChargeGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
