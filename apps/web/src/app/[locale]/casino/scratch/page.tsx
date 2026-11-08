import { ScratchGame } from '@/components/game/ScratchGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function ScratchPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="scratch"
      titleKey="scratchTitle"
      subtitleKey="scratchSubtitle"
      render={({ currency, balanceMinor }) => <ScratchGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
