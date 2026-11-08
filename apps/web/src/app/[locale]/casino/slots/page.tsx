import { SlotsGame } from '@/components/game/SlotsGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function SlotsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="slots"
      titleKey="slotsTitle"
      subtitleKey="slotsSubtitle"
      render={({ currency, balanceMinor }) => <SlotsGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
