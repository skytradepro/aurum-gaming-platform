import { GameGate } from '@/components/game/GameGate';
import { LionPrideGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalLionPridePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="lionpride"
      titleKey="lionprideTitle"
      subtitleKey="lionprideSubtitle"
      render={({ currency, balanceMinor }) => <LionPrideGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
