import { GameGate } from '@/components/game/GameGate';
import { IceFortuneGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalIceFortunePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="icefortune"
      titleKey="icefortuneTitle"
      subtitleKey="icefortuneSubtitle"
      render={({ currency, balanceMinor }) => <IceFortuneGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
