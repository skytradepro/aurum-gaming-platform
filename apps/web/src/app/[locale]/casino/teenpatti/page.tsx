import { GameGate } from '@/components/game/GameGate';
import { TeenPattiGame } from '@/components/game/LiveCardGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalTeenPattiPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="teenpatti"
      titleKey="teenpattiTitle"
      subtitleKey="teenpattiSubtitle"
      render={({ currency, balanceMinor }) => <TeenPattiGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
