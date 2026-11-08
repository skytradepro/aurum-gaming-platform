import { DragonTigerGame } from '@/components/game/CardGames';
import { GameGate } from '@/components/game/GameGate';
import { isLocale } from '@aurum/i18n';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

export default async function DragonTigerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  return (
    <GameGate
      locale={locale}
      game="dragontiger"
      titleKey="dragontigerTitle"
      subtitleKey="dragontigerSubtitle"
      render={({ currency, balanceMinor }) => <DragonTigerGame currency={currency} locale={locale} initialBalanceMinor={balanceMinor} />}
    />
  );
}
