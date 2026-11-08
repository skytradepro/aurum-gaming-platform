import { RaptorGame } from '@/components/game/RaptorGame';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function RaptorPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="raptor"
      titleKey="raptorTitle"
      subtitleKey="raptorSubtitle"
      render={({ currency, balanceMinor }) => <RaptorGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
