import { GameGate } from '@/components/game/GameGate';
import { VesuviusFuryGame } from '@/components/game/VesuviusFuryGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalVesuviusFuryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="vesuvius"
      titleKey="vesuviusTitle"
      subtitleKey="vesuviusSubtitle"
      render={({ currency, balanceMinor }) => <VesuviusFuryGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
