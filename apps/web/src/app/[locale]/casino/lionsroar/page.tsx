import { GameGate } from '@/components/game/GameGate';
import { LionsRoarGame } from '@/components/game/LionsRoarGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalLionsRoarPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="lionsroar"
      titleKey="lionsroarTitle"
      subtitleKey="lionsroarSubtitle"
      render={({ currency, balanceMinor }) => <LionsRoarGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
