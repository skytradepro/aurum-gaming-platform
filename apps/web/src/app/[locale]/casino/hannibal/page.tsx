import { GameGate } from '@/components/game/GameGate';
import { HannibalTriumphGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalTriumphPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="hannibal"
      titleKey="hannibalTitle"
      subtitleKey="hannibalSubtitle"
      render={({ currency, balanceMinor }) => <HannibalTriumphGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
