import { GameGate } from '@/components/game/GameGate';
import { LuckyJigGame } from '@/components/game/LineGames';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function HannibalLuckyJigPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="luckyjig"
      titleKey="luckyjigTitle"
      subtitleKey="luckyjigSubtitle"
      render={({ currency, balanceMinor }) => <LuckyJigGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
