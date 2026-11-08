import { GameGate } from '@/components/game/GameGate';
import { ReelSlotGame } from '@/components/game/ReelSlotGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function UltimateStrikerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="ultimatestriker"
      titleKey="ultimatestrikerTitle"
      subtitleKey="ultimatestrikerSubtitle"
      render={({ currency, balanceMinor }) => <ReelSlotGame game="ultimatestriker" currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
