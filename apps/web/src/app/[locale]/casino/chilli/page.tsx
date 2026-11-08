import { GameGate } from '@/components/game/GameGate';
import { HannibalChilliGame } from '@/components/game/HannibalChilliGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalChilliPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="chilli"
      titleKey="chilliTitle"
      subtitleKey="chilliSubtitle"
      render={({ currency, balanceMinor }) => <HannibalChilliGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
