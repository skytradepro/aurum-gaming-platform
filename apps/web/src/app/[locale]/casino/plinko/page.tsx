import { PlinkoGame } from '@/components/game/PlinkoGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function PlinkoPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="plinko"
      titleKey="plinkoTitle"
      subtitleKey="plinkoSubtitle"
      render={({ currency, balanceMinor }) => <PlinkoGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
