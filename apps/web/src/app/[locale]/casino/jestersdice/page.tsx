import { GameGate } from '@/components/game/GameGate';
import { JestersDiceGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalJestersDicePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="jestersdice"
      titleKey="jestersdiceTitle"
      subtitleKey="jestersdiceSubtitle"
      render={({ currency, balanceMinor }) => <JestersDiceGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
