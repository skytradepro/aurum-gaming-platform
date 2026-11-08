import { GameGate } from '@/components/game/GameGate';
import { ScatterGame } from '@/components/game/ScatterGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function CandyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="candy"
      titleKey="candyTitle"
      subtitleKey="candySubtitle"
      render={({ currency, balanceMinor }) => <ScatterGame theme="candy" currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
