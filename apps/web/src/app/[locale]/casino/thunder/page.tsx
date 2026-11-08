import { GameGate } from '@/components/game/GameGate';
import { ScatterGame } from '@/components/game/ScatterGame';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function ThunderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="thunder"
      titleKey="thunderTitle"
      subtitleKey="thunderSubtitle"
      render={({ currency, balanceMinor }) => <ScatterGame theme="thunder" currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
